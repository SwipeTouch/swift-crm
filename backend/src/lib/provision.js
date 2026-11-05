const bcrypt = require('bcryptjs');
const prisma = require('../db');
const { getConfig } = require('./config');

// Create (or top up) a tenant: the Tenant row, its default per-tenant config,
// a first SUPER_ADMIN, and optional starter funnels. Idempotent on tenant code
// and admin email so it is safe to re-run.
async function provisionTenant({ code, name, adminEmail, adminPassword, adminName, funnels }) {
  const codeU = String(code).toUpperCase().trim();
  let tenant = await prisma.tenant.findUnique({ where: { code: codeU } });
  if (!tenant) {
    tenant = await prisma.tenant.create({ data: { code: codeU, name: name || codeU } });
  }

  // Per-tenant configuration (creates default stages/columns if missing).
  await getConfig(tenant.id);

  // First Super Admin for the tenant.
  const emailLc = String(adminEmail).toLowerCase().trim();
  let admin = await prisma.user.findFirst({ where: { tenantId: tenant.id, email: emailLc } });
  const createdAdmin = !admin;
  if (!admin) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    admin = await prisma.user.create({
      data: { tenantId: tenant.id, name: adminName || 'Super Admin', email: emailLc, passwordHash, role: 'SUPER_ADMIN' },
    });
  }

  // Starter funnels (only when the tenant has none yet).
  if (Array.isArray(funnels) && funnels.length) {
    const existing = await prisma.funnel.count({ where: { tenantId: tenant.id } });
    if (existing === 0) {
      await prisma.funnel.createMany({
        data: funnels.map((f) => ({ tenantId: tenant.id, name: f.name, description: f.description || null })),
      });
    }
  }

  return { tenant, admin, createdAdmin };
}

module.exports = { provisionTenant };
