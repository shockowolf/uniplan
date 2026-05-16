# AGENTS.md

## Workspace

- This workspace is `Uniplan`.
- Treat this repository as the shared source of truth for Uniplan planning, data model, query templates, and the working Next.js prototype.

## Startup

- Read `README.md` first.
- Read `UNIPLAN_MOVE_BRIEF.md` before making changes.
- Use `UNIPLAN_MVP.md`, `UNIPLAN_ARCHITECTURE.md`, and `UNIPLAN_DATA_MODEL.md` as the core product/technical context.
- Use `docs/EASIERP_DB_REFERENCE.md` when mapping legacy easiERP/gootzERP database structures into Uniplan.
- For implementation, start with `app/page.tsx`, `app/api/chat/route.ts`, and `lib/ai/orchestrator.ts`.

## Working Rules

- Keep product direction aligned with the docs when changing code.
- Do not write secrets, private credentials, raw production database dumps, or local runtime state into the repository.
- When updating direction or decisions, add the durable version to the relevant `UNIPLAN_*.md` file rather than relying on chat memory.
- Keep AI data access template-based and read-only unless the user explicitly approves a new safety model.

## Codex Cloud

- Setup: `npm install`
- Verify: `npm run verify:cloud`
- Full local verification when dependencies/SQLite are available and a destructive demo DB reset is acceptable: `npm run db:reset && npm run build`
