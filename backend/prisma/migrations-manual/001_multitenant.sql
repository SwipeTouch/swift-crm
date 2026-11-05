-- Multi-tenancy migration (run BEFORE `prisma db push`).
-- Adds a Tenant table, seeds the SWIPETOUCH tenant, and backfills a NOT NULL
-- tenantId onto every tenant-owned table so existing data keeps working.
-- Constraints/indexes/FKs and the AppConfig sequence are reconciled by
-- `prisma db push` afterwards. Idempotent: safe to run more than once.

BEGIN;

-- 1. Tenant table + SWIPETOUCH tenant for all existing data.
CREATE TABLE IF NOT EXISTS "Tenant" (
  "id"        SERIAL PRIMARY KEY,
  "code"      TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_code_key" ON "Tenant"("code");

INSERT INTO "Tenant" ("code", "name", "active")
SELECT 'SWIPETOUCH', 'SwipeTouch', true
WHERE NOT EXISTS (SELECT 1 FROM "Tenant" WHERE "code" = 'SWIPETOUCH');

-- 2. Add tenantId to each scoped table, backfill to SWIPETOUCH, set NOT NULL.
DO $$
DECLARE
  tid INT;
  t   TEXT;
  tables TEXT[] := ARRAY[
    'User', 'Funnel', 'Lead', 'LeadStageHistory',
    'ImportBatch', 'AppConfig', 'Target', 'PurchaseOrder'
  ];
BEGIN
  SELECT "id" INTO tid FROM "Tenant" WHERE "code" = 'SWIPETOUCH';

  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "tenantId" INTEGER', t);
    EXECUTE format('UPDATE %I SET "tenantId" = %L WHERE "tenantId" IS NULL', t, tid);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "tenantId" SET NOT NULL', t);
  END LOOP;
END $$;

COMMIT;
