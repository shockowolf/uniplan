# UNIPLAN Move Brief

이 문서는 새 맥북에서 UniPlan을 다시 잡을 때, 과메기/수달/산양 역할 기준으로 무엇을 이어야 하는지 정리한다.

## 공통 상황 인식

- `uniplan/`은 문서 저장소다.
- `uniplan-prototype/`은 실제 동작하는 Next.js + Prisma 프로토타입이다.
- 현재 UniPlan은 “아이디어 단계”는 지났고, “데모 가능한 프로토타입 단계”에 와 있다.
- 하지만 아직 제품화 직전 단계는 아니다.

## 과메기 브리프

역할:

- 제품 정의 유지
- 사업 흐름과 MVP 우선순위 정리
- 문서와 프로토타입 간 정합성 유지

과메기가 기억해야 할 핵심:

- UniPlan의 MVP 정체성은 `AI ERP analyst`다.
- 사용자는 메뉴를 찾는 대신 자연어로 사업 질문을 한다.
- AI는 자유 SQL 생성기가 아니라, 안전한 템플릿 기반 분석 레이어여야 한다.
- 장기 비전은 크지만, MVP는 읽기 전용 분석 흐름에 집중해야 한다.

과메기의 다음 우선순위:

1. `uniplan/` 문서를 현재 프로토타입 상태와 다시 정렬
2. MVP와 장기 비전을 문서에서 더 선명하게 분리
3. 프로토타입을 본 repo로 승격할지 판단

## 수달 브리프

역할:

- 코드, 빌드, 데이터 모델, 실행 흐름 담당

현재 구현 상태:

- `uniplan-prototype/`는 Next.js 기반
- Prisma 사용
- 기본 개발 DB는 SQLite
- PostgreSQL 전환용 schema와 문서 존재
- API:
  - `/api/chat`
  - `/api/dashboard`
  - `/api/templates`
- 핵심 오케스트레이션:
  - `lib/ai/orchestrator.ts`
- 주요 UI:
  - `components/ChatPanel.tsx`
  - `components/MetricCards.tsx`
  - `components/ChartView.tsx`
  - `components/DataGrid.tsx`

수달이 새 맥북에서 가장 먼저 할 일:

1. `cd uniplan-prototype`
2. `npm install`
3. `npm run db:use:sqlite`
4. `npm run db:reset`
5. `npm run typecheck`
6. `npm run build`
7. `npm run dev`

수달이 이어서 손볼 후보:

1. chat 결과와 dashboard 상태 동기화 강화
2. query template 추가
3. session/history 구조 보강
4. PostgreSQL 전환 테스트

## 산양 브리프

역할:

- 리스크 검토
- 도메인 정합성 확인
- 사업계획서와 MVP 연결 점검

산양이 기억해야 할 판단:

- 현재 방향은 안전하다: 자유 SQL 대신 allowlisted template
- 사업계획서와 MVP는 대체로 정합적이다
- 다만 일부 사업 문구는 과장될 수 있으므로 계속 다듬어야 한다
- 가격/성장 가정, 파일럿 전환 논리는 근거 보강이 필요하다

산양의 다음 질문:

- 어떤 질문까지를 템플릿으로 커버할 것인가
- 어떤 시점부터 PostgreSQL 운영 구조로 넘겨야 하는가
- read-only analytics 모델에서 approval-needed next action은 어디까지 허용할 것인가
- 문서 저장소와 프로토타입 저장소를 언제 하나로 합칠 것인가

## 새 맥북에서 공통으로 먼저 볼 파일

1. `uniplan/UNIPLAN_CHECK_2026-05-03.md`
2. `uniplan/UNIPLAN_MVP.md`
3. `uniplan/UNIPLAN_ARCHITECTURE.md`
4. `uniplan/UNIPLAN_DATA_MODEL.md`
5. `uniplan-prototype/README.md`
6. `uniplan-prototype/docs/POSTGRES_MIGRATION.md`

## 짧은 결론

- 과메기: 방향과 제품 정의 유지
- 수달: 프로토타입 재실행과 확장
- 산양: 리스크와 정합성 검토 유지

새 맥북에서 UniPlan의 첫 목표는:

`문서와 프로토타입을 동시에 잃지 않고, 데모 가능한 상태를 바로 복구하는 것`
