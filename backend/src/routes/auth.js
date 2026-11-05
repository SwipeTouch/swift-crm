const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login — { clientCode, email, password }
router.post('/login', async (req, res) => {
  const { clientCode, email, password } = req.body || {};
  if (!clientCode || !email || !password) {
    return res.status(400).json({ error: 'Client code, email and password are required' });
  }
  const tenant = await prisma.tenant.findUnique({ where: { code: String(clientCode).toUpperCase().trim() } });
  if (!tenant || !tenant.active) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const user = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email: String(email).toLowerCase().trim() },
    include: { funnelAccess: { select: { id: true } } },
  });
  if (!user || !user.active) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = signToken(user, tenant);
  res.json({
    token,
    tenant: { code: tenant.code, name: tenant.name },
    user: {
      id: user.id, name: user.name, email: user.email, role: user.role, region: user.region,
      locked: user.locked, canExport: user.canExport,
      funnelIds: user.funnelAccess.map((f) => f.id),
    },
  });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findFirst({
    where: { id: req.user.id, tenantId: req.tenantId },
    select: { id: true, name: true, email: true, role: true, region: true, locked: true, canExport: true, funnelAccess: { select: { id: true } } },
  });
  if (!user) return res.status(404).json({ error: 'Not found' });
  const { funnelAccess, ...rest } = user;
  res.json({
    user: { ...rest, funnelIds: funnelAccess.map((f) => f.id) },
    tenant: { code: req.user.tenantCode, name: req.user.tenantName },
  });
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  const user = await prisma.user.findFirst({ where: { id: req.user.id, tenantId: req.tenantId } });
  if (!user) return res.status(404).json({ error: 'Not found' });
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return res.status(400).json({ error: 'Current password is incorrect' });
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.json({ ok: true });
});

module.exports = router;
