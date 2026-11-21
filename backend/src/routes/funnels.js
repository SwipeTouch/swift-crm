const express = require('express');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const CLOSURE_STAGE = 'closure';

// One holding funnel per tenant. Closed leads land here when their funnel is removed.
async function ensureMiscFunnel(tenantId, userId) {
  const existing = await prisma.funnel.findFirst({ where: { tenantId, isMisc: true } });
  if (existing) return existing;
  return prisma.funnel.create({
    data: {
      tenantId,
      name: 'Miscellaneous',
      description: 'Leads kept here when their funnel is removed, including closed deals.',
      isMisc: true,
      createdById: userId || null,
    },
  });
}

// GET /api/funnels — list funnels with lead counts (everyone can view)
router.get('/', async (req, res) => {
  const [funnels, closed] = await Promise.all([
    prisma.funnel.findMany({
      where: { tenantId: req.tenantId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { leads: true } } },
    }),
    prisma.lead.groupBy({
      by: ['funnelId'],
      where: { tenantId: req.tenantId, stage: CLOSURE_STAGE, funnelId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const closedByFunnel = new Map(closed.map((row) => [row.funnelId, row._count._all]));
  res.json({
    data: funnels.map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description,
      isMisc: f.isMisc,
      createdAt: f.createdAt,
      leadCount: f._count.leads,
      closureCount: closedByFunnel.get(f.id) || 0,
    })),
  });
});

// POST /api/funnels — Admin + Manager
router.post('/', requireRole('SUPER_ADMIN', 'MANAGER'), async (req, res) => {
  const { name, description } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });
  const funnel = await prisma.funnel.create({
    data: { tenantId: req.tenantId, name: String(name).trim(), description: description || null, createdById: req.user.id },
  });
  res.status(201).json({ funnel });
});

// PUT /api/funnels/:id — Admin + Manager
router.put('/:id', requireRole('SUPER_ADMIN', 'MANAGER'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name, description } = req.body || {};
  const existing = await prisma.funnel.findFirst({ where: { id, tenantId: req.tenantId } });
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const data = {};
  if (name !== undefined) data.name = String(name).trim();
  if (description !== undefined) data.description = description || null;
  const funnel = await prisma.funnel.update({ where: { id }, data });
  res.json({ funnel });
});

// DELETE /api/funnels/:id/leads — remove every lead in the funnel. The funnel name stays.
// Super Admin always; a Manager only when canClearFunnel is on.
router.delete('/:id/leads', requireRole('SUPER_ADMIN', 'MANAGER'), async (req, res) => {
  const actor = await prisma.user.findFirst({
    where: { id: req.user.id, tenantId: req.tenantId },
    select: { role: true, canClearFunnel: true },
  });
  const allowed = actor && (actor.role === 'SUPER_ADMIN' || (actor.role === 'MANAGER' && actor.canClearFunnel));
  if (!allowed) {
    return res.status(403).json({ error: 'Only an Admin, or a Manager allowed to clear funnel data, can delete these leads.' });
  }
  const id = parseInt(req.params.id, 10);
  const existing = await prisma.funnel.findFirst({ where: { id, tenantId: req.tenantId } });
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const removed = await prisma.lead.deleteMany({ where: { funnelId: id, tenantId: req.tenantId } });
  res.json({ ok: true, deleted: removed.count });
});

// DELETE /api/funnels/:id — Admin only.
// A funnel with closed leads is not dropped on the floor: those leads, and the
// other leads in the funnel, move to Miscellaneous. That holding funnel itself stays.
router.delete('/:id', requireRole('SUPER_ADMIN'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = await prisma.funnel.findFirst({ where: { id, tenantId: req.tenantId } });
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (existing.isMisc) {
    return res.status(400).json({ error: 'Miscellaneous holds leads from funnels that were removed. It cannot be deleted.' });
  }

  const closureCount = await prisma.lead.count({
    where: { funnelId: id, tenantId: req.tenantId, stage: CLOSURE_STAGE },
  });
  const misc = await ensureMiscFunnel(req.tenantId, req.user.id);
  await prisma.$transaction([
    prisma.lead.updateMany({ where: { funnelId: id, tenantId: req.tenantId }, data: { funnelId: misc.id } }),
    prisma.funnel.delete({ where: { id } }),
  ]);
  res.json({ ok: true, movedTo: misc.name, closureCount });
});

module.exports = router;
