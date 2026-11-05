const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const ROLES = ['SUPER_ADMIN', 'MANAGER', 'SALES_REP'];
const publicSelect = {
  id: true, name: true, email: true, role: true, region: true, active: true,
  locked: true, canExport: true, createdAt: true,
  funnelAccess: { select: { id: true, name: true } },
};

// GET /api/users — list of users (used for owner filters/assignment).
// Admin + Manager can list; reps get just themselves (for the UI).
router.get('/', async (req, res) => {
  if (req.user.role === 'SALES_REP') {
    const me = await prisma.user.findFirst({ where: { id: req.user.id, tenantId: req.tenantId }, select: publicSelect });
    return res.json({ data: me ? [me] : [] });
  }
  const users = await prisma.user.findMany({ where: { tenantId: req.tenantId }, orderBy: { name: 'asc' }, select: publicSelect });
  res.json({ data: users });
});

// Validate that every requested funnel id belongs to the caller's tenant.
// Returns the clean list of ids, or null if any id is foreign/unknown.
async function tenantFunnelIds(req, funnelIds) {
  const ids = (Array.isArray(funnelIds) ? funnelIds : []).map((fid) => parseInt(fid, 10)).filter((n) => !Number.isNaN(n));
  if (!ids.length) return [];
  const found = await prisma.funnel.findMany({ where: { id: { in: ids }, tenantId: req.tenantId }, select: { id: true } });
  if (found.length !== new Set(ids).size) return null;
  return ids;
}

// POST /api/users — Super Admin only
router.post('/', requireRole('SUPER_ADMIN', 'MANAGER'), async (req, res) => {
  const { name, email, password, role, region, funnelIds, locked, canExport } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password are required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (role && !ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  // Managers cannot create Super Admins.
  if (req.user.role === 'MANAGER' && role === 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Managers cannot create Super Admin users' });
  }

  const emailLc = String(email).toLowerCase().trim();
  const exists = await prisma.user.findFirst({ where: { tenantId: req.tenantId, email: emailLc } });
  if (exists) return res.status(409).json({ error: 'A user with that email already exists' });

  const passwordHash = await bcrypt.hash(password, 10);
  const data = { tenantId: req.tenantId, name: String(name).trim(), email: emailLc, passwordHash, role: role || 'SALES_REP', region: region || null };
  if (locked !== undefined) data.locked = !!locked;
  if (canExport !== undefined) data.canExport = !!canExport;
  // Only Super Admin assigns funnel visibility (and only to funnels in this tenant).
  if (req.user.role === 'SUPER_ADMIN' && Array.isArray(funnelIds) && funnelIds.length) {
    const ids = await tenantFunnelIds(req, funnelIds);
    if (ids === null) return res.status(400).json({ error: 'One or more funnels are not valid for this client' });
    data.funnelAccess = { connect: ids.map((id) => ({ id })) };
  }
  const user = await prisma.user.create({ data, select: publicSelect });
  res.status(201).json({ user });
});

// PUT /api/users/:id — Super Admin & Manager (role, region, name, active, optional password reset).
// Managers may not modify a Super Admin, nor grant the Super Admin role.
router.put('/:id', requireRole('SUPER_ADMIN', 'MANAGER'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name, role, region, active, password, funnelIds, locked, canExport } = req.body || {};

  const target = await prisma.user.findFirst({ where: { id, tenantId: req.tenantId } });
  if (!target) return res.status(404).json({ error: 'Not found' });
  if (req.user.role === 'MANAGER') {
    if (target.role === 'SUPER_ADMIN') return res.status(403).json({ error: 'Managers cannot modify a Super Admin' });
    if (role === 'SUPER_ADMIN') return res.status(403).json({ error: 'Managers cannot grant the Super Admin role' });
  }

  const data = {};
  if (name !== undefined) data.name = String(name).trim();
  if (region !== undefined) data.region = region || null;
  if (active !== undefined) data.active = !!active;
  if (locked !== undefined) data.locked = !!locked;
  if (canExport !== undefined) data.canExport = !!canExport;
  if (role !== undefined) {
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
    data.role = role;
  }
  if (password) {
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    data.passwordHash = await bcrypt.hash(password, 10);
  }
  // Only Super Admin changes funnel visibility; `set` replaces the whole list (tenant-validated).
  if (req.user.role === 'SUPER_ADMIN' && funnelIds !== undefined) {
    const ids = await tenantFunnelIds(req, funnelIds);
    if (ids === null) return res.status(400).json({ error: 'One or more funnels are not valid for this client' });
    data.funnelAccess = { set: ids.map((fid) => ({ id: fid })) };
  }
  // Guard: don't let the last active Super Admin be demoted or disabled.
  if (id === req.user.id && (data.role && data.role !== 'SUPER_ADMIN' || data.active === false)) {
    const admins = await prisma.user.count({ where: { tenantId: req.tenantId, role: 'SUPER_ADMIN', active: true } });
    if (admins <= 1) return res.status(400).json({ error: 'Cannot demote or disable the last Super Admin' });
  }
  try {
    const user = await prisma.user.update({ where: { id }, data, select: publicSelect });
    res.json({ user });
  } catch (e) {
    res.status(404).json({ error: 'Not found' });
  }
});

module.exports = router;
