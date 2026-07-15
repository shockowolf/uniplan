# Uniplan Agent Guide

Uniplan's shared source of truth covers product direction, data model, query templates, and the working Next.js prototype.

## Read before changing code

1. `README.md` and `UNIPLAN_MOVE_BRIEF.md`
2. `UNIPLAN_MVP.md`, `UNIPLAN_ARCHITECTURE.md`, and `UNIPLAN_DATA_MODEL.md`
3. `docs/EASIERP_DB_REFERENCE.md` when mapping legacy easiERP/gootzERP structures
4. Relevant entry points: `app/page.tsx`, `app/api/chat/route.ts`, `lib/ai/orchestrator.ts`

## Hard boundaries

- Keep implementation aligned with the canonical product documents; record durable direction changes in the relevant `UNIPLAN_*.md` file, not only in chat.
- Never commit secrets, private credentials, raw production database dumps, or local runtime state.
- AI data access stays template-based and read-only unless the user explicitly approves a new safety model.
- Apply the shared durable-write and verification rules to persistent mutations, files, or external side effects; do not rely only on a client-side duplicate guard.

## Verification

- Cloud: `npm install && npm run verify:cloud`
- Local, only when the SQLite demo database may be destructively reset: `npm run db:reset && npm run build`
