# U9 — Tenant relational integrity and domain concurrency

## Goal

Close the multi-tenant relational-integrity and domain race blockers found in review of `b760f20`. The database must reject cross-company relationships even if a future script or API omits an application filter. Item, warehouse, BOM, category, and navigation mutations must use one explicit concurrency protocol.

## Scope A — Tenant-aware database relationships

Add additive/backfill-safe composite tenant constraints and foreign keys for tenant-owned relationships, including at least:

- User → Domain;
- UserRole → User/Role;
- RolePermission → Role/MenuItem;
- MenuItem parent;
- ItemCategory parent;
- Item → category/domain/creator/updater where tenant-owned;
- BOM → output item;
- BOM component/revision/version component → BOM/items/revisions;
- Warehouse hierarchy if any;
- InventoryBalance → item/warehouse;
- InventoryTransaction → creator/reversal/BOM version;
- InventoryEntry → transaction/item/warehouse;
- all other reviewed tenant-owned parent/child relationships.

Requirements:

- Preserve current rows; add validation probes before enforcing constraints.
- Use `(companyId,id)` alternate keys and composite FKs or an equivalent PostgreSQL mechanism.
- Migration must fail clearly if existing malformed rows are found; never silently rewrite tenant ownership.
- Add direct PostgreSQL tests proving representative cross-company rows are rejected.
- Keep application `companyId` filters; DB constraints are defense in depth, not a replacement.

## Scope B — Shared lock protocol

Use transactions and deterministic locks so the following cannot race:

- inventory posting vs item deactivation;
- inventory posting vs warehouse deactivation;
- posting vs changing `trackInventory` or item type;
- BOM activation vs BOM/output/component deactivation;
- category A→B and B→A concurrent reparenting;
- menu A→B and B→A concurrent reparenting;
- child creation vs parent deactivation;
- concurrent BOM revision allocation;
- concurrent activation of two revisions;
- parent/child BOM activation and child-version pinning.

Requirements:

- Validate and write in the same transaction.
- Acquire locks in a documented globally consistent order.
- Recheck active/stock/usage/cycle state after locks are held.
- Use bounded retry for `P2034`/SQLSTATE `40001`/`40P01` where applicable.
- Return stable domain conflict responses, not raw Prisma errors.
- Prefer company/tree-scoped PostgreSQL advisory transaction locks for hierarchy mutations if simpler and deterministic.
- Add barrier/hook-based concurrency tests that force the dangerous interleavings; `Promise.all` without controlled ordering is insufficient.

## Scope C — BOM activation validity

Activation must reject:

- inactive BOM;
- inactive/non-inventory output item;
- inactive/non-inventory component;
- cross-company item/reference;
- stale competing active revision.

Rejected activation must leave no status change or pinned child writes.

## Scope D — Canonical inventory idempotency

Hash the validated command’s canonical business representation:

- decimal quantities normalized to one canonical decimal string;
- stored text trimmed/normalized exactly as persistence;
- timestamps ISO-normalized;
- deterministic line ordering or documented order sensitivity;
- explicit decision on whether actor identity is part of operation identity.

Tests must cover same-key canonical-equivalent payload replay, genuine payload conflict, true parallel same-key submission, and lost-acknowledgement retry.

## Non-goals

- Do not implement UI, audit log, backup, page middleware, login hardening, import/export, production deploy, or paid Starweave work.
- Do not remove application tenant filters.
- Do not use destructive reset or `db push` on the persistent development DB.

## Verification

- Pre-migration counts captured for every affected table.
- `prisma migrate deploy` against current development PostgreSQL without data loss.
- Post-migration counts identical.
- Direct SQL cross-tenant insertion probes rejected.
- Focused forced-interleaving tests.
- Full tests, typecheck, production build, diff-check.
- No commit/push/merge/deploy.
