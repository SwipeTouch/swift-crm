# Swift-CRM — agent context

Read this fully before working. It is the single source of truth for how this project is built, the rules you must follow (especially multi-tenancy), and how to run and extend it. This file is for Claude Code and any other AI/coding agent (see also `AGENTS.md`).

## What this is
A **multi-tenant sales CRM**. Originally for selling school ERP software across India, now generalized so one deployment serves many independent clients ("tenants"), each isolated by a **client code** entered at login. Vendor brand is **SwipeTouch** (shown as "Powered by"); the product is **Swift-CRM**.

## Stack
- **Backend:** Node.js (v18+) + Express (port 4000) + Prisma ORM → PostgreSQL 16 (Docker). JWT auth (`jsonwebtoken`) + `bcryptjs`. `multer` uploads, `xlsx` (SheetJS) import/export, `pdfkit` (PO PDF), `docx` (PO Word).
- **Frontend:** React 18 + Vite (port 5173, proxies `/api` → 4000) + Ant Design 5 (`antd`, `@ant-design/icons`), `react-router-dom`, `axios`, `dayjs`.
- **DB:** PostgreSQL in docker-compose — container `school_crm_db`, host port **5433**, db `school_crm`, user/pass `crm`/`crm`.

## Run it locally
```bash
docker compose up -d                 # Postgres on :5433
cd backend && cp .env.example .env    # defaults match the docker DB
npm install && npm run db:push        # sync schema → DB
npm run seed                          # creates the SWIPETOUCH tenant + its Super Admin
npm run dev                           # API on :4000 (node --watch)
# new terminal:
cd frontend && npm install && npm run dev   # app on :5173
```
Default login: **client code `SWIPETOUCH`**, email `admin@schoolcrm.local`, password `Admin@12345` (printed by `npm run seed`).

Backend has no hot-reload on `npm start`; `npm run dev` uses `node --watch`. Frontend has Vite HMR.

## Repository layout
```
backend/
  src/
    index.js              Express app; mounts /api/{auth,leads,funnels,users,import,config,targets}
    db.js                 Shared PrismaClient singleton (import this everywhere)
    middleware/auth.js    signToken(user,tenant), requireAuth (sets req.user + req.tenantId), requireRole
    lib/
      config.js           getConfig(tenantId); DEFAULT_STAGES, ALL_COLUMN_KEYS, DEFAULT_PO_TEMPLATE, effectivePoTemplate
      leadAccess.js        buildLeadScope / canView|Edit|DeleteLead (role+funnel+owner scope, NOT tenant)
      poDocument.js        buildViewModel + generatePdf (pdfkit) + generateDocx (docx)
      provision.js         provisionTenant() — creates a tenant + config + first Super Admin (+ funnels)
    routes/               auth, leads, funnels, users, import, config, targets
    scripts/create-tenant.js   CLI onboarding (npm run create-tenant)
  prisma/
    schema.prisma         models + enums
    seed.js               seeds the SWIPETOUCH tenant (idempotent, uses provisionTenant)
    migrations-manual/    hand-written SQL for data-dependent migrations (see "Database changes")
frontend/
  src/
    main.jsx              ThemeModeProvider → antd ConfigProvider (brand tokens + light/dark algorithm) → Auth/Config providers → App
    App.jsx               routes ("/" → /dashboard)
    api.js                axios instance; attaches JWT; 401 → bounce to /login
    auth.jsx              AuthProvider/useAuth; holds { user, tenant }; login(clientCode,email,password)
    config.jsx            ConfigProvider/useConfig; per-tenant stages+flags+helpers
    theme.jsx             ThemeModeProvider/useThemeMode (light|dark|auto, persisted)
    format.js             inr(), ageingDays(), isReminderDue()
    components/           AppLayout, LeadFormModal, LeadDetailDrawer, PurchaseOrderModal, TargetsModal
    pages/                Login, Dashboard, LeadsPool, Funnels, ImportPage, Users, Configuration
  public/swipetouch-logo.png
docker-compose.yml, README.md
```

## Data model (Prisma)
`Tenant` (code @unique UPPERCASE, name, active) owns everything. Tenant-scoped models each have a NOT-NULL `tenantId`: **User, Funnel, Lead, LeadStageHistory, ImportBatch, AppConfig, Target, PurchaseOrder**.
- `User`: unique is `@@unique([tenantId, email])` (same email may exist in other tenants). Roles enum `SUPER_ADMIN | MANAGER | SALES_REP`. Flags `locked` (view-only), `canExport`. `funnelAccess` m2m "FunnelAccess".
- `Lead`: schoolName, board, studentStrength, region, location, contact{Name,Type(INFLUENCER|PROMOTER),Phone}, `stage` (String, configurable), `closedAt` (stamped when entering closure — drives FY achievement), totalContractValue, pspmRate, cac, leadDate (drives ageing), reminderAt/Note, funnelId, ownerId.
- `AppConfig`: **one row per tenant** (`tenantId @unique`) — stages (ordered JSON `[{id,name,color}]`), repColumns, exportEnabled, readOnly, repsReadOnly, ageingThresholdDays, poTemplate (JSON), logo (base64).
- `Target`: FY targets, `@@unique([tenantId, fy, dimension, refKey])`; dimension OVERALL|REGION|FUNNEL|USER.
- `PurchaseOrder`: one per lead (`leadId @unique`), PSPM/LUMPSUM, 18% GST, billing cycle, contacts JSON.

## 🔴 Multi-tenancy — the golden rules (read before touching any query)
Isolation is **shared-DB, row-level**. A missed scope is a cross-tenant data leak. `requireAuth` decodes the JWT and sets **`req.tenantId`** — the single source of truth. For every Prisma call on a scoped model:
- **Reads** (`findMany`/`findFirst`/`count`/`aggregate`/`groupBy`): add `tenantId: req.tenantId` to `where`.
- **By-id access** (`GET/PUT/DELETE /:id`, PO): use `findFirst({ where: { id, tenantId: req.tenantId } })` and 404 if missing — never `findUnique({ where: { id } })`. This also guards updates/deletes.
- **Creates** (`create`/`createMany`/`upsert`): set `tenantId: req.tenantId` in `data` — **including nested writes** like `history: { create: { tenantId, ... } }`.
- **Config:** always `getConfig(req.tenantId)`.
- **Targets:** upsert on the compound unique `{ tenantId_fy_dimension_refKey: { tenantId, fy, dimension, refKey } }`.
- **Cross-refs:** when a payload carries a `funnelId`/`ownerId`, verify it belongs to the tenant (see `funnelOwnerInTenant` in `routes/leads.js`, `tenantFunnelIds` in `routes/users.js`).
- Login (`routes/auth.js`) resolves the tenant by client code **before** finding the user; it is the only place that looks up a tenant by `code`.
- Lead list/filter/stats reuse `tenantScope(req)` in `routes/leads.js` = tenant + role/funnel/owner scope. `leadAccess.js` only does the role/funnel/owner part — tenant is added alongside it, never inside it.

There is **no** platform-"owner" role or tenant-management UI yet; Super Admin is per-tenant. Onboard via the CLI.

## Auth & RBAC
JWT carries `{ id, role, region, name, tenantId, tenantCode, tenantName }`. `/auth/login` → `{ token, tenant, user }`; `/auth/me` → `{ user, tenant }`. Roles: **SUPER_ADMIN** (full, per tenant), **MANAGER** (region scope; manages users but cannot create/edit Super Admins or grant SUPER_ADMIN), **SALES_REP** (own leads; switches funnels, no Funnels/Users/Config nav). Extra gates: global `readOnly` / `repsReadOnly`, per-user `locked` / `canExport`, and funnel-access overrides role scope. Enforced by `enforceWritable` + checks in `routes/leads.js` and `lib/leadAccess.js`.

## Pipeline stages (configurable)
Stages live in `AppConfig.stages` (ordered JSON), not an enum. `lead.stage` is a String. Promote/demote order derives from the list; demote is Super Admin/Manager only; **Closure is terminal** (locked for non-Super-Admin). Moving a lead into Closure stamps `closedAt`; moving out clears it. Frontend reads stages via `useConfig()`; backend via `req.appConfig` (set in the leads router middleware).

## Purchase Orders, Targets, Theme
- **PO:** entering Closure triggers `PurchaseOrderModal`; `POST /api/leads/:id/po` upserts; `GET /api/leads/:id/po/document?format=pdf|docx` streams a branded doc from `lib/poDocument.js`. Template + logo live in `AppConfig`. PDF renders currency as "INR" text (pdfkit core fonts lack ₹).
- **Targets:** `routes/targets.js`, Indian FY (Apr–Mar, e.g. "2026-27"). Achievement = Σ `totalContractValue` of leads in closure whose `closedAt` is in the FY. Super-Admin-only; dashboard shows overall + per region/funnel/user.
- **Theme:** `theme.jsx` holds light/dark/auto (persisted `localStorage.crm_theme`, auto follows OS). `main.jsx` picks antd `darkAlgorithm`/`defaultAlgorithm`. Use `theme.useToken()` for any custom colors — never hardcode `#fff`/light backgrounds, or dark mode breaks. Brand: primary teal `#0d9488`; the "Swift-CRM" wordmark is logo red `#ea3b5d` + blue `#004ecc` (blue lightens to `#7aa2ff` in dark).

## Database changes (important workflow)
This project uses **`prisma db push`**, not `prisma migrate` (no `migrations/` folder). For schema changes with no existing-data impact: edit `schema.prisma` → `npm run db:push` → `npm run db:generate`. For **data-dependent** changes (e.g. adding a NOT-NULL column to populated tables), write hand SQL in `prisma/migrations-manual/NNN_*.sql`, run it via `docker exec -i school_crm_db psql -U crm -d school_crm < file.sql`, **then** `db push --accept-data-loss` to reconcile constraints/indexes. The multi-tenant migration (`001_multitenant.sql`) is the reference example. After switching a model's `id` to autoincrement, fix its sequence with `setval(pg_get_serial_sequence(...), MAX(id))`.

## Onboard a new tenant
```bash
cd backend
npm run create-tenant -- --code ACME --name "Acme Schools" \
  --admin-email admin@acme.com --admin-password "Secret@123" [--admin-name "Jane Doe"]
```
Creates the tenant, its default config/stages, and the first Super Admin. Idempotent on tenant code.

## Conventions
- **Comments:** few, short, plain. Put rationale in the commit message, not in verbose code comment blocks.
- **Scope:** keep changes tightly scoped to the request; don't refactor or remove shared code that has other callers unless asked.
- **Secrets:** `backend/.env` is gitignored — never commit it. `.env.example` holds safe dev defaults. `node_modules/`, `dist/`, `*.log` are ignored.
- **Money** is stored as Float. Dates are stored UTC; date-only fields display shifted by viewer timezone (fine in IST).
- Prefer the existing helpers (`inr`, `ageingDays`, `isReminderDue`, `useConfig`, `useAuth`, `useThemeMode`, `getConfig`, `effectivePoTemplate`, `buildLeadScope`) over re-implementing.

## Gotchas
- A new scoped Prisma query **must** be tenant-scoped (see golden rules) — this is the easiest and most dangerous thing to miss.
- `lead.stage` strings must match a configured stage id; config stage removal is blocked if any lead still uses it (per tenant).
- `closedAt` must stay stamped/cleared correctly on every stage transition (create, stage, promote, demote) or FY achievement drifts.
- Restarting the backend: `pkill -f "node src/index.js"; npm start` (or just use `npm run dev`).
