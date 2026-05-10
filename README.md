# Uniplan

Uniplan is an AI ERP analyst MVP: a lightweight business dashboard where users ask ERP-style questions in natural language and receive safe, read-only summaries, metric cards, charts, and tables.

This repository now contains both:

- durable product/architecture docs in `UNIPLAN_*.md`
- the working Next.js + Prisma prototype

## Current Scope

- Next.js dashboard and chat UI
- Prisma + SQLite local demo DB
- PostgreSQL migration prep
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
npm run db:reset
npm run dev
```

## Verify

```bash
npm run typecheck
npm run build
```

## Demo Questions

1. 오늘 사업 현황 요약
2. 이번 달 매출 어때?
3. 미수금 많은 거래처 TOP 10
4. 재고 부족한 품목
5. 상담 지연 건

## PostgreSQL Prep

SQLite is the default local demo DB. PostgreSQL transition files are prepared:

```bash
npm run db:use:postgres
# start PostgreSQL, then:
npm run db:reset
```

Return to SQLite:

```bash
npm run db:use:sqlite
npm run db:reset
```

## Start Here

Product and architecture:

1. `UNIPLAN_MVP.md`
2. `UNIPLAN_ARCHITECTURE.md`
3. `UNIPLAN_DATA_MODEL.md`
4. `UNIPLAN_QUERY_TEMPLATES.md`
5. `UNIPLAN_MOVE_BRIEF.md`

Prototype docs:

- `docs/DEMO_SCRIPT.md`
- `docs/POSTGRES_MIGRATION.md`
- `docs/LLM_INTENT_CLASSIFIER.md`

## Safety Principle

Uniplan's AI does not directly modify business data. It maps user questions to approved query templates, validates parameters and permissions, runs read-only queries, and renders structured summaries.
