# UNIPLAN AI ERP 점검 메모 - 2026-05-03

## 현재 자산

- 사업계획서 원본/추출본
  - `~/Documents/2026년도 테크아틀리에 사업계획서 초창패 완성본 (1).hwp/.pdf`
  - `~/Documents/테크아틀리에 ver.3.pdf`, `~/Documents/테크아틀리에 ver.4.hwp`
  - 추출 텍스트: `workspace/hwp_extract`, `workspace/pdf_extract`
- MVP 정의 문서
  - `workspace/uniplan/UNIPLAN_MVP.md`
- 참고 UI/브랜드
  - `~/Documents/dashboard.png`
  - `~/Documents/Tech_Atelir_.png`
- 레거시 ERP 참고/복구 자산
  - `project-intake-20260429/erp_sts/erpGootz`
  - `db-recovery-runtime/schema/easihomepage_new_skeleton.sql`
  - `db-recovery-runtime/schema/local_erp_public_feature_dummy_seed.sql`

## 확인된 핵심 방향

UNIPLAN은 “메뉴를 찾아 들어가는 ERP”가 아니라, 사용자가 자연어로 묻고 AI가 ERP 데이터를 안전하게 조회·요약·시각화하는 경량 AI ERP로 잡는 것이 맞다.

MVP 핵심은 다음 4개다.

1. ERP-like 데모 데이터 모델
2. 안전한 읽기 전용 query template
3. 채팅 기반 질의/응답 API
4. 표/차트/카드 렌더링 UI

## 사업계획서와 MVP의 일치점

- 타겟: 5~50인 규모 중소 제조/유통/서비스 기업
- 문제: ERP 도입비/복잡도/분산 데이터/수작업 조회 부담
- 솔루션: 웹 기반 경량 ERP + 생성형 AI 자연어 조회/요약
- 산출물: 챗봇 포함 ERP 웹사이트
- 초기 모듈: 직원, 고객, 거래처, 재고, 매출/관리 정보
- 확장: MES, 쇼핑몰, POS/QR 주문, 홈페이지, 마케팅, 자체 AI

## 현재 강점

- 사업계획서의 문제-솔루션-로드맵은 이미 MVP 방향과 대체로 정합성이 있다.
- gootzERP에는 DevExpress grid/chart, dashboard, sales/account/customer/employee 등 참고할 화면 자산이 많다.
- easierp/homeEasisoft 계열에는 도메인/메뉴/권한/홈카드 구조와 DB 스키마 참고 자산이 있다.
- `UNIPLAN_MVP.md`가 제품 정의, 아키텍처, 안전 원칙, 초기 query template 목록까지 잘 잡고 있다.

## 현재 빈칸 / 리스크

1. 실제 신규 앱 코드가 아직 없다.
   - 현재 `uniplan`에는 문서만 있다.
2. 데이터 모델 문서가 없다.
   - sales/customers/products/inventory/receivables/consultations/employees 최소 ERD가 필요하다.
3. query template 스펙이 아직 문서화되지 않았다.
   - 자연어 예시, 파라미터, SQL, 권한, 결과 타입까지 고정해야 AI 위험을 줄일 수 있다.
4. 기술 스택 결정을 아직 내려야 한다.
   - 권장: 신규 서비스로 분리. 레거시 Spring/JSP는 참고 자산으로만 사용.
5. 사업계획서 표현 중 일부는 다듬는 게 좋다.
   - “자체 AI 모델 개발/내재화”는 초기 MVP에서는 과하게 보일 수 있음.
   - 정부지원용 문서에서는 “외부 API 연동 후 보안 요구에 따라 온프레미스/프라이빗 모델 검토” 정도가 더 안전하다.
6. 가격/매출 가정은 근거 보강 필요.
   - 1년차 40개 고객, 3년차 500개 고객은 가능하지만, 파일럿→유료전환율→채널별 유입 근거가 필요하다.

## 추천 기술 방향

### 제품 MVP

- Frontend: Next.js 또는 React
- Backend: NestJS 또는 Spring Boot 3
- DB: PostgreSQL 우선
- AI: 처음에는 rule/template matching + LLM intent classification
- Chart/Grid: DevExtreme/DevExpress 스타일 참고, 라이선스 이슈 확인

### 원칙

- 레거시 프로젝트를 그대로 이어붙이지 않는다.
- 레거시는 화면 패턴/도메인/쿼리/메뉴 구조 참고용으로 쓴다.
- AI는 production DB에 직접 SQL 생성/실행하지 않는다.
- 읽기 전용 계정 + allowlisted query template만 허용한다.

## 다음 산출물 우선순위

1. `UNIPLAN_DATA_MODEL.md`
   - 최소 테이블/관계/샘플 데이터 정의
2. `UNIPLAN_QUERY_TEMPLATES.md`
   - 20개 MVP 분석 템플릿 구체화
3. `UNIPLAN_ARCHITECTURE.md`
   - FE/BE/AI/DB/API 구조 결정
4. `UNIPLAN_SECURITY.md`
   - read-only, 권한, PII masking, approval policy
5. 실제 prototype repo 생성
   - demo seed + `/api/chat` + dashboard/chat UI

## 가장 좋은 다음 한 수

바로 코딩하기 전에 `UNIPLAN_DATA_MODEL.md`와 `UNIPLAN_QUERY_TEMPLATES.md`를 먼저 만드는 게 좋다.

이 둘이 있어야 사업계획서, MVP, 실제 구현이 한 줄로 이어진다.
