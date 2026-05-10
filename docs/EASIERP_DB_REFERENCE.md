# easiERP DB Reference for Uniplan

이 문서는 easiERP 계열 DB 구조를 Uniplan ERP 설계에 재사용하기 위한 참조 노트다. 원본 SQL 덤프나 데이터는 저장소에 넣지 않고, 테이블 구조와 업무 의미만 정리한다.

## Source Inventory

| 구분 | 로컬 경로 | 용도 | 신뢰도 |
|---|---|---|---|
| 스키마 DDL | `/Users/gorani/.openclaw/workspace/db-recovery-runtime/schema/easihomepage_new_skeleton.sql` | 테이블/컬럼/PK 확인 | 높음 |
| 루틴 | `/Users/gorani/.openclaw/workspace/db-recovery-runtime/schema/easihomepage_new_routines.sql` | 프로시저/함수 후보 확인 | 중간 |
| 메뉴/사용자 seed | `/Users/gorani/.openclaw/workspace/db-recovery-runtime/schema/local_dummy_menu_user_seed.sql` | 메뉴, 사용자, 권한 초기 데이터 참고 | 높음 |
| 공개 기능 seed | `/Users/gorani/.openclaw/workspace/db-recovery-runtime/schema/local_erp_public_feature_dummy_seed.sql` | ERP 공개 기능/메뉴 참고 | 높음 |
| Easisoft seed | `/Users/gorani/.openclaw/workspace/db-recovery-runtime/schema/local_public_easisoft_seed.sql` | easisoft 도메인/기본값 참고 | 높음 |
| gootzERP mappers | `/Users/gorani/.openclaw/workspace/project-intake-20260429/erp_sts/erpGootz/src/main/resources/mapper` | 실제 화면/쿼리에서 쓰는 조인과 검색 조건 확인 | 중간 |
| MySQL data files | `/Users/gorani/.openclaw/workspace/db-recovery-runtime/mysql84-data/easihomepage_new` | 물리 데이터 복구 후보 | 낮음, 아직 검증 전 |
| ZIP archives | `/Users/gorani/Downloads/workSpaceForIntelliJ.zip`, `/Users/gorani/Downloads/workSpaceForSts.zip`, `/Users/gorani/Downloads/#베트남김태웅팀장개발자자료20211122.zip` | 과거 프로젝트 원천 자료 | 중간 |

## Recovery Confidence

| 등급 | 의미 | Uniplan 반영 방식 |
|---|---|---|
| High | DDL에서 직접 확인된 테이블/컬럼/PK | Prisma 모델 설계의 1차 기준 |
| Medium | mapper XML, JSP 화면, seed 데이터로 추론한 업무 관계 | 화면/쿼리 설계 후보로 사용 |
| Low | `.ibd`/`.sdi` 등 물리 파일만 존재하거나 복구 전인 데이터 | 실제 반영 전 별도 복구 검증 필요 |

## Table Prefix Map

`easihomepage_new_skeleton.sql` 기준 테이블은 466개이며, 접두어별 역할은 아래처럼 볼 수 있다.

| Prefix | Count | 업무 영역 | Uniplan 우선도 |
|---|---:|---|---|
| `tbcom` | 134 | 회사, 도메인, 사용자, 권한, 메뉴, 공통코드, 게시판, 첨부, 알림, 일정 | 1 |
| `tbcrm` | 71 | 고객, 담당자, 상담/신청, 포인트, 특수 상담 상품 | 2 |
| `tbshp` | 35 | 쇼핑몰 상품, 주문, 결제, 배송 | 4 |
| `tbrvr` | 26 | 예약/시설/서비스 | 4 |
| `tbmyc` | 25 | 주문/스케줄/쿠폰/상품 매핑 | 4 |
| `tbhtc` | 23 | 헬스케어/데모요청/재고/수수료 | 3 |
| `tbsal` | 21 | 견적, 계약, AS, 영업활동 | 2 |
| `tbhrm` | 16 | 직원, 조직, 휴가, 근무보고, 차량 | 3 |
| `tbads` | 14 | 광고/요청/대출/배너 | 5 |
| `tbfin` | 14 | 계좌, 입출금, 현금, 비용, 급여, 세무 | 2 |
| `tbprd` | 12 | 상품, 부품, 카테고리, 창고, 재고 입출고 | 2 |
| `tbedu` | 9 | 교육/시험/수강생/강사 | 5 |
| `tbbil` | 6 | 청구, 세금계산서, 과금 정책 | 2 |
| `tbren` | 5 | 렌탈 계약/예약 | 4 |
| `tbzom` | 5 | 화상회의/채널 | 5 |
| `tbcot` | 3 | 연락처/연락처 그룹 | 4 |
| `tbfac` | 3 | 시설/방문/사용 | 4 |
| `tbmet` | 3 | 모임/회원/초대 | 5 |
| `tbwea` | 3 | 날씨 예보 | 5 |
| `tbg2b` | 2 | B2B 계약/부품 연도 | 4 |
| `tbsum` | 2 | 사용자 차트/차트 데이터 | 3 |
| `tbsys` | 2 | 서버 리소스/URL 로그 | 5 |
| `tbtrd` | 2 | 무역 BL/상품 | 4 |
| 기타/임시 | 29 | 테스트, 임시, 프로젝트별 로드 테이블 | 보류 |

## Core ERP Nucleus

Uniplan에서 먼저 복구해야 하는 중심 구조다. 이 순서대로 모델링하면 메뉴/권한 기반 ERP 화면과 AI 읽기 전용 분석을 함께 만들 수 있다.

### 1. Tenant, Domain, Common Code

| Legacy table | Key | 역할 | Uniplan target |
|---|---|---|---|
| `tbcom_company` | `company_cd` | 회사 기본정보, 사업자정보, 주소, 로고/도장 첨부 | `companies` |
| `tbcom_domain` | `domain_nm` | ERP/HOME/SHOP 도메인, 사이트명, 연락처, 메타, 발신 설정 | `domains` |
| `tbcom_domain_company` | inferred | 도메인-회사 연결 | `domain_companies` |
| `tbcom_cd` | `company_cd`, `parent_cd`, `cd` | 회사별 공통코드 | `common_codes` |
| `tbcom_sequence` | inferred | 업무 번호 채번 | `number_sequences` |

### 2. Identity, Menu, Authorization

| Legacy table | Key | 역할 | Uniplan target |
|---|---|---|---|
| `tbcom_user2` | `company_cd`, `domain_nm`, `user_id` | 사용자 로그인/프로필/설정 | `users` |
| `tbcom_role` | `company_cd`, `domain_nm`, `role_cd` | 역할 정의 | `roles` |
| `tbcom_user_role` | `company_cd`, `domain_nm`, `user_id`, `role_cd` | 사용자-역할 매핑 | `user_roles` |
| `tbcom_menu` | `menu_id` | 메뉴 원장, URL, 도메인 타입 | `menus` |
| `tbcom_menu_map` | `map_id` | 메뉴 트리, 상위 메뉴, 노출 순서 | `menu_nodes` |
| `tbcom_domain_menu_map` | `company_cd`, `domain_nm`, `map_id` | 도메인별 메뉴 트리 | `domain_menu_nodes` |
| `tbcom_role_menu` | `company_cd`, `domain_nm`, `role_cd`, `map_id` | 메뉴별 조회/등록/수정/삭제/관리 권한 | `role_menu_permissions` |
| `tbcom_url_auth` | inferred | URL 접근 권한 | `route_permissions` |

메뉴는 Uniplan의 좌측 sidebar를 DB 기반으로 전환할 때 가장 먼저 쓸 구조다. 기존 easiERP처럼 `menu` 원장과 `menu_map` 트리를 분리하고, 역할 권한은 CRUD 플래그로 보존한다.

### 3. CRM and Customer Master

| Legacy table | Key | 역할 | Uniplan target |
|---|---|---|---|
| `tbcrm_cust_info` | `cust_no`, `company_cd` | 고객/거래처 원장 | `customers` |
| `tbcrm_cust_man` | `company_cd`, `seq` | 고객사 담당자 | `customer_contacts` |
| `tbcrm_cust_address` | inferred | 고객 주소 | `customer_addresses` |
| `tbcrm_cust_memo` | inferred | 고객 메모 | `customer_memos` |
| `tbcen_consult` | inferred | 상담 접수/진행 | `consultations` |
| `tbcom_partner` | inferred | 협력사/파트너 | `vendors` |
| `tbcom_partner_worker` | inferred | 협력사 담당자 | `vendor_contacts` |

### 4. Sales, Contract, Billing

| Legacy table | Key | 역할 | Uniplan target |
|---|---|---|---|
| `tbsal_est` | `company_cd`, `est_no` | 견적 헤더, 금액 합계 | `quotations` |
| `tbsal_est_item` | inferred | 견적 항목 | `quotation_items` |
| `tbsal_est_product` | inferred | 견적 상품 | `quotation_products` |
| `tbsal_sell_contract` | `company_cd`, `contract_no` | 판매/수주 계약 헤더 | `sales_orders` |
| `tbsal_sell_contract_product` | inferred | 계약 상품 | `sales_order_items` |
| `tbsal_sales_activity` | inferred | 영업활동 | `sales_activities` |
| `tbsal_as` | inferred | AS 접수 | `service_cases` |
| `tbbil_invoice` | `bil_seq` | 청구/납부/미수 | `invoices` |
| `tbbil_taxbil` | inferred | 세금계산서 | `tax_invoices` |
| `tbbil_taxbil_item` | inferred | 세금계산서 품목 | `tax_invoice_items` |

### 5. Product and Inventory

| Legacy table | Key | 역할 | Uniplan target |
|---|---|---|---|
| `tbprd_product` | `prod_cd`, `company_cd` | 상품 원장 | `products` |
| `tbprd_parts` | `company_cd`, `prod_cd` | 부품/품목 원장, 재고수량, 단가 | `items` |
| `tbprd_cat` | inferred | 상품 카테고리 | `product_categories` |
| `tbprd_cat_parts` | inferred | 카테고리-품목 매핑 | `product_category_items` |
| `tbprd_storage` | inferred | 창고/보관 위치 | `warehouses` |
| `tbprd_stock_inout` | `company_cd`, `inout_seq` | 재고 입출고 | `inventory_movements` |
| `tbhtc_inventory` | inferred | 업종별 재고 현재고 후보 | `inventory_balances` |
| `tbhtc_stock_inout` | inferred | 업종별 입출고 후보 | `inventory_movements` |

### 6. Finance and Accounting Lite

| Legacy table | Key | 역할 | Uniplan target |
|---|---|---|---|
| `tbfin_bank_acct` | `company_cd`, `bank_acct_no` | 은행 계좌 | `bank_accounts` |
| `tbfin_bank_acct_inout` | inferred | 계좌 입출금 | `bank_transactions` |
| `tbfin_cash` | `company_cd`, `cash_seq_no` | 현금 출납 | `cash_transactions` |
| `tbfin_cost` | inferred | 비용 헤더 | `expenses` |
| `tbfin_cost_item` | inferred | 비용 항목 | `expense_items` |
| `tbfin_emp_salary` | inferred | 급여 | `payroll_entries` |

### 7. HR and Operations

| Legacy table | Key | 역할 | Uniplan target |
|---|---|---|---|
| `tbhrm_emp` | `company_cd`, `emp_no` | 직원 원장 | `employees` |
| `tbhrm_org` | inferred | 조직/부서 | `departments` |
| `tbhrm_vacation` | inferred | 휴가 | `leave_requests` |
| `tbhrm_work_report` | inferred | 근무/업무보고 | `work_reports` |
| `tbcom_task` | inferred | 업무 | `tasks` |
| `tbcom_todo` | inferred | 할 일 | `todos` |
| `tbcom_memo` | inferred | 메모 | `memos` |
| `tbcom_schedule` | inferred | 일정 | `schedules` |

### 8. Files, Boards, Portal Features

| Legacy table | 역할 | Uniplan target |
|---|---|---|
| `tbcom_attach`, `tbcom_attach_detail`, `tbcom_attach_thumbnail` | 첨부 파일 메타데이터 | `attachments`, `attachment_files` |
| `tbcom_bbs2`, `tbcom_bbs_article2`, `tbcom_bbs_reply2` | 게시판/게시글/댓글 | `boards`, `board_posts`, `board_comments` |
| `tbcom_home_card`, `tbcom_home_card_company` | 홈 카드/대시보드 카드 | `dashboard_cards` |
| `tbcom_bookmark`, `tbcom_favorite` | 사용자 즐겨찾기 | `favorites` |
| `tbsum_mychart`, `tbsum_mychart_data` | 사용자 차트 | `saved_charts` |

## Key Legacy Table Notes

| Table | Confirmed key | Notes |
|---|---|---|
| `tbcom_company` | `company_cd` | 회사 프로필, 사업자번호, 주소, 로고/직인 첨부, 약관/정책 필드를 포함한다. |
| `tbcom_domain` | `domain_nm` | `company_cd`, `domain_type`(`ERP`, `HOME`, `SHOP`)을 포함한다. |
| `tbcom_user2` | `company_cd`, `domain_nm`, `user_id` | easiERP의 멀티테넌트 사용자 기준으로 보인다. |
| `tbcom_role_menu` | `company_cd`, `domain_nm`, `role_cd`, `map_id` | `sel`, `ins`, `upd`, `del`, `adm_role_yn` 성격의 권한 플래그를 보존해야 한다. |
| `tbcrm_cust_info` | `cust_no`, `company_cd` | 고객/거래처 중심 테이블이다. |
| `tbcrm_cust_man` | `company_cd`, `seq` | 담당자 테이블이며 고객 번호 연결을 기준으로 마이그레이션한다. |
| `tbsal_est` | `company_cd`, `est_no` | 견적 헤더와 합계 금액을 담는다. |
| `tbsal_sell_contract` | `company_cd`, `contract_no` | 판매 계약/수주 헤더다. |
| `tbbil_invoice` | `bil_seq` | 청구, 납부, 미수 분석의 시작점이다. |
| `tbprd_product` | `prod_cd`, `company_cd` | 상품 원장이다. |
| `tbprd_parts` | `company_cd`, `prod_cd` | 품목/부품 원장과 재고/단가 필드가 있다. |
| `tbprd_stock_inout` | `company_cd`, `inout_seq` | 재고 흐름 분석의 기준이다. |
| `tbfin_bank_acct` | `company_cd`, `bank_acct_no` | 계좌 원장이다. |
| `tbfin_cash` | `company_cd`, `cash_seq_no` | 현금 출납장이다. |
| `tbhrm_emp` | `company_cd`, `emp_no` | 직원 원장이다. |

## Mapper Observations

gootzERP에는 mapper XML이 79개 있다. 이 mapper들은 실제 ERP 화면에서 어떤 테이블 조합을 쓰는지 보여준다.

주의할 점은 `easihomepage_new_skeleton.sql`에 있는 범용 테이블명과 gootzERP mapper의 프로젝트별 테이블명이 완전히 일치하지 않는 경우가 있다는 것이다. 예를 들어 일부 mapper에는 `tbcrm_sell_contract`, `tbcrm_goods`, `tbpar_partner`, `tbbil_charge` 같은 이름이 등장할 수 있다. 따라서 Uniplan 반영 시에는 아래 순서로 확인한다.

1. DDL에 존재하는지 확인한다.
2. mapper 조인/검색 조건으로 업무 의미를 확인한다.
3. JSP 화면에서 사용자가 보는 명칭과 컬럼 표시 순서를 확인한다.
4. Uniplan의 현대식 모델명으로 옮기되, `legacyTable` 메모를 남긴다.

## Migration Policy

1. 원본 legacy 테이블명은 문서와 주석에 보존한다.
2. Uniplan DB 모델은 복수형 영어 이름을 사용한다.
3. `company_cd`, `domain_nm` 기반 멀티테넌트 구조는 `companyId`, `domainId`로 정규화한다.
4. 메뉴와 권한은 기존 CRUD 플래그를 우선 보존한다.
5. AI 질의는 legacy raw table에 직접 붙이지 않고, Prisma 모델 또는 읽기 전용 view/query template을 통해 접근한다.
6. 물리 데이터 복구가 끝나기 전까지 `.ibd` 파일 기반 데이터는 제품 기능의 전제로 삼지 않는다.
7. 개인정보/토큰/실데이터는 저장소에 커밋하지 않는다.

## Recommended Build Order

1. DB 기반 메뉴/권한: `tbcom_menu`, `tbcom_menu_map`, `tbcom_domain_menu_map`, `tbcom_role_menu`
2. 회사/도메인/사용자/공통코드: `tbcom_company`, `tbcom_domain`, `tbcom_user2`, `tbcom_role`, `tbcom_cd`
3. 고객/상품/계약/청구/재고: `tbcrm_*`, `tbprd_*`, `tbsal_*`, `tbbil_*`
4. 회계 lite/직원/업무: `tbfin_*`, `tbhrm_*`, `tbcom_task`, `tbcom_schedule`
5. 대시보드/AI 분석: `tbcom_home_card`, `tbsum_mychart`, read-only query templates

## Next Schema Tasks

| Task | Output |
|---|---|
| 메뉴 seed 분석 | 초기 sidebar 메뉴 JSON/Prisma seed |
| `tbcom_*` 상세 컬럼 매핑 | tenant/auth/menu Prisma schema |
| `tbcrm_*`, `tbsal_*`, `tbbil_*` 상세 컬럼 매핑 | 고객-매출-청구 ERD |
| gootzERP mapper별 화면-테이블 목록 | 화면 복원 우선순위 |
| legacy-to-Uniplan dictionary | AI가 참조할 한글 업무 용어 사전 |
