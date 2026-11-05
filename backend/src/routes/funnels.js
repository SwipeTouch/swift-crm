const express = require('express');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/funnels — list funnels with lead counts (everyone can view)
router.get('/', async (req, res) => {
  const funnels = await prisma.funnel.findMany({
    where: { tenantId: req.tenantId },
    orderBy: { name: 'asc' },
    include: { _count: { select: { leads: true } } },
  });
  res.json({
    data: funnels.map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description,
      createdAt: f.createdAt,
      leadCount: f._count.leads,
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

// DELETE /api/funnels/:id — Admin only. Leads are detached (funnelId -> null), not deleted.
router.delete('/:id', requireRole('SUPER_ADMIN'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = await prisma.funnel.findFirst({ where: { id, tenantId: req.tenantId } });
  if (!existing) return res.status(404).json({ error: 'Not found' });
  await prisma.lead.updateMany({ where: { funnelId: id, tenantId: req.tenantId }, data: { funnelId: null } });
  await prisma.funnel.delete({ where: { id } });
  res.json({ ok: true });
});

module.exports = router;
