# Uniplan

Uniplan is an AI ERP analyst MVP: a lightweight business dashboard where users ask ERP-style questions in natural language and receive safe, read-only summaries, metric cards, charts, and tables.

This repository now contains both:

- durable product/architecture docs in `UNIPLAN_*.md`
- the working Next.js + Prisma prototype

## Current Scope

- Next.js dashboard and chat UI
- Prisma + PostgreSQL 16 local demo DB
- Versioned Prisma migration history
- Seed demo data
- `/api/chat` template-based responses
- `/api/dashboard` and `/api/templates`
- KPI cards, chart, and data grid rendering
- LLM-ready intent classifier shell
- No free-form SQL execution
- Read-only AI analysis flow

## Run

```bash
npm install
cp .env.postgres.example .env
docker compose -f docker-compose.postgres.yml up -d
npm run db:reset
npm run dev
```

## Verify

```bash
npm run typecheck
npm test
npm run build
```

## Demo Questions

1. 오늘 사업 현황 요약
2. 이번 달 매출 어때?
3. 미수금 많은 거래처 TOP 10
4. 재고 부족한 품목
5. 상담 지연 건

## PostgreSQL

`prisma/schema.prisma` is the only canonical schema. The dedicated local service listens only on `127.0.0.1:5433`:

```bash
cp .env.postgres.example .env
docker compose -f docker-compose.postgres.yml up -d
npm run db:reset
```

Use `npm run db:migrate` for non-destructive migration deployment. `npm run db:reset` is reserved for disposable local/test data.

## Invite-only authentication

There is no public signup. After an operator creates an invited company user, set or reset that user's password from an interactive terminal:

```bash
npm run auth:set-password -- --company COMPANY_CODE --email user@example.com
```

The command reads the password without echoing it and revokes the user's existing sessions. Session duration is configured with `UNIPLAN_AUTH_SESSION_TTL_SECONDS` (default 8 hours, maximum 30 days). Production requires `UNIPLAN_APP_ORIGIN` to be one explicit HTTPS origin. Set a private `UNIPLAN_AUTH_RATE_LIMIT_SECRET` to HMAC login limiter keys (without it, opaque SHA-256 keys are used), and schedule `npm run auth:cleanup` externally to remove expired limiter buckets and retained expired/revoked sessions. `UNIPLAN_AUTH_RECORD_RETENTION_DAYS` defaults to 7 days. Legacy demo authorization is opt-in for local development with `UNIPLAN_DEMO_AUTH_ENABLED=true` and is always disabled when `NODE_ENV=production`.

## Start Here

Product and architecture:

1. `UNIPLAN_MVP.md`
2. `UNIPLAN_ARCHITECTURE.md`
3. `UNIPLAN_DATA_MODEL.md`
4. `UNIPLAN_QUERY_TEMPLATES.md`
5. `UNIPLAN_MOVE_BRIEF.md`

Prototype docs:

- `docs/DEMO_SCRIPT.md`
- `docs/EASIERP_DB_REFERENCE.md`
- `docs/POSTGRES_MIGRATION.md`
- `docs/LLM_INTENT_CLASSIFIER.md`

## Safety Principle

Uniplan's AI does not directly modify business data. It maps user questions to approved query templates, validates parameters and permissions, runs read-only queries, and renders structured summaries.
