# UNIPLAN_ARCHITECTURE

UniPlan AI ERP MVP 아키텍처 초안.

목표는 “복잡한 ERP 메뉴”가 아니라, 사용자가 자연어로 사업 데이터를 묻고 AI가 안전하게 조회·요약·시각화하는 경량 ERP 분석 서비스다.

## 1. MVP 원칙

1. 신규 서비스로 만든다.
   - easierp/gootzERP는 참고 자산으로만 사용한다.
   - 레거시 Spring/JSP 구조를 그대로 이식하지 않는다.

2. AI는 DB에 자유 SQL을 직접 날리지 않는다.
   - 자연어 → intent → query template → read-only SQL 흐름으로 제한한다.

3. MVP는 읽기 전용이다.
   - 매출/재고/고객/상담/AS/업무 조회와 분석까지만 한다.
   - 발주, 청구서 발행, 메시지 전송, 데이터 수정은 승인 기반 후순위로 둔다.

4. UI는 대시보드 + 채팅 + 결과 패널 구조로 간다.
   - 사용자는 “이번 달 매출 어때?”처럼 묻는다.
   - 결과는 요약, 카드, 표, 차트로 보여준다.

## 2. 권장 스택

### MVP 추천

```text
Frontend / Fullstack: Next.js
Language: TypeScript
DB: PostgreSQL
ORM/Query: Prisma or Drizzle
Chart/Grid: Recharts + TanStack Table 먼저, DevExtreme은 후속 검토
AI Layer: template matcher → LLM intent classifier 후속
Auth: MVP local session or NextAuth
```

### 이유

- 빠르게 웹 MVP를 만들기 좋다.
- API와 UI를 한 repo에서 관리할 수 있다.
- PostgreSQL은 분석 쿼리/날짜 집계에 적합하다.
- DevExpress/DevExtreme은 레거시 참고 UI로 좋지만 라이선스/무게가 있으므로 MVP 1차에서는 가벼운 오픈소스 차트/테이블로 시작한다.

## 3. 시스템 구성

```text
[Browser]
  ↓
[Next.js UI]
  - Dashboard
  - Chat Panel
  - Result Panel
  - Grid/Chart Renderer
  ↓
[API Routes]
  - /api/chat
  - /api/templates
  - /api/dashboard
  ↓
[AI Orchestrator]
  - normalize question
  - classify intent
  - extract parameters
  - permission check
  - execute template
  - summarize result
  ↓
[Query Template Engine]
  - template registry
  - parameter validation
  - SQL allowlist
  - read-only execution
  ↓
[PostgreSQL]
  - UniPlan MVP schema
  - demo seed data
  - analytics views later
```

## 4. 폴더 구조 제안

```text
uniplan-prototype/
  app/
    page.tsx                      # dashboard/chat 메인
    api/
      chat/route.ts               # 자연어 질문 처리
      dashboard/route.ts          # 초기 대시보드 데이터
      templates/route.ts          # 템플릿 목록/디버그
  components/
    ChatPanel.tsx
    ResultRenderer.tsx
    MetricCards.tsx
    DataGrid.tsx
    ChartView.tsx
  lib/
    ai/
      intent.ts                   # rule/template matching
      orchestrator.ts             # chat pipeline
      summarizer.ts               # 결과 요약
    templates/
      registry.ts                 # 템플릿 정의
      sales.ts
      finance.ts
      crm.ts
      inventory.ts
      ops.ts
    db.ts
    permissions.ts
    dateRange.ts
  prisma/
    schema.prisma
    seed.ts
  docs/
    UNIPLAN_DATA_MODEL.md
    UNIPLAN_QUERY_TEMPLATES.md
```

## 5. 핵심 API

### `POST /api/chat`

요청:

```json
{
  "message": "이번 달 매출 어때?",
  "context": {
    "companyId": "demo-company",
    "userId": "demo-admin"
  }
}
```

응답:

```json
{
  "templateId": "sales.monthly_summary",
  "message": "이번 달 매출은 4,120만원입니다. 지난달 대비 8.4% 증가했습니다.",
  "resultType": "metric_chart_grid",
  "metrics": [
    { "label": "총매출", "value": 41200000 },
    { "label": "청구건수", "value": 38 }
  ],
  "chart": {
    "type": "line",
    "data": []
  },
  "grid": {
    "columns": [],
    "rows": []
  },
  "suggestions": ["일별 추이", "상품별 순위", "미수금 보기"]
}
```

### `GET /api/dashboard`

초기 대시보드 카드/차트/지연업무를 반환한다.

### `GET /api/templates`

개발 중 템플릿 목록과 예시 질문을 확인한다.

## 6. AI Orchestrator 흐름

```text
1. message normalize
   - 공백/특수문자 정리
   - 날짜 표현 변환: 이번 달, 지난달, 최근 30일

2. intent classification
   - MVP 1차: keyword/rule 기반
   - MVP 2차: LLM classification 추가

3. parameter extraction
   - date range
   - customer/product/employee 후보
   - limit

4. permission check
   - user role → required permission 확인

5. template execution
   - registry에서 templateId 조회
   - SQL parameter binding
   - read-only query 실행

6. response shaping
   - metric/cards/grid/chart 구조화
   - 짧은 요약 생성
   - suggestions 생성
```

## 7. Query Template 구조

```ts
export type QueryTemplate = {
  id: string;
  title: string;
  examples: string[];
  requiredPermissions: string[];
  params: TemplateParam[];
  resultType: 'summary' | 'metric_cards' | 'grid' | 'chart_line' | 'chart_bar' | 'mixed';
  sql: string;
  render: (rows: unknown[]) => RenderResult;
};
```

초기에는 `UNIPLAN_QUERY_TEMPLATES.md`의 SQL을 TypeScript registry로 옮긴다.

## 8. 보안/권한

### DB

- 앱 DB 계정은 MVP에서도 가능하면 read/write 분리한다.
- AI query runner는 read-only client만 사용한다.
- 모든 템플릿은 `company_id = currentCompanyId` 조건을 강제한다.

### AI

- LLM이 SQL을 생성해도 실행하지 않는다.
- LLM은 templateId/params 추천까지만 한다.
- 실제 SQL은 registry에 저장된 allowlist만 사용한다.

### 개인정보

- 주민번호, 계좌번호, 비밀번호, 토큰은 MVP schema에 넣지 않는다.
- 전화번호/이메일은 권한에 따라 마스킹 가능하게 둔다.

### U8 인증 경계

- 로그인 본문은 4 KiB로 제한하고, JSON 전체를 무제한으로 메모리에 올리기 전에 스트림 크기를 검사한다.
- 비밀번호 검증 전 PostgreSQL 원자적 upsert로 정규화된 회사/이메일 버킷(15분당 5회)과 전체 버킷(1분당 120회)을 함께 소비한다.
- limiter 테이블에는 SHA-256 또는 서버 비밀키 HMAC으로 만든 64자 버킷 키만 저장하며 회사 코드, 이메일, IP 원문은 저장하지 않는다.
- 로그인 성공 시 세션 생성, 사용자별 활성 세션 10개 제한, identity limiter 버킷 해제를 한 트랜잭션으로 처리한다.
- 인증된 API 응답은 성공/오류 모두 `Cache-Control: private, no-store`와 `Vary: Cookie`를 적용한다.
- 운영 환경은 하나의 명시적 HTTPS `UNIPLAN_APP_ORIGIN`만 신뢰하며 요청 URL이나 forwarded host로 대체하지 않는다.
- 외부 스케줄러가 `npm run auth:cleanup`을 호출해 만료 limiter 버킷과 보존기간이 지난 만료/폐기 세션을 정리한다. 이 저장소에서는 cron을 생성하지 않는다.

### U9 테넌트 무결성과 동시성 프로토콜

- 모든 테넌트 소유 관계는 PostgreSQL의 `(companyId, id)` 대체 키와 복합 외래 키로 방어한다. 애플리케이션의 `companyId` 조건도 그대로 유지한다.
- U9 마이그레이션은 기존 관계의 회사 불일치를 먼저 검사한다. 불일치가 하나라도 있으면 관계명을 포함한 오류로 전체 트랜잭션을 중단하고 소유권을 자동 수정하지 않는다.
- 품목, 창고, 재고 전기, BOM, 품목 카테고리, 내비게이션의 모든 쓰기는 `uniplan:u9:company-mutation:{companyId}`를 해시한 하나의 회사별 PostgreSQL advisory transaction lock을 먼저 획득한다.
- 하나의 회사별 키만 사용하므로 전역 잠금 순서는 항상 동일하다. 잠금 후 활성 상태, 재고, 사용 여부, BOM 출력/구성품/고정 하위 버전, 트리 순환을 다시 조회하고 같은 serializable transaction에서 기록한다.
- `P2034`, SQLSTATE `40001`, `40P01`은 최대 4회(호출자가 조정해도 6회 상한) 재시도하며, 소진 시 `CONCURRENT_MUTATION_CONFLICT`를 반환한다.
- 이 보수적 프로토콜은 같은 회사의 관련 쓰기를 직렬화한다. 현재 MVP의 정확성 우선 선택이며, 쓰기 처리량이 병목이 되면 동일한 순서를 보존하는 세분화된 키로 후속 분할한다.
- 재고 idempotency hash는 검증된 명령의 표준 표현을 사용한다. Decimal은 최소 표준 문자열, 텍스트는 저장 규칙과 같은 trim/null 규칙, 시간은 ISO, 논리 라인은 정렬한다. `createdById`는 불변 헤더에 저장되므로 operation identity에 포함한다.

## 9. 데모 데이터 전략

MVP seed는 실제 easierp 데이터를 직접 넣지 않고, 다음 도메인의 가짜 데이터를 생성한다.

- 고객 20개
- 상품 30개
- 직원 8명
- 매출/청구 6개월치
- 재고 입출고 3개월치
- 상담 50건
- AS 20건
- 업무 30건

이렇게 하면 정부지원/시연/개발 모두 안전하다.

## 10. 구현 마일스톤

### M1. 문서/스키마

- `UNIPLAN_DATA_MODEL.md` 완료
- `UNIPLAN_QUERY_TEMPLATES.md` 완료
- Prisma schema 작성
- seed 작성

### M2. API

- `/api/templates`
- `/api/dashboard`
- `/api/chat`
- rule 기반 intent matcher

### M3. UI

- dashboard cards
- chat panel
- grid renderer
- chart renderer
- suggestion buttons

### M4. AI 고도화

- LLM intent classifier
- 결과 자연어 요약 개선
- 후속 질문 추천

### M5. 사업계획서/시연 연결

- 랜딩/대시보드 캡처
- “자연어로 ERP 데이터 조회” 시연 시나리오
- 파일럿 고객용 데모 계정

## 11. 지금 당장 만들 프로토타입 범위

1. Next.js 프로젝트 생성
2. PostgreSQL 없이 우선 in-memory/mock data로 `/api/chat` 구현
3. 같은 구조로 나중에 Prisma/PostgreSQL 교체
4. 첫 질문 5개부터 동작
   - 이번 달 매출 어때?
   - 미수금 많은 거래처 TOP 10
   - 재고 부족한 품목
   - 상담 지연 건
   - 오늘 사업 현황 요약

처음부터 DB까지 붙이면 느려지므로, UI/대화/결과 구조를 먼저 검증하고 DB는 바로 다음 단계에서 붙인다.
