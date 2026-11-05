const express = require('express');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

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

// GET /api/targets/analysis?fy= — achievement vs target overall and per region/funnel/sales person.
router.get('/analysis', requireRole('SUPER_ADMIN'), async (req, res) => {
  const fy = req.query.fy || currentFy();
  const { start, end } = fyBounds(fy);

  const closed = await prisma.lead.findMany({
    where: { tenantId: req.tenantId, stage: CLOSURE_STAGE, closedAt: { gte: start, lte: end } },
    select: { totalContractValue: true, region: true, funnelId: true, ownerId: true },
  });
  const targets = await prisma.target.findMany({ where: { tenantId: req.tenantId, fy } });
  const tget = (dim, key) => {
    const t = targets.find((x) => x.dimension === dim && x.refKey === String(key));
    return t ? t.amount : 0;
  };

  let overallAchieved = 0;
  const region = {}; const funnel = {}; const user = {};
  for (const l of closed) {
    const v = l.totalContractValue || 0;
    overallAchieved += v;
    if (l.region) region[l.region] = (region[l.region] || 0) + v;
    if (l.funnelId != null) funnel[l.funnelId] = (funnel[l.funnelId] || 0) + v;
    if (l.ownerId != null) user[l.ownerId] = (user[l.ownerId] || 0) + v;
  }

  const funnels = await prisma.funnel.findMany({ where: { tenantId: req.tenantId }, select: { id: true, name: true } });
  const users = await prisma.user.findMany({ where: { tenantId: req.tenantId }, select: { id: true, name: true } });
  const fname = Object.fromEntries(funnels.map((f) => [f.id, f.name]));
  const uname = Object.fromEntries(users.map((u) => [u.id, u.name]));

  const union = (achievedMap, dim) => {
    const keys = new Set([...Object.keys(achievedMap), ...targets.filter((t) => t.dimension === dim).map((t) => t.refKey)]);
    return Array.from(keys).filter((k) => k !== '');
  };
  const byRegion = union(region, 'REGION').map((k) => ({ key: k, label: k, achieved: region[k] || 0, target: tget('REGION', k) }));
  const byFunnel = union(funnel, 'FUNNEL').map((k) => ({ key: k, label: fname[k] || `Funnel ${k}`, achieved: funnel[k] || 0, target: tget('FUNNEL', k) }));
  const byUser = union(user, 'USER').map((k) => ({ key: k, label: uname[k] || `User ${k}`, achieved: user[k] || 0, target: tget('USER', k) }));
  const sortByAch = (a, b) => b.achieved - a.achieved;

  res.json({
    fy,
    currentFy: currentFy(),
    fyStart: start,
    fyEnd: end,
    overall: { target: tget('OVERALL', ''), achieved: overallAchieved },
    byRegion: byRegion.sort(sortByAch),
    byFunnel: byFunnel.sort(sortByAch),
    byUser: byUser.sort(sortByAch),
  });
});

module.exports = router;
