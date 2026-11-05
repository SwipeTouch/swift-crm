# Agent guide

The full context for this project — architecture, how to run it, the multi-tenancy rules you must follow, and conventions — lives in **[CLAUDE.md](./CLAUDE.md)**.

**Read `CLAUDE.md` in full before making any change.** It applies to every AI/coding agent (Claude Code, Cursor, Copilot, etc.), not just Claude.

The single most important rule: this is a multi-tenant app, so **every Prisma query on a tenant-owned model must be scoped by `req.tenantId`** — missing that is a cross-tenant data leak. See the "Multi-tenancy — the golden rules" section in `CLAUDE.md`.
