require('dotenv').config();
const prisma = require('../db');
const { provisionTenant } = require('../lib/provision');

// Onboard a new client (tenant) with its first Super Admin.
//
//   npm run create-tenant -- --code ACME --name "Acme Schools" \
//       --admin-email admin@acme.com --admin-password "Secret@123" [--admin-name "Jane Doe"]
//
// Flags may also be given via env: TENANT_CODE, TENANT_NAME,
// TENANT_ADMIN_EMAIL, TENANT_ADMIN_PASSWORD, TENANT_ADMIN_NAME.
function arg(flag, envName, def) {
  const i = process.argv.indexOf(flag);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  if (envName && process.env[envName]) return process.env[envName];
  return def;
}

async function main() {
  const code = arg('--code', 'TENANT_CODE');
  const name = arg('--name', 'TENANT_NAME', code);
  const adminEmail = arg('--admin-email', 'TENANT_ADMIN_EMAIL');
  const adminPassword = arg('--admin-password', 'TENANT_ADMIN_PASSWORD');
  const adminName = arg('--admin-name', 'TENANT_ADMIN_NAME', 'Super Admin');

  if (!code || !adminEmail || !adminPassword) {
    console.error('Usage: npm run create-tenant -- --code ACME --name "Acme Schools" --admin-email admin@acme.com --admin-password "Secret@123" [--admin-name "Jane Doe"]');
    process.exit(1);
  }
  if (String(adminPassword).length < 8) {
    console.error('Admin password must be at least 8 characters.');
    process.exit(1);
  }

  const { tenant, createdAdmin } = await provisionTenant({ code, name, adminEmail, adminPassword, adminName, funnels: [] });

  console.log(`\nTenant: ${tenant.code} — ${tenant.name} (id ${tenant.id})`);
  console.log(createdAdmin ? `Super Admin created: ${adminEmail}` : `Super Admin already existed: ${adminEmail}`);
  console.log(`\nLog in with client code "${tenant.code}", that email, and the password.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
