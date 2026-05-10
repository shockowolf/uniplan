# UNIPLAN Next Mac Setup

## Goal

새 맥북에서 UniPlan의 기획 문서와 실제 프로토타입을 바로 이어붙일 수 있게 하는 복구 메모.

## Important Structure

UniPlan은 현재 두 군데로 나뉘어 있다.

### 1. `uniplan/`

- 제품 정의
- 아키텍처
- 데이터 모델
- 쿼리 템플릿
- 데모/점검 문서

즉, 기획/설계 저장소다.

### 2. `uniplan-prototype/`

- Next.js 프로토타입
- Prisma schema
- SQLite demo DB
- PostgreSQL 전환 준비 파일
- `/api/chat`, `/api/dashboard`, `/api/templates`

즉, 실제 돌아가는 MVP 데모 저장소다.

## First Read Order On New Mac

1. `uniplan/UNIPLAN_CHECK_2026-05-03.md`
2. `uniplan/UNIPLAN_MVP.md`
3. `uniplan/UNIPLAN_ARCHITECTURE.md`
4. `uniplan/UNIPLAN_DATA_MODEL.md`
5. `uniplan/UNIPLAN_QUERY_TEMPLATES.md`
6. `uniplan-prototype/README.md`
7. `uniplan-prototype/docs/POSTGRES_MIGRATION.md`

## Prototype Recovery Checklist

### 1. Install dependencies

```bash
cd ~/.../workspace/uniplan-prototype
npm install
```

### 2. Default local mode

SQLite is the default local demo mode.

```bash
npm run db:use:sqlite
npm run db:reset
```

### 3. Verify app

```bash
npm run typecheck
npm run build
npm run dev
```

### 4. If PostgreSQL testing is needed

```bash
npm run db:use:postgres
docker compose -f docker-compose.postgres.yml up -d
npm run db:reset
```

Then run:

```bash
npm run dev
```

## Current Practical Status

- Product concept is solid: AI-first ERP analyst
- Prototype already exists and is not just a paper design
- Current prototype supports:
  - chat UI
  - intent classification shell
  - template-based analysis
  - safe read-only responses
  - chart/grid rendering
  - seed demo data
- Current prototype is still demo-stage, not production-ready

## Gaps To Resume After Move

1. align `uniplan/` docs with current prototype reality
2. decide whether prototype becomes main repo or remains disposable
3. expand query templates
4. improve permission/session/history model
5. move toward PostgreSQL-centered operation path

## Recommended First Action After Move

1. get prototype running locally again
2. verify demo questions still work
3. decide next milestone:
   - better prototype demo
   - production architecture
   - business-plan alignment
