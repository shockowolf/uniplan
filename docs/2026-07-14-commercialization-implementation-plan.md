1|# UNIPLAN 상용화 구현계획 — 1~3개사 감독형 유료 파일럿
2|
3|작성일: 2026-07-14
4|상태: 실행용 기준 문서
5|
6|## 1. 목표
7|
8|현재 PostgreSQL 기반 UNIPLAN 프로토타입을 **국내 유통·단순 조립 제조 1~3개사**가 감독형으로 사용할 수 있는 초대형 B2B SaaS 파일럿으로 전환한다.
9|
10|첫 판매 단위는 전면 ERP가 아니라 다음 수직 슬라이스다.
11|
12|```text
13|회사별 실제 로그인
14|→ 권한에 맞는 경영 대시보드·품목·BOM·다중창고 재고
15|→ 승인된 읽기 전용 질의 템플릿 기반 AI 분석
16|→ 감사 가능하고 백업·복구 가능한 운영
17|```
18|
19|## 2. 현재 확인된 기준선
20|
21|- Next.js + Prisma + PostgreSQL 16 단일 스키마가 기준이다.
22|- 품목·BOM·창고·재고원장·재고이동·동적 메뉴 화면/API가 로컬에 구현됐다.
23|- PostgreSQL 통합 테스트 24개, typecheck, build가 통과했다.
24|- 재고 원장은 idempotency key/payload hash/serializable retry/reversal을 갖고 동시 요청·부분 실패 테스트가 있다.
25|- `User.passwordHash`, Role, UserRole, RolePermission은 있으나 로그인/세션은 없다.
26|- 현재 API 권한의 출발점은 고정 `authorizeDemoRequest()`이므로 상용 인증이 아니다.
27|- 신규 관리 경로는 현재 live에서 404이며, 실제 인증 전에는 배포하지 않는다.
28|- AI는 자유 SQL을 실행하지 않고 승인된 query template을 읽기 전용으로 실행한다.
29|
30|## 3. 출시 원칙
31|
32|1. **클라이언트가 companyId/userId를 결정하지 않는다.** 서버 세션에서만 파생한다.
33|2. **운영은 fail-closed.** 세션·권한·환경 설정이 없으면 401/403/503으로 닫는다.
34|3. **모든 쓰기는 멱등성과 트랜잭션을 검토한다.** 중복 요청, ACK 유실 재시도, 부분 실패, 재시작을 테스트한다.
35|4. **첫 파일럿은 화이트글러브 방식이다.** 자가 가입·자동결제·복잡한 엔터프라이즈 기능은 뒤로 미룬다.
36|5. **LLM은 조회 경로일 뿐 권한 주체가 아니다.** 모델 출력은 템플릿·파라미터 스키마를 통과해야 한다.
37|6. **실제 인증과 복구 훈련 전 신규 관리 화면을 production에 배포하지 않는다.**
38|
39|## 4. P0 — 파일럿 배포 차단 항목
40|
41|### Task U6 — 초대형 세션 인증
42|
43|구현 후보:
44|
45|- Prisma: `AuthSession`, `AuditEvent`
46|- `lib/auth/password.ts`: scrypt 기반 salted password hash/검증 또는 검증된 password KDF 패키지
47|- `lib/auth/session.ts`: 256-bit random token, DB에는 SHA-256 token hash만 저장
48|- `lib/auth/request.ts`: 쿠키→세션→active user/company context
49|- `lib/auth/origin.ts`: 상태변경 요청의 same-origin 검사
50|- `app/api/auth/login/route.ts`
51|- `app/api/auth/logout/route.ts`
52|- `app/api/auth/session/route.ts`
53|- `app/login/page.tsx`
54|- 보호 layout/middleware
55|- 초대 사용자 비밀번호 설정용 운영 CLI; 공개 signup은 없음
56|
57|세션 조건:
58|
59|- 쿠키: `HttpOnly`, production `Secure`, `SameSite=Lax` 또는 더 엄격, bounded Max-Age, Path `/`
60|- 원문 세션 토큰은 로그·DB·분석에 남기지 않음
61|- 만료·폐기·비활성 사용자·비활성 회사는 즉시 차단
62|- 로그인 오류는 이메일 존재 여부를 드러내지 않음
63|- production에서 demo fallback 금지
64|- development demo는 명시적 `UNIPLAN_DEMO_AUTH_ENABLED=true`일 때만 허용
65|
66|필수 테스트:
67|
68|- 성공/실패 로그인, 만료/폐기 세션, 비활성 사용자
69|- 다른 회사 ID를 body/query/header에 넣어도 세션 회사만 사용
70|- 쿠키 없음 401, 권한 없음 403
71|- 상태변경 cross-origin 거부
72|- 동일 토큰 원문이 DB에 없음
73|- 로그아웃 중복 요청의 안전성
74|
75|### Task U7 — 전 API 세션·RBAC 전환
76|
77|- `authorizeDemoRequest()` 호출을 `authorizeRequest(request, resourceCode, action)`으로 전환
78|- dashboard/chat/templates/navigation/settings/inventory API 전부 적용
79|- 도메인 서비스는 항상 명시적 server-derived `companyId`를 요구
80|- 메뉴 렌더링도 사용자의 DB 권한만 사용
81|- 401/403/404/409 응답을 일관된 API envelope로 반환
82|
83|필수 테스트:
84|
85|- 두 회사 fixture를 만들고 교차 조회/수정/IDOR 시도 0건 확인
86|- 역할별 read/create/update/delete/admin matrix
87|- 비활성 메뉴/역할/사용자 fail-closed
88|- AI template 실행도 같은 company scope를 사용
89|
90|### Task U8 — 최소 감사로그
91|
92|기록 대상:
93|
94|- 로그인 성공/실패(실패는 비식별·rate-limited)
95|- 로그아웃·세션 폐기
96|- 역할/권한/메뉴 변경
97|- 품목·BOM·창고·안전재고·재고이동/취소
98|- 데이터 import/export
99|
100|규칙:
101|
102|- actorUserId, companyId, action, resource, resourceId, requestId, result, createdAt
103|- 비밀번호, 세션 토큰, 원본 파일, 자유질의 원문, 고객 연락처는 payload에 저장하지 않음
104|- 도메인 쓰기와 감사 이벤트는 가능한 한 같은 DB transaction; 불가능한 외부 효과는 outbox 사용
105|
106|### Task U9 — 운영 백업·복구·health
107|
108|- versioned `pg_dump` 스크립트 + 암호화된 offsite 복사 대상
109|- 실행 중 lock/partial file 방지: 임시 파일→fsync/검증→atomic rename
110|- 월 1회 별도 DB로 restore drill
111|- `/api/health/live`: 프로세스 생존만 확인
112|- `/api/health/ready`: DB/migration/필수 설정 확인, 민감정보 미노출
113|- structured request ID/error log, 비밀/질의 원문 redaction
114|- 배포 전 backup, migrate deploy, smoke, rollback 순서 문서화
115|
116|### Task U10 — 파일럿 운영 정책·법적 화면
117|
118|개발:
119|
120|- 개인정보처리방침/이용약관 링크와 버전 기록
121|- 로그인/초대 시 동의 버전 저장
122|- 데이터 export/delete 요청 접수 상태
123|- AI 외부 전송 여부와 벤더 설정을 환경·정책에서 명확히 분리
124|
125|오너 결정 없이는 채우지 않을 값:
126|
127|- 공식 개인정보/고객지원 채널
128|- 사업자 표시정보
129|- 실제 보존기간과 위탁/국외이전 내용
130|- 파일럿 가격·계약기간·SLA·환불/해지 조건
131|
132|## 5. P1 — 첫 고객 도입
133|
134|### Task U11 — 검증 가능한 CSV/XLSX import/export
135|
136|- 고객사·품목·창고·초기재고부터 시작
137|- 업로드→dry-run 검증→오류 행 다운로드→명시적 확정
138|- 파일 hash + import idempotency key로 중복 반영 방지
139|- 확정은 transaction; 대량 작업은 batch checkpoint와 재개 가능 상태 사용
140|- export는 사용자 권한과 회사 범위를 재검증
141|
142|### Task U12 — AI 파일럿 경계
143|
144|- LLM intent 출력은 enum/schema/길이/날짜/페이지 크기 검증
145|- 승인 템플릿 외 실행 금지, 자유 SQL 금지 유지
146|- 개인정보 필드 기본 마스킹
147|- 회사별 일/월 query·token 예산, timeout, circuit breaker
148|- 모델 장애 시 규칙 기반 classifier/template fallback
149|- 모델 입력/출력 원문을 기본 로그에 남기지 않음
150|- local m1max 모델은 선택 가능한 adapter로 두되 파일럿 인증보다 우선하지 않음
151|
152|### Task U13 — 화이트글러브 온보딩
153|
154|- 회사 생성→관리자 초대→role/menu seed→dry-run import→샘플 대조→교육→승인 체크리스트
155|- 고객별 runbook과 복구 연락망
156|- 자동 결제 대신 계약/계좌이체/수동 세금계산서로 시작 가능
157|
158|## 6. P2 — 명확한 트리거 이후
159|
160|- PostgreSQL RLS: 5개사 이상 또는 개발자/서비스 수 증가 시 검토
161|- 관리형 DB/PITR: 파일럿 데이터 중요도·RPO/RTO가 로컬 운영을 초과할 때
162|- WAF/고급 SIEM/ISMS: 계약·규모·법적 의무가 발생할 때
163|- 자동 구독결제/세금계산서: 수동 청구가 운영 병목일 때
164|- 셀프 가입/셀프 온보딩: 화이트글러브 패턴이 안정된 뒤
165|- 모바일 네이티브 앱: 모바일 웹 사용 데이터가 근거를 만들 때
166|
167|## 7. 배포 게이트
168|
169|다음이 모두 통과하기 전 No-Go:
170|
171|- [ ] 실제 로그인/로그아웃/세션 만료·폐기
172|- [ ] production demo auth 완전 비활성
173|- [ ] 모든 API 401/403 및 두 회사 격리 테스트
174|- [ ] RBAC matrix와 IDOR 테스트
175|- [ ] 감사로그 민감정보 redaction
176|- [ ] backup 생성·검증 및 별도 DB restore drill
177|- [ ] Prisma migration status current
178|- [ ] typecheck, 전체 PostgreSQL tests, build
179|- [ ] Chrome desktop + Android 390px 핵심 흐름
180|- [ ] source/commit/container secret scan
181|- [ ] 배포 전 DB backup과 rollback rehearsal
182|- [ ] 오너가 정책·지원·가격·첫 고객 온보딩을 승인
183|
184|배포 순서:
185|
186|1. 운영 백업 및 hash 검증
187|2. migration dry review
188|3. 앱 이미지 빌드
189|4. maintenance 또는 blue/green 환경에서 `migrate deploy`
190|5. 로그인/API/DB smoke
191|6. 제한 사용자에게 신규 경로 오픈
192|7. 오류율·DB lock·세션 실패 모니터링
193|8. 실패 시 이전 앱 이미지 rollback; destructive migration 금지
194|
195|## 8. Codex 실행 순서
196|
197|1. **U6** 세션 인증 + 테스트만 구현
198|2. **U7** API/RBAC 전환 + 두 회사 격리 테스트
199|3. **U8** 감사로그
200|4. **U9** backup/restore/health
201|5. **U10** 정책/동의 launch gate
202|6. **U11** import/export
203|7. **U12** AI quota/fallback
204|8. 전체 review/browser/deploy gate
205|
206|각 task는 한 번에 하나만 구현하고, 변경 파일·테스트·위험을 보고한다. Hermes가 diff와 실제 실행 결과를 확인하기 전 commit/push/deploy하지 않는다.
207|
208|## 9. 오늘의 결론
209|
210|오늘 만든 재고·BOM 관리 기반은 파일럿 기능으로 충분히 가치가 있다. 그러나 현 시점 production 배포는 **No-Go**다. 다음 개발 우선순위는 LLM 연결이 아니라 U6/U7 실제 인증·회사 격리다. 이 게이트를 통과하면 기존 live를 새 관리 기능이 포함된 제한 파일럿으로 승격할 수 있다.
211|