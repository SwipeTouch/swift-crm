require('dotenv').config();
const prisma = require('../src/db');
const { provisionTenant } = require('../src/lib/provision');

// Seeds the default SWIPETOUCH tenant (the home of the original/demo data)
// with its Super Admin, config and sample funnels. Idempotent.
async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@schoolcrm.local';
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';
  const name = process.env.SEED_ADMIN_NAME || 'Super Admin';

  const { tenant, createdAdmin } = await provisionTenant({
    code: 'SWIPETOUCH',
    name: 'SwipeTouch',
    adminEmail: email,
    adminPassword: password,
    adminName: name,
    funnels: [
      { name: 'North India Schools', description: 'Leads from northern region outreach' },
      { name: 'South India Schools', description: 'Leads from southern region outreach' },
      { name: 'Inbound / Website', description: 'Self-registered and referral leads' },
    ],
  });

  console.log(`Tenant ready: ${tenant.code} — ${tenant.name} (id ${tenant.id})`);
  if (createdAdmin) {
    console.log('Seeded Super Admin');
    console.log(`  client code: ${tenant.code}`);
    console.log(`  email:       ${email}`);
    console.log(`  password:    ${password}`);
    console.log('  >>> Change this password after first login. <<<');
  } else {
    console.log(`Super Admin already exists: ${email}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
