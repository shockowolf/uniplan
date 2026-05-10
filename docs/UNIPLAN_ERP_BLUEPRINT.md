# UniPlan ERP Blueprint

이 문서는 복구된 ERP 메뉴 제목과 DB 구조를 UniPlan 방향으로 재분류한 실행 기준이다. 원본 화면명은 추적을 위한 `legacyMenuId`로만 남기고, 앱의 메뉴와 관리 화면 이름은 UniPlan 모듈명으로 정리한다.

## Active Core Modules

| UniPlan module | 역할 | 주요 관리 메뉴 |
|---|---|---|
| Dashboard | AI 질의, 홈 카드, 핵심 지표 | 홈 카드, 맞춤 차트 |
| Sales | 견적, 수주/계약, 영업활동 | 견적문의관리, 수주/계약관리, 영업활동 |
| Customers | 거래처, 파트너, 상담 | 거래처관리, 파트너관리, 상담관리 |
| Inventory | 상품/품목, 창고, 입출고 | 상품/품목관리, 창고관리, 재고입출고 |
| Finance | 청구, 비용, 계좌/현금 | 청구/수금관리, 비용관리, 계좌/현금출납 |
| Operations | 사원, 업무 일정, 상담 일정, AS, 휴가/근태 | 사원관리, 업무 캘린더, 상담일정 캘린더, AS/서비스관리, 휴가/근태 |
| System | 회사, 도메인, 사용자, 역할, 메뉴, URL 권한, 공통코드 | 사용자관리, 권한관리, 메뉴관리, URL 권한, 도메인관리, 회사관리, 공통코드 |

## Deferred Menus

The previous Commerce, Content, Collaboration, Analytics, and Automation branches are temporarily removed from active navigation because they are not part of the current gootzERP-common ERP scope. Their route shells can remain in the codebase as inactive references, but `prisma/seed.ts` deactivates menu and menu node records that are no longer present in `lib/uniErpBlueprint.ts`.

## Implementation

- Source of truth: `lib/uniErpBlueprint.ts`
- Generic management shell: `components/UniErpAdminPage.tsx`
- DB sidebar seed and stale menu deactivation: `prisma/seed.ts`
- Ready custom pages: `LM002` 사용자관리, `LM009` Uni 차트/홈 카드

The generic pages currently show the management purpose, source DB structures, and target UniPlan entities. Full CRUD wiring should be added module by module as the data model is expanded.
