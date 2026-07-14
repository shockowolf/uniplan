# UNIPLAN Core Operations Implementation Plan

> **For Hermes:** Implement task-by-task with tests and verification. Product code, routes, schema, comments, and UI must use UNIPLAN-native terminology only.

**Goal:** Convert UNIPLAN to a PostgreSQL-first working ERP core with database-driven navigation, item/BOM/warehouse inventory operations, and a persistent server-proxied local-AI conversation panel.

**Architecture:** Next.js App Router remains the full-stack shell. Prisma targets one canonical PostgreSQL schema. Inventory changes go through one idempotent transaction service that writes an immutable ledger and balance projection atomically. The browser calls only UNIPLAN APIs; local LLM endpoints remain behind a server-side adapter and a private m1max gateway.

**Tech Stack:** Next.js 15, React 19, TypeScript, Prisma 6, PostgreSQL 16, Vitest, Playwright-compatible browser verification, OpenAI-compatible local model gateway.

---

## Product terminology and scope

- Use `Item`, `ItemCategory`, `Bom`, `BomVersion`, `BomComponent`, `Warehouse`, `InventoryTransaction`, `InventoryEntry`, `InventoryBalance`.
- No legacy project names, table names, import IDs, or legacy query parameters in runtime schema, code, routes, UI, seed, or API payloads.
- Historical source notes may remain in migration/reference documents only.
- Items support raw material, component, finished good, consumable, and service types.
- Service items cannot track inventory.
- BOM supports multiple levels and immutable activated revisions.
- Stock changes support opening, receipt, issue, transfer, adjustment, production, and reversal.
- No direct current-quantity edit API.

## Task 1: PostgreSQL foundation

- Make `prisma/schema.prisma` the canonical PostgreSQL schema.
- Change local compose host port to `127.0.0.1:5433` to avoid existing services.
- Replace schema-copy and destructive postinstall behavior with explicit migration/test scripts.
- Add committed Prisma migration history and PostgreSQL constraints.
- Use Decimal quantities and money.
- Preserve existing dashboard/CRM/sales behavior while renaming Product to Item.
- Add Vitest and test environment setup.

Verification:

- `docker compose -f docker-compose.postgres.yml up -d`
- `npx prisma migrate reset --force`
- `npm run typecheck`
- `npm test`
- `npm run build`

## Task 2: Common data, menu, and authorization

- Replace duplicate runtime menu structures with a recursive DB menu tree.
- Add resource code and CRUD/admin permission flags.
- Seed native routes for dashboard, items, BOM, warehouses, stock, movements, and navigation settings.
- Deny by default if role/permission lookup fails.
- Enforce the same permission check in APIs, not only the sidebar.
- Keep demo session identity server-side until production auth is added.

Tests:

- recursive menu order
- missing permission denial
- role union
- malformed/external href rejection
- cross-company isolation

## Task 3: Item and BOM domain

- Implement item/category CRUD with deactivation rules.
- Implement draft BOM revisions, component editing, activation, and retirement.
- Reject direct and indirect cycles.
- Implement deterministic multi-level BOM explosion using Decimal arithmetic.
- Prevent active/used BOM revision mutation.

Tests:

- two/three-level explosion
- duplicate leaf aggregation
- self and indirect cycle rejection
- service/inventory validation
- cross-company references

## Task 4: Atomic warehouse inventory

- Implement one `postInventoryTransaction` service.
- Require tenant-scoped idempotency key and payload hash.
- Sort and lock affected balance rows deterministically with PostgreSQL `FOR UPDATE`.
- Write header, immutable signed entries, and balance projection in one DB transaction.
- Retry boundedly on PostgreSQL serialization/deadlock failures.
- Production transaction explodes a fixed BOM revision, consumes components, and receives output atomically.
- Add reversal and reconciliation service.

Tests:

- receipt/issue/transfer/adjustment/production/reversal
- insufficient stock rollback
- same idempotency key same/different payload
- injected partial failure rollback
- concurrent first receipts and concurrent issues
- ledger/balance reconciliation

## Task 5: Native APIs and management screens

Routes:

- `/inventory/items`
- `/inventory/boms`
- `/inventory/warehouses`
- `/inventory/stock`
- `/inventory/movements`
- `/settings/navigation`

APIs:

- `/api/inventory/items`
- `/api/inventory/boms`
- `/api/inventory/warehouses`
- `/api/inventory/stock`
- `/api/inventory/transactions`
- `/api/navigation`
- `/api/settings/navigation`

UI requirements:

- working create/edit/deactivate flows
- server validation errors displayed by field
- responsive desktop/mobile workbench
- no placeholder action buttons
- stock is read-only except safety quantity and posted movement commands

## Task 6: Persistent UNIPLAN AI panel

- Add an AppShell-owned AI drawer available on every route.
- Preserve the existing safe ERP template analysis mode.
- Add general-assistant mode through a server-only provider adapter.
- Persist conversations/messages in PostgreSQL.
- Never execute model-generated SQL or CRUD.
- Use timeout, bounded history, validation, and deterministic fallback.
- Add protected health diagnostics.

Server-only env contract:

- `UNIPLAN_INTENT_MODE=keyword|shadow|llm`
- `UNIPLAN_LLM_BASE_URL`
- `UNIPLAN_LLM_API_KEY`
- `UNIPLAN_LLM_FAST_MODEL`
- `UNIPLAN_LLM_DEEP_MODEL`
- bounded timeout/token settings

m1max rollout:

- loopback-only gateway on m1max
- Tailscale Serve HTTPS only, no Funnel
- fixed model aliases; no arbitrary upstream/model selection
- direct 11435/18090 remain unreachable from Oracle

## Task 7: Final verification and delivery

- Run PostgreSQL migrations and seed twice to prove idempotency.
- Run typecheck, unit/integration tests, production build.
- Start app and verify desktop/mobile routes in browser.
- Capture screenshots of items, BOM, stock/movements, and AI drawer.
- Review `git diff --check`, security boundaries, and legacy-name scan of runtime code.
- Commit in coherent phases, push feature branch, and report exact remaining m1max provisioning blocker if remote access is still unavailable.
