const express = require('express');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { buildLeadScope } = require('../lib/leadAccess');
const { getConfig } = require('../lib/config');

const router = express.Router();
router.use(requireAuth);

const CLOSURE_STAGE = 'closure';

// Indian financial year (Apr 1 – Mar 31), labelled like "2026-27".
function currentFy(d = new Date()) {
  const y = d.getFullYear();
  const startYear = d.getMonth() >= 3 ? y : y - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}
function fyBounds(fy) {
  const startYear = parseInt(String(fy).slice(0, 4), 10);
  return { start: new Date(startYear, 3, 1, 0, 0, 0), end: new Date(startYear + 1, 2, 31, 23, 59, 59, 999) };
}

// GET /api/targets?fy= — list targets for a FY (Super Admin).
router.get('/', requireRole('SUPER_ADMIN'), async (req, res) => {
  const fy = req.query.fy || currentFy();
  const targets = await prisma.target.findMany({ where: { tenantId: req.tenantId, fy } });
  res.json({ fy, currentFy: currentFy(), targets });
});

// PUT /api/targets — bulk upsert targets for a FY (Super Admin). Amount <= 0 removes it.
router.put('/', requireRole('SUPER_ADMIN'), async (req, res) => {
  const { fy, targets } = req.body || {};
  if (!fy || !Array.isArray(targets)) return res.status(400).json({ error: 'fy and targets[] are required' });
  for (const t of targets) {
    const dimension = t.dimension;
    if (!['OVERALL', 'REGION', 'FUNNEL', 'USER'].includes(dimension)) continue;
    const refKey = dimension === 'OVERALL' ? '' : String(t.refKey ?? '');
    const amount = Number(t.amount) || 0;
    if (amount > 0) {
      await prisma.target.upsert({
        where: { tenantId_fy_dimension_refKey: { tenantId: req.tenantId, fy, dimension, refKey } },
        create: { tenantId: req.tenantId, fy, dimension, refKey, amount },
        update: { amount },
      });
    } else {
      await prisma.target.deleteMany({ where: { tenantId: req.tenantId, fy, dimension, refKey } });
    }
  }
  const saved = await prisma.target.findMany({ where: { tenantId: req.tenantId, fy } });
  res.json({ fy, targets: saved });
});

// Funnels granted to this user. Super Admin is unscoped (null).
async function funnelIdsFor(req) {
  if (req.user.role === 'SUPER_ADMIN') return null;
  const u = await prisma.user.findFirst({
    where: { id: req.user.id, tenantId: req.tenantId },
    select: { funnelAccess: { select: { id: true } } },
  });
  return u ? u.funnelAccess.map((f) => f.id) : [];
}

function bump(map, key, patch) {
  const row = map.get(key) || { leads: 0, tcv: 0, closedCount: 0, achieved: 0 };
  row.leads += patch.leads || 0;
  row.tcv += patch.tcv || 0;
  row.closedCount += patch.closedCount || 0;
  row.achieved += patch.achieved || 0;
  map.set(key, row);
}

// GET /api/targets/analysis?fy= — pipeline and FY closures, scoped to the caller.
// Super Admin also receives per-person rows and every target. Other roles see
// only the leads they can already open, and only the target that applies to them.
router.get('/analysis', async (req, res) => {
  const fy = req.query.fy || currentFy();
  const { start, end } = fyBounds(fy);
  const funnelIds = await funnelIdsFor(req);
  const scope = { AND: [{ tenantId: req.tenantId }, buildLeadScope(req.user, funnelIds)] };
  const closedWhere = { AND: [...scope.AND, { stage: CLOSURE_STAGE, closedAt: { gte: start, lte: end } }] };
  const isAdmin = req.user.role === 'SUPER_ADMIN';
  const seesOrganisation = isAdmin || (req.user.role === 'MANAGER' && !req.user.region && !(funnelIds && funnelIds.length));

  const [cfg, targets, pipeline, closedOverall, byStage, pipeRegion, pipeFunnel, closedRegion, closedFunnel, closedUser] = await Promise.all([
    getConfig(req.tenantId),
    prisma.target.findMany({ where: { tenantId: req.tenantId, fy } }),
    prisma.lead.aggregate({ where: scope, _count: { _all: true }, _sum: { totalContractValue: true } }),
    prisma.lead.aggregate({ where: closedWhere, _count: { _all: true }, _sum: { totalContractValue: true } }),
    prisma.lead.groupBy({ by: ['stage'], where: scope, _count: { _all: true }, _sum: { totalContractValue: true } }),
    prisma.lead.groupBy({ by: ['region'], where: scope, _count: { _all: true }, _sum: { totalContractValue: true } }),
    prisma.lead.groupBy({ by: ['funnelId'], where: scope, _count: { _all: true }, _sum: { totalContractValue: true } }),
    prisma.lead.groupBy({ by: ['region'], where: closedWhere, _count: { _all: true }, _sum: { totalContractValue: true } }),
    prisma.lead.groupBy({ by: ['funnelId'], where: closedWhere, _count: { _all: true }, _sum: { totalContractValue: true } }),
    isAdmin
      ? prisma.lead.groupBy({ by: ['ownerId'], where: closedWhere, _count: { _all: true }, _sum: { totalContractValue: true } })
      : Promise.resolve([]),
  ]);

  const tget = (dim, key) => {
    const t = targets.find((x) => x.dimension === dim && x.refKey === String(key));
    return t ? t.amount : 0;
  };

  const regionMap = new Map();
  for (const row of pipeRegion) bump(regionMap, row.region || '', { leads: row._count._all, tcv: row._sum.totalContractValue || 0 });
  for (const row of closedRegion) bump(regionMap, row.region || '', { closedCount: row._count._all, achieved: row._sum.totalContractValue || 0 });
  const funnelMap = new Map();
  for (const row of pipeFunnel) bump(funnelMap, row.funnelId == null ? '' : String(row.funnelId), { leads: row._count._all, tcv: row._sum.totalContractValue || 0 });
  for (const row of closedFunnel) bump(funnelMap, row.funnelId == null ? '' : String(row.funnelId), { closedCount: row._count._all, achieved: row._sum.totalContractValue || 0 });

  if (seesOrganisation) {
    targets.filter((t) => t.dimension === 'REGION' && t.refKey).forEach((t) => bump(regionMap, t.refKey, {}));
    targets.filter((t) => t.dimension === 'FUNNEL' && t.refKey).forEach((t) => bump(funnelMap, t.refKey, {}));
  }

  const funnels = await prisma.funnel.findMany({ where: { tenantId: req.tenantId }, select: { id: true, name: true } });
  const fname = Object.fromEntries(funnels.map((f) => [String(f.id), f.name]));
  const sortByAch = (a, b) => (b.achieved - a.achieved) || (b.leads - a.leads);

  const regionTarget = (key) => (seesOrganisation || (req.user.region && key === req.user.region) ? tget('REGION', key) : 0);
  const funnelTarget = (key) => (seesOrganisation ? tget('FUNNEL', key) : 0);

  const byRegion = Array.from(regionMap.entries()).map(([key, row]) => ({
    key: key || 'none',
    label: key || 'No region',
    leads: row.leads,
    closedCount: row.closedCount,
    achieved: row.achieved,
    pipelineValue: row.tcv,
    target: regionTarget(key),
  })).sort(sortByAch);

  const byFunnel = Array.from(funnelMap.entries()).map(([key, row]) => ({
    key: key || 'none',
    label: key ? (fname[key] || `Funnel ${key}`) : 'Unassigned',
    leads: row.leads,
    closedCount: row.closedCount,
    achieved: row.achieved,
    pipelineValue: row.tcv,
    target: funnelTarget(key),
  })).sort(sortByAch);

  let byUser = [];
  if (isAdmin) {
    const userMap = new Map();
    for (const row of closedUser) {
      const key = row.ownerId == null ? '' : String(row.ownerId);
      bump(userMap, key, { closedCount: row._count._all, achieved: row._sum.totalContractValue || 0, leads: row._count._all });
    }
    targets.filter((t) => t.dimension === 'USER' && t.refKey).forEach((t) => bump(userMap, t.refKey, {}));
    const ids = Array.from(userMap.keys()).map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id));
    const users = ids.length
      ? await prisma.user.findMany({ where: { tenantId: req.tenantId, id: { in: ids } }, select: { id: true, name: true } })
      : [];
    const uname = Object.fromEntries(users.map((u) => [String(u.id), u.name]));
    byUser = Array.from(userMap.entries()).map(([key, row]) => ({
      key: key || 'none',
      label: key ? (uname[key] || `User ${key}`) : 'Unassigned',
      leads: row.leads,
      closedCount: row.closedCount,
      achieved: row.achieved,
      pipelineValue: row.tcv,
      target: tget('USER', key),
    })).sort(sortByAch);
  }

  const stageOrder = (cfg.stages || []).map((s) => s.id);
  const stageMap = new Map(byStage.map((row) => [row.stage, row]));
  const stageKeys = [...stageOrder, ...byStage.map((row) => row.stage).filter((id) => !stageOrder.includes(id))];
  const stages = stageKeys.map((key) => {
    const row = stageMap.get(key);
    return {
      key,
      count: row ? row._count._all : 0,
      tcv: row ? (row._sum.totalContractValue || 0) : 0,
    };
  });

  let overallTarget = 0;
  let scopeKind = 'organisation';
  if (isAdmin || seesOrganisation) {
    overallTarget = tget('OVERALL', '');
    scopeKind = 'organisation';
  } else if (funnelIds && funnelIds.length) {
    scopeKind = 'funnels';
    overallTarget = req.user.role === 'SALES_REP' ? tget('USER', req.user.id) : 0;
  } else if (req.user.role === 'MANAGER' && req.user.region) {
    scopeKind = 'region';
    overallTarget = tget('REGION', req.user.region);
  } else {
    scopeKind = 'own';
    overallTarget = tget('USER', req.user.id);
  }

  res.json({
    fy,
    currentFy: currentFy(),
    fyStart: start,
    fyEnd: end,
    scope: scopeKind,
    overall: {
      target: overallTarget,
      achieved: closedOverall._sum.totalContractValue || 0,
      closedCount: closedOverall._count._all || 0,
      pipelineCount: pipeline._count._all || 0,
      pipelineValue: pipeline._sum.totalContractValue || 0,
    },
    byStage: stages,
    byRegion,
    byFunnel,
    byUser,
  });
});

module.exports = router;
