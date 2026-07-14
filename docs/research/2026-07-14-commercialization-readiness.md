1|# UNIPLAN 상용화 준비도 검토 보고서 (Commercialization Readiness)
2|
3|**문서 작성일**: 2026년 7월 14일
4|
5|본 보고서는 UNIPLAN을 현재의 프로토타입 단계에서 유료 판매가 가능한 한국형 중소기업(SMB) B2B SaaS로 전환하기 위한 의사결정용 리뷰입니다. 저장소 내 관측된 팩트(Facts), YAGNI(You Aren't Gonna Need It) 원칙에 기반한 최소 실행 권고안(Recommendations), 그리고 확인이 필요한 항목(Needs Verification)을 엄격히 구분하여 작성하였습니다.
6|
7|---
8|
9|## 1. 타겟 초기 ICP 및 판매 가능한 버티컬 슬라이스
10|
11|*   **초기 타겟 ICP (Ideal Customer Profile)**
12|    *   **규모 및 업종**: 직원 수 10~50명 규모의 국내 유통/도소매업 및 단순 조립형 제조업.
13|    *   **고통점(Pain Point)**: 대표이사/경영진이 실시간 매출, 미수금, 창고 재고를 파악하기 위해 실무자에게 엑셀 보고를 지시해야 하는 지연된 의사결정 구조.
14|*   **초기 판매 슬라이스 (Sellable Vertical Slice)**
15|    *   **AI ERP Analyst**: 자연어 기반 사업 현황 질의응답 (예: "이번 달 매출 어때?", "재고 부족 품목 알려줘").
16|    *   **Core ERP 뷰어**: 불변 원장(Immutable Ledger) 기반의 다중 창고 재고/BOM 조회, 기초 수주/청구/미수 현황 대시보드.
17|    *   *Recommendation*: 첫 출시는 결제/전자세금계산서 '발행' 기능을 배제하고, 기존 ERP/엑셀 데이터를 조회하고 AI로 분석하는 **'경영진용 AI 조회 채널'**로 포지셔닝하여 운영 리스크를 최소화합니다.
18|
19|## 2. 상용화 로드맵: P0 / P1 / P2
20|
21|*   **P0 (Launch Blockers - 상용화 필수 조건)**
22|    *   보안 기반 실제 인증(Auth) 및 인가(RBAC) 체계 구현.
23|    *   DB 접근 제어(RLS 등)를 통한 완벽한 테넌트 격리.
24|    *   프롬프트 인젝션(Prompt Injection) 방어 및 AI 비용(Cost) 제어 시스템.
25|    *   한국 개인정보처리방침 및 서비스 이용약관 마련.
26|*   **P1 (First-Customer - 첫 파일럿 고객사 도입 조건)**
27|    *   기존 데이터 초기 임포트 기능 (고객사/품목/초기재고 엑셀 업로드).
28|    *   기본 백업/복구(PITR) 및 관측성(Observability) 환경 구축.
29|    *   고객 지원 채널(슬랙 커넥트 또는 카카오톡 채널) 오픈.
30|*   **P2 (Scale Items - 다수 고객 확장 시점)**
31|    *   모바일 전용 컴패니언 앱(Flutter 등) 정식 출시.
32|    *   자동화된 SaaS 구독 결제 및 홈택스 세금계산서 연동 자동화.
33|    *   고객사 자가 온보딩(Self-serve Onboarding) 파이프라인.
34|
35|## 3. 아키텍처, 보안, 인증 및 테넌트 격리
36|
37|*   **현재 팩트**: Next.js, Prisma, PostgreSQL 16을 사용하며 논리적 테넌트 격리(`companyId` 컬럼)를 기반으로 `Company`, `User`, `Role` 테이블이 존재함. 그러나 실제 인증 흐름(Authentication)은 미완성이며 프로토타입 범위에서 서버 유도 데모 ID를 사용 중임.
38|*   **Recommendations**:
39|    *   **Auth**: NextAuth(Auth.js) 또는 Supabase Auth를 즉각 도입하여 세션/JWT 기반의 강력한 인증 적용.
40|    *   **Tenant Isolation**: Prisma 쿼리 시 실수로 `companyId` 누락을 방지하기 위해, PostgreSQL의 RLS(Row-Level Security)를 활성화하여 DB 레벨에서 컨텍스트 기반 격리를 강제하는 방안(Prisma Client Extension 활용)을 최우선 도입.
41|    *   **Security**: 애플리케이션 외부에 WAF(Web Application Firewall)를 배치.
42|
43|## 4. RBAC, 감사(Audit), 데이터 임포트/익스포트
44|
45|*   **현재 팩트**: DB 스키마에 `Role`, `RolePermission`, `MenuItem` 구조를 통해 세밀한 권한 제어 기반이 마련되어 있음.
46|*   **Recommendations**:
47|    *   **RBAC**: DB에 저장된 권한 설정을 API 미들웨어 및 쿼리 템플릿 실행 단계에서 강제(Enforcement)하는 코드 추가 필요.
48|    *   **Audit**: 핵심 액션(사용자 로그인 권한 변경 등)에 대한 감사 로그(Audit Log) 테이블 신설. 원장(Ledger) 변경은 이미 기록되고 있음.
49|    *   **Import/Export**: 최소주의(YAGNI)에 따라 초기엔 서버 관리자가 DB에 스크립트로 밀어 넣는 방식을 허용하되, 고객 데이터 락인(Lock-in) 방지를 위해 화면 상에서 엑셀 Export 기능은 P1으로 반드시 제공해야 함.
50|
51|## 5. DB 마이그레이션, 백업, 복구, 관측성 및 장애 대응
52|
53|*   **현재 팩트**: Prisma Migrate를 통해 형상 관리가 진행 중임. 운영 인프라는 미정.
54|*   **Recommendations**:
55|    *   **운영 DB 인프라**: 관리형 PostgreSQL 인프라(AWS RDS 또는 Supabase)를 활용하여 PITR(Point-in-Time Recovery)을 설정해 초 단위 복구 능력 확보.
56|    *   **Observability**: 예산이 부족한 초기엔 Vercel Analytics(성능/트래픽) 및 Sentry(에러 트래킹) 조합으로 시작.
57|    *   **Incident Response**: 슬랙(Slack) 기반의 알림 체계를 연동하여 에러 스파이크 발생 시 즉각 대응할 수 있는 내부 SLA 내규 확립.
58|
59|## 6. 동시성(Concurrency) 및 멱등성(Idempotency)
60|
61|*   **현재 팩트**: 저장소 내 `InventoryTransaction` 모델에 `idempotencyKey`, `payloadHash`, `reversalOfId` 필드가 명확히 적용되어 훌륭한 불변 원장(Immutable Ledger) 아키텍처를 가짐.
62|*   **Recommendations**:
63|    *   **동시성 제어**: 동일한 재고 차감 요청이 동시에 들어올 때 Race Condition을 방지하기 위해 DB 트랜잭션 격리 수준(Isolation Level)을 점검하고 필요시 낙관적 락(Optimistic Locking) 도입.
64|    *   향후 수주(`SalesOrder`) 및 청구(`Invoice`)의 상태 변경 처리 시에도 현재의 재고 트랜잭션과 동일한 멱등성 보장 아키텍처를 확장 적용해야 함.
65|
66|## 7. AI 안전성 (Read-only Safety, 방어, Fallback, 비용 통제)
67|
68|*   **현재 팩트**: AI는 자유 SQL을 데이터베이스에 직접 실행하지 않으며, 승인된 템플릿(Query Template)을 조회해 파라미터만 바인딩하는 방식으로 설계됨 (`app/api/chat/route.ts`, `lib/ai/orchestrator.ts`). 이는 데이터 안전성 측면에서 매우 우수함.
69|*   **Recommendations**:
70|    *   **Prompt Injection 방어**: LLM이 반환하는 추출 파라미터를 그대로 믿지 말고, 반드시 Zod 등의 스키마 검증 라이브러리로 타입/범위/길이 체크를 거친 뒤 SQL 템플릿에 주입해야 함.
71|    *   **Data Leak 방어**: AI 질의 결과에서 민감정보(전화번호 등) 마스킹 렌더링 로직 추가.
72|    *   **Fallback & Cost Controls**: OpenAI/Anthropic API 장애 시 우회(Fallback)하는 라우팅 도입 및 테넌트(`companyId`) 단위로 일간 토큰 사용 비용 할당량을 설정해 초과 시 차단하는 회로 차단기(Circuit Breaker) 구축 필수.
73|
74|## 8. 과금, 구독, 세금계산서 시사점
75|
76|*   **Recommendations**:
77|    *   **초기 과금**: PG사 연동이나 자동결제 구현 없이 오프라인(계좌이체) 기반 연간 선불/월별 청구 모델로 시작. 세금계산서는 홈택스 수동 발행으로 운영(YAGNI 적용).
78|    *   **과금 모델**: ERP 성격상 사용자 수(Seat) 기준 과금이 익숙하나, AI 토큰 사용 비용을 고려하여 기본 Seat + 쿼리 건수(또는 월 토큰 한도) 기반의 혼합 과금제 검토 권장.
79|
80|## 9. 개인정보, 약관, DPA 및 한국 운영 제반사항
81|
82|*   **Needs Verification (확인 필요 사항)**:
83|    *   **데이터 국외 이전**: 사용자의 입력 질의 및 추출 데이터 일부가 미국 소재(OpenAI, Anthropic 등) 서버로 전송됨. 한국 개인정보보호법(PIPC 기준) 상 '국외 제3자 정보 제공 동의'가 필수적임 ([참고: 개인정보보호위원회, pipc.go.kr, Access Date: 2026-07-13]).
84|    *   **AI 벤더 학습 방지**: 클라우드 AI 벤더와 DPA(Data Processing Agreement)가 체결 가능한 Enterprise/API Tier를 사용하는지 점검 필수(사용자 데이터가 AI 학습에 쓰이지 않는다는 명시적 확인 요망).
85|*   **Recommendations**:
86|    *   가입 화면에 서비스 이용약관 및 개인정보처리방침 명시.
87|    *   초기 스타트업 규모에서 KISA ISMS 인증 등은 불필요(YAGNI)하며, 기본 DB 암호화(Encryption At-Rest)와 HTTPS 통신 의무만 철저히 준수.
88|
89|## 10. 온보딩, 지원, SLA
90|
91|*   **Recommendations**:
92|    *   초기 파일럿 고객사(1~5개)는 셀프 온보딩을 강제하지 않고, 영업 담당자가 직접 방문하여 초기 데이터 엑셀 맵핑 및 교육을 돕는 '화이트글러브(White-glove)' 온보딩 전략을 채택.
93|    *   SLA(Service Level Agreement)는 상용화 초기이므로 Best Effort 수준으로 약관에 방어적으로 명시.
94|
95|## 11. QA, 모바일, 접근성 및 브라우저 호환성
96|
97|*   **Recommendations**:
98|    *   **Browser Matrix**: B2B ERP 특성상 PC는 Google Chrome 기반 환경 최우선 QA 타겟으로 설정.
99|    *   **Mobile**: 전용 앱(네이티브 앱) 개발보다 우선적으로 모바일 웹 브라우저(iOS Safari 및 Android Chrome)에서 챗 인터페이스 사용성에 집중.
100|
101|## 12. 배포, CI/CD, Secrets
102|
103|*   **현재 팩트**: `package.json`에 `typecheck`, `test` 스크립트가 구성되어 있음.
104|*   **Recommendations**:
105|    *   **CI/CD**: GitHub Actions를 통한 Lint/Typecheck 자동화 및 Vercel, AWS Amplify 등을 활용한 메인 브랜치 자동 배포 파이프라인 정립.
106|    *   **Secrets**: `.env` 파일 관리 체계를 벗어나 프로덕션 배포 환경의 Secrets Manager 연동으로 관리자 외 접근 차단.
107|
108|## 13. 프라이싱 및 파일럿 플랜 (Pricing & Pilot Plan)
109|
110|*   **Recommendations**:
111|    *   **Pilot Plan**: 1~3개월 무료 또는 파격 할인된 '얼리버드 플랜'을 제공하되, "정기 피드백 세션(주 1회 인터뷰) 의무 참여" 조건을 반드시 걸어 제품-시장 적합성(PMF) 검증.
112|    *   **정식 Pricing Model**: 기능 제어보다는 토큰 볼륨/창고 수 등 실사용 리소스 기반의 티어(Basic / Pro) 구성 권장.
113|
114|## 14. 즉시 구현 가능한 Task vs 오너 의사결정 사항
115|
116|### 🛠️ 개발팀 당장 실행 가능 (Implemented Today)
117|1.  **Auth 기반 구현**: `app/api/*` 경로 전반에 걸친 세션 확인 미들웨어 추가.
118|2.  **API 파라미터 방어**: `zod` 패키지를 이용해 AI 오케스트레이터의 템플릿 파라미터 매핑 전면 검증 파이프라인 셋업.
119|3.  **옵저버빌리티(Observability)**: 프로덕션 배포 파이프라인 구성 및 Sentry 초기 연동.
120|
121|### 💼 비즈니스/오너 결정 사항 (Owner/Business Decisions)
122|1.  **첫 고객사 파이프라인**: 수동 화이트글러브 온보딩을 감내할 첫 1호 레퍼런스 고객사 발굴.
123|2.  **AI 모델 원가 결정**: 속도 및 비용(예: GPT-4o mini) vs 추론 능력(예: Claude 3.5 Sonnet)에 따른 원가 구조 마진 확보.
124|3.  **약관 제정**: 서비스 이용약관, 개인정보처리방침, 제3자 제공 동의서 초안 법무 검토.
125|
126|## 15. Go/No-Go 상용화 체크리스트 (최종 점검)
127|
128|- [ ] **Auth & Tenant Isolation**: 실제 인증 시스템 및 RLS 기반 테넌트 격리가 DB 레벨에서 완벽히 완료되었는가? (현재 ❌ No-Go)
129|- [ ] **Legal & Privacy**: 이용약관, 개인정보처리방침, AI 연동에 따른 국외 제3자 제공 동의 절차가 마련되었는가? (현재 ❌ No-Go)
130|- [ ] **AI Safety**: DB 쓰기 권한이 없는 읽기 전용(Read-only) 연결로 AI 쿼리 템플릿 엔진이 분리되어 있는가? (현재 ✅ Go)
131|- [ ] **Pilot Onboarding Plan**: 첫 고객사를 위한 초기 데이터(엑셀 등) 수동 이관 계획이 세워져 있는가? (현재 ❌ No-Go)
132|
133|---
134|*UNIPLAN 상용화 준비도 검토 보고서 종료.*
135|