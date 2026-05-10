# AGENTS.md

## Workspace

- This workspace is `Uniplan`.
- Treat this repository as the shared source of truth for Uniplan planning, data model, query templates, and handoff notes.

## Startup

- Read `README.md` first.
- Read `UNIPLAN_MOVE_BRIEF.md` before making changes.
- Use `UNIPLAN_MVP.md`, `UNIPLAN_ARCHITECTURE.md`, and `UNIPLAN_DATA_MODEL.md` as the core product/technical context.

## Working Rules

- Keep changes documentation-first unless the user asks to scaffold code.
- Do not write secrets, private credentials, raw production database dumps, or local runtime state into the repository.
- When updating direction or decisions, add the durable version to the relevant `UNIPLAN_*.md` file rather than relying on chat memory.

## Codex Cloud

- This repo has no install step yet.
- Primary verification is reading/consistency review.
- If code is added later, update `CODEX_CLOUD.md` with setup and verification commands.
