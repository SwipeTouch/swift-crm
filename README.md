# Swift-CRM

A multi-tenant sales CRM. Built for selling school ERP software across India, but each client (tenant) is fully isolated, so one deployment can serve many organisations.

## Stack
- **Backend:** Node.js + Express + Prisma (PostgreSQL)
- **Frontend:** React (Vite) + Ant Design
- **Auth:** JWT + bcrypt, role-based access control (Super Admin / Manager / Sales Rep)
- **Multi-tenancy:** shared database, row-level isolation (a `tenantId` on every record); login is scoped by a **client code**

## Features
- **Multi-tenant** — every client has its own users, funnels, leads, config, stages and targets; zero cross-tenant visibility
- Login + RBAC (3 roles), per-user view-only / export locks
- Add leads manually or via **XLSX import**; multiple **funnels** feeding one **leads pool**
- Leads pool with filters (region, student strength, owner, stage, board, funnel, lead-date & ageing ranges), show/hide columns, funnel switcher
- **Configurable pipeline stages** (name / colour / order) with full stage-history; promote/demote with guards; Closure is terminal
- **Purchase Order** flow on closure → branded PDF / Word from an editable template
- **FY sales targets & achievement** (overall + per region / funnel / sales person) on the Super Admin dashboard
- Admin **Configuration** (stages, rep-visible columns, export/read-only toggles, ageing threshold, PO template & logo)
- **Theme**: light / dark / auto

## Quick start (local)
```bash
# 1. Start Postgres
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env            # defaults work with the docker DB
npm install
npm run db:push                 # create tables
npm run seed                    # creates the SWIPETOUCH tenant + its Super Admin
npm run dev                     # http://localhost:4000

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

Log in with **client code `SWIPETOUCH`** and the seed admin credentials printed by `npm run seed`.

**Want sample data?** Instead of `npm run seed`, load the bundled demo dataset (1 tenant, 6 users, 4 funnels, 9 leads with history, targets and POs) into the fresh DB:
```bash
docker exec -i school_crm_db psql -U crm -d school_crm < backend/prisma/demo-data.sql
```

## Onboard a new client (tenant)
```bash
cd backend
npm run create-tenant -- --code ACME --name "Acme Schools" \
  --admin-email admin@acme.com --admin-password "Secret@123"
```
That tenant then logs in with client code `ACME` and its own admin — and sees only its own data.

## Project structure
```
backend/    Express + Prisma API (routes, lib, prisma schema/seed/migrations-manual, scripts)
frontend/   React + Vite + Ant Design SPA (pages, components, auth/config/theme providers)
docker-compose.yml   PostgreSQL 16 for local dev (host port 5433)
```

## Working on this project (AI agents & contributors)
Read **[CLAUDE.md](./CLAUDE.md)** first — it is the full engineering context: architecture, data model, how to run and migrate the DB, the **multi-tenancy rules** every query must follow, auth/RBAC, and conventions. `AGENTS.md` points other AI tools to the same guide.
