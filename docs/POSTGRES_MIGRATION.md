# PostgreSQL Runtime

UNIPLAN uses PostgreSQL 16 as its canonical database. `prisma/schema.prisma` is the only schema source and `prisma/migrations/` is the versioned migration history. Runtime scripts never copy schemas or run `prisma db push`.

## Local setup

```bash
cp .env.postgres.example .env
docker compose -f docker-compose.postgres.yml up -d
npm install
npm run db:reset
```

The dedicated service binds PostgreSQL to `127.0.0.1:5433`, leaving the default host port available to other projects.

## Migration commands

```bash
npm run db:migrate:dev -- --name <migration-name>
npm run db:migrate
```

- `db:migrate:dev` creates and applies a development migration.
- `db:migrate` applies committed migrations without resetting data.
- `db:reset` is destructive and is only for a disposable local or test database.
- `db:seed` is idempotent. Opening stock is posted through the immutable inventory ledger.
- `npm test` deploys migrations to `TEST_DATABASE_URL` when provided, or to an isolated `uniplan_test` schema derived from `DATABASE_URL`; it never truncates the application schema.

## Numeric and inventory invariants

- Money uses PostgreSQL `decimal(18,2)`.
- Quantities use PostgreSQL `decimal(18,6)`.
- Activated BOM revisions and inventory ledger rows are immutable.
- On-hand quantity changes only through the inventory posting service.
- The balance table is a projection that can be checked with ledger reconciliation.

Production credentials must be supplied outside the repository. AI analysis continues to use approved, read-only templates and tenant-scoped permission checks.

Authentication retention cleanup is intentionally scheduler-agnostic. Run `npm run auth:cleanup` from an external scheduler; it deletes expired login limiter buckets immediately and expired/revoked sessions after `UNIPLAN_AUTH_RECORD_RETENTION_DAYS` (default 7).
