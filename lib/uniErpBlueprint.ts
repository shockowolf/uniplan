import type { Metric } from './templates/types';

export type UniErpPageStatus = 'ready' | 'planned' | 'reference';

export type UniErpMenuItem = {
  code: string;
  label: string;
  href: string;
  sortOrder: number;
  legacyMenuId: string;
  legacyMapId: string;
  sourceMenu: string;
  legacyTables: string[];
  targetEntities: string[];
  purpose: string;
  status: UniErpPageStatus;
};

export type UniErpModule = {
  code: string;
  label: string;
  href: string;
  sortOrder: number;
  legacyMenuId: string;
  legacyMapId: string;
  title: string;
  eyebrow: string;
  description: string;
  metrics: Metric[];
  sections: { title: string; body: string }[];
  children: UniErpMenuItem[];
};

const systemItems: UniErpMenuItem[] = [
  {
    code: 'system-admin-home',
    label: '관리자 홈',
    href: '/system?legacy=LM001',
    sortOrder: 10,
    legacyMenuId: 'LM001',
    legacyMapId: 'LM001',
    sourceMenu: 'Admin Home',
    legacyTables: ['tbcom_home_card', 'tbcom_domain', 'tbcom_user2'],
    targetEntities: ['dashboardCards', 'domains', 'users'],
    purpose: '관리자가 처음 보는 운영 지표와 홈 카드 구성을 관리합니다.',
    status: 'planned'
  },
  {
    code: 'system-users',
    label: '사용자관리',
    href: '/system?legacy=LM002',
    sortOrder: 20,
    legacyMenuId: 'LM002',
    legacyMapId: 'LM002',
    sourceMenu: 'Users',
    legacyTables: ['tbcom_user2', 'tbcom_user_role', 'tbcom_role'],
    targetEntities: ['users', 'userRoles', 'roles'],
    purpose: '로그인 계정, 사용자 유형, 역할 연결을 관리합니다.',
    status: 'ready'
  },
  {
    code: 'system-roles',
    label: '권한관리',
    href: '/system?legacy=LM003',
    sortOrder: 30,
    legacyMenuId: 'LM003',
    legacyMapId: 'LM003',
    sourceMenu: 'Roles',
    legacyTables: ['tbcom_role', 'tbcom_role_menu'],
    targetEntities: ['roles', 'roleMenuPermissions'],
    purpose: '역할과 메뉴별 조회/등록/수정/삭제/관리 권한을 관리합니다.',
    status: 'planned'
  },
  {
    code: 'system-menus',
    label: '메뉴관리',
    href: '/system?legacy=LM004',
    sortOrder: 40,
    legacyMenuId: 'LM004',
    legacyMapId: 'LM004',
    sourceMenu: 'Menus',
    legacyTables: ['tbcom_menu', 'tbcom_menu_map', 'tbcom_domain_menu_map'],
    targetEntities: ['menus', 'menuNodes', 'domainMenuNodes'],
    purpose: '도메인별 좌측 메뉴 트리와 노출 순서를 관리합니다.',
    status: 'planned'
  },
  {
    code: 'system-url-auth',
    label: 'URL 권한',
    href: '/system?legacy=LM005',
    sortOrder: 50,
    legacyMenuId: 'LM005',
    legacyMapId: 'LM005',
    sourceMenu: 'URL Auth',
    legacyTables: ['tbcom_url_auth', 'tbcom_role_menu'],
    targetEntities: ['routePermissions', 'roleMenuPermissions'],
    purpose: '화면 URL과 권한 플래그를 연결해 라우트 접근을 제어합니다.',
    status: 'planned'
  },
  {
    code: 'system-domains',
    label: '도메인관리',
    href: '/system?legacy=LM006',
    sortOrder: 60,
    legacyMenuId: 'LM006',
    legacyMapId: 'LM006',
    sourceMenu: 'Domains',
    legacyTables: ['tbcom_domain', 'tbcom_domain_company'],
    targetEntities: ['domains', 'domainCompanies'],
    purpose: 'ERP/HOME/SHOP 도메인과 회사 연결을 관리합니다.',
    status: 'planned'
  },
  {
    code: 'system-companies',
    label: '회사관리',
    href: '/system?legacy=LM007',
    sortOrder: 70,
    legacyMenuId: 'LM007',
    legacyMapId: 'LM007',
    sourceMenu: 'Companies',
    legacyTables: ['tbcom_company'],
    targetEntities: ['companies'],
    purpose: '회사 기본정보, 사업자정보, 로고와 직인 기준을 관리합니다.',
    status: 'planned'
  },
  {
    code: 'system-codes',
    label: '공통코드',
    href: '/system?legacy=LM008',
    sortOrder: 80,
    legacyMenuId: 'LM008',
    legacyMapId: 'LM008',
    sourceMenu: 'Codes',
    legacyTables: ['tbcom_cd'],
    targetEntities: ['commonCodes'],
    purpose: 'ERP 전체에서 공유하는 코드, 코드명, 정렬, 사용여부를 관리합니다.',
    status: 'planned'
  },
  {
    code: 'system-home-cards',
    label: '홈 카드',
    href: '/system?legacy=LM009',
    sortOrder: 90,
    legacyMenuId: 'LM009',
    legacyMapId: 'LM009',
    sourceMenu: 'Home Cards',
    legacyTables: ['tbcom_home_card', 'tbcom_home_card_company', 'tbsum_mychart'],
    targetEntities: ['dashboardCards', 'savedCharts'],
    purpose: '홈 대시보드 카드와 차트 프리셋을 관리합니다.',
    status: 'ready'
  },
  {
    code: 'system-my-page',
    label: '마이페이지',
    href: '/system?legacy=LM020',
    sortOrder: 100,
    legacyMenuId: 'LM020',
    legacyMapId: 'LM020',
    sourceMenu: 'My Page',
    legacyTables: ['tbcom_user2', 'tbcom_bookmark', 'tbcom_favorite'],
    targetEntities: ['users', 'favorites'],
    purpose: '개인 프로필, 즐겨찾기, 기본 화면 설정을 관리합니다.',
    status: 'planned'
  }
];

const salesItems: UniErpMenuItem[] = [
  {
    code: 'sales-quotation-inquiries',
    label: '견적문의관리',
    href: '/sales?legacy=LM115',
    sortOrder: 10,
    legacyMenuId: 'LM115',
    legacyMapId: 'LM115',
    sourceMenu: '견적문의관리',
    legacyTables: ['tbsal_est', 'tbsal_est_item', 'tbcrm_cust_info'],
    targetEntities: ['quotations', 'quotationItems', 'customers'],
    purpose: '외부/내부 견적 문의를 수주 후보로 정리합니다.',
    status: 'planned'
  },
  {
    code: 'sales-orders',
    label: '수주/계약관리',
    href: '/sales?legacy=UNI-SALES-ORDER',
    sortOrder: 20,
    legacyMenuId: 'UNI-SALES-ORDER',
    legacyMapId: 'UNI-SALES-ORDER',
    sourceMenu: 'Sales Contract',
    legacyTables: ['tbsal_sell_contract', 'tbsal_sell_contract_product'],
    targetEntities: ['salesOrders', 'salesOrderItems'],
    purpose: '견적 이후 확정된 판매 계약과 항목을 관리합니다.',
    status: 'planned'
  },
  {
    code: 'sales-activities',
    label: '영업활동',
    href: '/sales?legacy=UNI-SALES-ACTIVITY',
    sortOrder: 30,
    legacyMenuId: 'UNI-SALES-ACTIVITY',
    legacyMapId: 'UNI-SALES-ACTIVITY',
    sourceMenu: 'Sales Activity',
    legacyTables: ['tbsal_sales_activity', 'tbcrm_cust_info', 'tbhrm_emp'],
    targetEntities: ['salesActivities', 'customers', 'employees'],
    purpose: '영업 담당자별 방문, 통화, 제안, 후속 액션을 기록합니다.',
    status: 'planned'
  }
];

const customerItems: UniErpMenuItem[] = [
  {
    code: 'customers-master',
    label: '거래처관리',
    href: '/customers?legacy=LM014',
    sortOrder: 10,
    legacyMenuId: 'LM014',
    legacyMapId: 'LM014',
    sourceMenu: 'Customers',
    legacyTables: ['tbcrm_cust_info', 'tbcrm_cust_man', 'tbcrm_cust_address'],
    targetEntities: ['customers', 'customerContacts', 'customerAddresses'],
    purpose: '거래처 원장, 담당자, 주소와 등급을 관리합니다.',
    status: 'planned'
  },
  {
    code: 'customers-partners',
    label: '파트너관리',
    href: '/customers?legacy=LM015',
    sortOrder: 20,
    legacyMenuId: 'LM015',
    legacyMapId: 'LM015',
    sourceMenu: 'Partners',
    legacyTables: ['tbcom_partner', 'tbcom_partner_worker'],
    targetEntities: ['vendors', 'vendorContacts'],
    purpose: '협력사와 협력사 담당자를 관리합니다.',
    status: 'planned'
  },
  {
    code: 'customers-consultations',
    label: '상담관리',
    href: '/customers?legacy=UNI-CONSULT',
    sortOrder: 30,
    legacyMenuId: 'UNI-CONSULT',
    legacyMapId: 'UNI-CONSULT',
    sourceMenu: 'Consultation',
    legacyTables: ['tbcen_consult', 'tbcrm_cust_info'],
    targetEntities: ['consultations', 'customers'],
    purpose: '도입문의, 장애문의, 사용문의 상태와 처리 결과를 관리합니다.',
    status: 'planned'
  }
];

const inventoryItems: UniErpMenuItem[] = [
  {
    code: 'inventory-products',
    label: '상품/품목관리',
    href: '/inventory?legacy=LM016',
    sortOrder: 10,
    legacyMenuId: 'LM016',
    legacyMapId: 'LM016',
    sourceMenu: 'Products',
    legacyTables: ['tbprd_product', 'tbprd_parts', 'tbprd_cat'],
    targetEntities: ['products', 'items', 'productCategories'],
    purpose: '상품, 품목, 부품, 카테고리와 표준 단가를 관리합니다.',
    status: 'planned'
  },
  {
    code: 'inventory-warehouses',
    label: '창고관리',
    href: '/inventory?legacy=UNI-WAREHOUSE',
    sortOrder: 20,
    legacyMenuId: 'UNI-WAREHOUSE',
    legacyMapId: 'UNI-WAREHOUSE',
    sourceMenu: 'Storage',
    legacyTables: ['tbprd_storage'],
    targetEntities: ['warehouses'],
    purpose: '창고와 보관 위치를 관리합니다.',
    status: 'planned'
  },
  {
    code: 'inventory-movements',
    label: '재고입출고',
    href: '/inventory?legacy=UNI-STOCK',
    sortOrder: 30,
    legacyMenuId: 'UNI-STOCK',
    legacyMapId: 'UNI-STOCK',
    sourceMenu: 'Stock In/Out',
    legacyTables: ['tbprd_stock_inout', 'tbhtc_stock_inout', 'tbhtc_inventory'],
    targetEntities: ['inventoryMovements', 'inventoryBalances'],
    purpose: '입고, 출고, 조정 이력과 현재고를 관리합니다.',
    status: 'planned'
  }
];

const financeItems: UniErpMenuItem[] = [
  {
    code: 'finance-invoices',
    label: '청구/수금관리',
    href: '/finance?legacy=UNI-INVOICE',
    sortOrder: 10,
    legacyMenuId: 'UNI-INVOICE',
    legacyMapId: 'UNI-INVOICE',
    sourceMenu: 'Billing',
    legacyTables: ['tbbil_invoice', 'tbbil_taxbil', 'tbbil_taxbil_item'],
    targetEntities: ['invoices', 'invoiceItems', 'payments'],
    purpose: '청구, 수금, 미수, 납부 상태를 관리합니다.',
    status: 'planned'
  },
  {
    code: 'finance-tax-invoice',
    label: '전자세금계산서',
    href: '/finance?legacy=LM101',
    sortOrder: 20,
    legacyMenuId: 'LM101',
    legacyMapId: 'LM101',
    sourceMenu: '전자세금계산서',
    legacyTables: ['tbbil_taxbil', 'tbbil_taxbil_item', 'tbcrm_cust_info'],
    targetEntities: ['taxInvoices', 'taxInvoiceItems', 'customers'],
    purpose: '거래처 기준 전자세금계산서 발행/조회 흐름을 관리합니다.',
    status: 'planned'
  },
  {
    code: 'finance-tax-receipt',
    label: '세무접수관리',
    href: '/finance?legacy=LM102',
    sortOrder: 30,
    legacyMenuId: 'LM102',
    legacyMapId: 'LM102',
    sourceMenu: '세무접수관리',
    legacyTables: ['tbfin_cost', 'tbfin_cost_item', 'tbbil_taxbil'],
    targetEntities: ['expenses', 'expenseItems', 'taxInvoices'],
    purpose: '세무 증빙 접수와 비용 처리 상태를 관리합니다.',
    status: 'planned'
  },
  {
    code: 'finance-bank-cash',
    label: '계좌/현금출납',
    href: '/finance?legacy=UNI-BANK-CASH',
    sortOrder: 40,
    legacyMenuId: 'UNI-BANK-CASH',
    legacyMapId: 'UNI-BANK-CASH',
    sourceMenu: 'Bank/Cash',
    legacyTables: ['tbfin_bank_acct', 'tbfin_bank_acct_inout', 'tbfin_cash'],
    targetEntities: ['bankAccounts', 'bankTransactions', 'cashTransactions'],
    purpose: '계좌 입출금과 현금 출납 내역을 관리합니다.',
    status: 'planned'
  }
];

const operationsItems: UniErpMenuItem[] = [
  {
    code: 'operations-employees',
    label: '사원관리',
    href: '/operations?legacy=LM013',
    sortOrder: 10,
    legacyMenuId: 'LM013',
    legacyMapId: 'LM013',
    sourceMenu: 'Employees',
    legacyTables: ['tbhrm_emp', 'tbhrm_org'],
    targetEntities: ['employees', 'departments'],
    purpose: '직원, 부서, 직책, 영업 담당 여부를 관리합니다.',
    status: 'planned'
  },
  {
    code: 'operations-calendar',
    label: '업무 캘린더',
    href: '/operations?legacy=LM103',
    sortOrder: 20,
    legacyMenuId: 'LM103',
    legacyMapId: 'LM103',
    sourceMenu: '업무 캘린더',
    legacyTables: ['tbcom_schedule', 'tbcom_task', 'tbcom_todo'],
    targetEntities: ['schedules', 'tasks', 'todos'],
    purpose: '업무 일정, 할 일, 작업을 캘린더 흐름으로 관리합니다.',
    status: 'planned'
  },
  {
    code: 'operations-counselor-calendar',
    label: '상담일정 캘린더',
    href: '/operations?legacy=LM104',
    sortOrder: 30,
    legacyMenuId: 'LM104',
    legacyMapId: 'LM104',
    sourceMenu: '상담일정 캘린더',
    legacyTables: ['tbcen_consult', 'tbcom_schedule'],
    targetEntities: ['consultations', 'schedules'],
    purpose: '상담 예약과 상담 담당자의 일정을 연결합니다.',
    status: 'planned'
  },
  {
    code: 'operations-service',
    label: 'AS/서비스관리',
    href: '/operations?legacy=UNI-SERVICE',
    sortOrder: 40,
    legacyMenuId: 'UNI-SERVICE',
    legacyMapId: 'UNI-SERVICE',
    sourceMenu: 'AS',
    legacyTables: ['tbsal_as', 'tbsal_as_product', 'tbcrm_cust_info'],
    targetEntities: ['serviceCases', 'customers', 'products'],
    purpose: 'AS 접수, 처리 예정일, 완료 결과를 관리합니다.',
    status: 'planned'
  },
  {
    code: 'operations-leave',
    label: '휴가/근태',
    href: '/operations?legacy=UNI-LEAVE',
    sortOrder: 50,
    legacyMenuId: 'UNI-LEAVE',
    legacyMapId: 'UNI-LEAVE',
    sourceMenu: 'Vacation',
    legacyTables: ['tbhrm_vacation', 'tbhrm_work_report'],
    targetEntities: ['leaveRequests', 'workReports'],
    purpose: '휴가, 반차, 병가, 업무보고를 관리합니다.',
    status: 'planned'
  }
];

const commerceItems: UniErpMenuItem[] = [
  {
    code: 'commerce-shop-products',
    label: '쇼핑몰 상품',
    href: '/commerce?legacy=LM017',
    sortOrder: 10,
    legacyMenuId: 'LM017',
    legacyMapId: 'LM017',
    sourceMenu: 'Shop Products',
    legacyTables: ['tbshp_product', 'tbshp_product_option', 'tbprd_product'],
    targetEntities: ['commerceProducts', 'commerceProductOptions', 'products'],
    purpose: '쇼핑몰 노출 상품, 옵션, 가격을 ERP 상품과 연결합니다.',
    status: 'reference'
  },
  {
    code: 'commerce-shop-orders',
    label: '쇼핑몰 주문',
    href: '/commerce?legacy=LM018',
    sortOrder: 20,
    legacyMenuId: 'LM018',
    legacyMapId: 'LM018',
    sourceMenu: 'Shop Orders',
    legacyTables: ['tbshp_order', 'tbshp_order_item', 'tbshp_pay', 'tbshp_delivery'],
    targetEntities: ['commerceOrders', 'commerceOrderItems', 'payments', 'deliveries'],
    purpose: '온라인 주문, 결제, 배송 상태를 관리합니다.',
    status: 'reference'
  }
];

const contentItems: UniErpMenuItem[] = [
  {
    code: 'content-bbs',
    label: '게시판관리',
    href: '/content?legacy=LM010',
    sortOrder: 10,
    legacyMenuId: 'LM010',
    legacyMapId: 'LM010',
    sourceMenu: 'BBS Admin',
    legacyTables: ['tbcom_bbs2', 'tbcom_bbs_article2', 'tbcom_bbs_reply2'],
    targetEntities: ['boards', 'boardPosts', 'boardComments'],
    purpose: '공지, 자료실, 스토리 등 게시판과 게시글을 관리합니다.',
    status: 'reference'
  },
  {
    code: 'content-popup-notices',
    label: '팝업공지',
    href: '/content?legacy=LM011',
    sortOrder: 20,
    legacyMenuId: 'LM011',
    legacyMapId: 'LM011',
    sourceMenu: 'Popup Notices',
    legacyTables: ['tbcom_popup', 'tbcom_attach'],
    targetEntities: ['popupNotices', 'attachments'],
    purpose: '사이트/ERP 공지 팝업과 첨부 이미지를 관리합니다.',
    status: 'reference'
  },
  {
    code: 'content-banners',
    label: '배너관리',
    href: '/content?legacy=LM012',
    sortOrder: 30,
    legacyMenuId: 'LM012',
    legacyMapId: 'LM012',
    sourceMenu: 'Banners',
    legacyTables: ['tbcom_banner', 'tbcom_attach'],
    targetEntities: ['banners', 'attachments'],
    purpose: '배너 위치, 이미지, 링크, 노출 기간을 관리합니다.',
    status: 'reference'
  },
  {
    code: 'content-pages',
    label: '콘텐츠관리',
    href: '/content?legacy=LM114',
    sortOrder: 40,
    legacyMenuId: 'LM114',
    legacyMapId: 'LM114',
    sourceMenu: '콘텐츠관리',
    legacyTables: ['tbcom_contents', 'tbcom_attach'],
    targetEntities: ['contents', 'attachments'],
    purpose: '정적/반정적 콘텐츠와 파일을 관리합니다.',
    status: 'reference'
  },
  {
    code: 'content-story-board',
    label: '공지/스토리 게시판',
    href: '/content?legacy=LM116',
    sortOrder: 50,
    legacyMenuId: 'LM116',
    legacyMapId: 'LM116',
    sourceMenu: '공지/스토리 게시판',
    legacyTables: ['tbcom_bbs2', 'tbcom_bbs_article2'],
    targetEntities: ['boards', 'boardPosts'],
    purpose: '공지와 스토리성 게시글을 운영합니다.',
    status: 'reference'
  }
];

const collaborationItems: UniErpMenuItem[] = [
  {
    code: 'collaboration-sms-send',
    label: 'SMS 발신',
    href: '/collaboration?legacy=LM105',
    sortOrder: 10,
    legacyMenuId: 'LM105',
    legacyMapId: 'LM105',
    sourceMenu: 'SMS 발신',
    legacyTables: ['tbcom_sms', 'tbcom_sms_template', 'tbcrm_cust_info'],
    targetEntities: ['messages', 'messageTemplates', 'customers'],
    purpose: '고객/직원 대상 업무 메시지를 발송합니다.',
    status: 'reference'
  },
  {
    code: 'collaboration-sms-log',
    label: 'SMS 발신이력',
    href: '/collaboration?legacy=LM106',
    sortOrder: 20,
    legacyMenuId: 'LM106',
    legacyMapId: 'LM106',
    sourceMenu: 'SMS 발신이력',
    legacyTables: ['tbcom_sms_log'],
    targetEntities: ['messageLogs'],
    purpose: '발송 성공/실패와 수신자를 추적합니다.',
    status: 'reference'
  },
  {
    code: 'collaboration-sms-template',
    label: 'SMS 템플릿',
    href: '/collaboration?legacy=LM107',
    sortOrder: 30,
    legacyMenuId: 'LM107',
    legacyMapId: 'LM107',
    sourceMenu: 'SMS 템플릿',
    legacyTables: ['tbcom_sms_template'],
    targetEntities: ['messageTemplates'],
    purpose: '반복 발송 문구와 변수 치환 규칙을 관리합니다.',
    status: 'reference'
  },
  {
    code: 'collaboration-meetings',
    label: '회의관리',
    href: '/collaboration?legacy=LM108',
    sortOrder: 40,
    legacyMenuId: 'LM108',
    legacyMapId: 'LM108',
    sourceMenu: 'ZOOM 회의',
    legacyTables: ['tbzom_meeting', 'tbzom_channel'],
    targetEntities: ['meetings', 'meetingChannels'],
    purpose: '화상회의 예약과 회의 링크를 관리합니다.',
    status: 'reference'
  },
  {
    code: 'collaboration-meeting-users',
    label: '회의 사용자',
    href: '/collaboration?legacy=LM109',
    sortOrder: 50,
    legacyMenuId: 'LM109',
    legacyMapId: 'LM109',
    sourceMenu: 'ZOOM 사용자',
    legacyTables: ['tbzom_user', 'tbcom_user2'],
    targetEntities: ['meetingUsers', 'users'],
    purpose: '회의 계정과 ERP 사용자를 연결합니다.',
    status: 'reference'
  },
  {
    code: 'collaboration-meeting-channels',
    label: '회의 채널',
    href: '/collaboration?legacy=LM110',
    sortOrder: 60,
    legacyMenuId: 'LM110',
    legacyMapId: 'LM110',
    sourceMenu: 'ZOOM 채널',
    legacyTables: ['tbzom_channel'],
    targetEntities: ['meetingChannels'],
    purpose: '회의 채널과 기본 회의 설정을 관리합니다.',
    status: 'reference'
  }
];

const analyticsItems: UniErpMenuItem[] = [
  {
    code: 'analytics-custom-charts',
    label: '맞춤 차트',
    href: '/analytics?legacy=LM111',
    sortOrder: 10,
    legacyMenuId: 'LM111',
    legacyMapId: 'LM111',
    sourceMenu: '맞춤 차트',
    legacyTables: ['tbsum_mychart', 'tbsum_mychart_data'],
    targetEntities: ['savedCharts', 'savedChartData'],
    purpose: '사용자 정의 차트와 데이터셋을 관리합니다.',
    status: 'ready'
  },
  {
    code: 'analytics-commerce-sales',
    label: '쇼핑몰 매출차트',
    href: '/analytics?legacy=LM112',
    sortOrder: 20,
    legacyMenuId: 'LM112',
    legacyMapId: 'LM112',
    sourceMenu: '쇼핑몰 매출차트',
    legacyTables: ['tbshp_order', 'tbshp_pay'],
    targetEntities: ['commerceOrders', 'payments', 'savedCharts'],
    purpose: '쇼핑몰 매출과 결제 흐름을 차트로 분석합니다.',
    status: 'reference'
  }
];

const automationItems: UniErpMenuItem[] = [
  {
    code: 'automation-jobs',
    label: '자동예약작업',
    href: '/automation?legacy=LM113',
    sortOrder: 10,
    legacyMenuId: 'LM113',
    legacyMapId: 'LM113',
    sourceMenu: '자동예약작업',
    legacyTables: ['tbcom_job_schedule', 'tbcom_task'],
    targetEntities: ['automationJobs', 'tasks'],
    purpose: '반복 실행 작업, 예약 실행 시간, 실행 결과를 관리합니다.',
    status: 'reference'
  }
];

export const uniErpModules: UniErpModule[] = [
  {
    code: 'dashboard',
    label: 'Dashboard',
    href: '/',
    sortOrder: 10,
    legacyMenuId: 'dashboard',
    legacyMapId: 'dashboard',
    eyebrow: 'Dashboard',
    title: 'UniPlan ERP 홈',
    description: 'AI 질의, 홈 카드, 핵심 지표를 한 화면에서 연결합니다.',
    metrics: [
      { label: '핵심 모듈', value: 10 },
      { label: '관리 메뉴', value: 41 },
      { label: '참조 테이블군', value: 18 },
      { label: 'AI 분석', value: 'ON' }
    ],
    sections: [
      { title: 'AI 질의', body: '매출, 미수, 재고, 상담/AS 현황을 자연어로 조회합니다.' },
      { title: '홈 카드', body: '운영자가 자주 보는 카드와 차트를 구성합니다.' },
      { title: '권한 기반 메뉴', body: '메뉴 트리와 CRUD 권한을 역할별로 분리합니다.' }
    ],
    children: []
  },
  {
    code: 'sales',
    label: 'Sales',
    href: '/sales',
    sortOrder: 20,
    legacyMenuId: 'sales',
    legacyMapId: 'sales',
    eyebrow: 'Sales',
    title: '영업과 수주 관리',
    description: '견적 문의부터 수주/계약, 영업 활동까지 매출 전 단계를 관리합니다.',
    metrics: [
      { label: '견적 흐름', value: 1 },
      { label: '계약 흐름', value: 1 },
      { label: '활동 관리', value: 1 },
      { label: '핵심 테이블', value: 5 }
    ],
    sections: [
      { title: '견적문의', body: '문의가 계약으로 전환되기 전의 후보를 관리합니다.' },
      { title: '수주/계약', body: '확정된 계약과 계약 품목을 매출 흐름으로 연결합니다.' },
      { title: '영업활동', body: '담당자별 후속 조치와 활동 이력을 관리합니다.' }
    ],
    children: salesItems
  },
  {
    code: 'customers',
    label: 'Customers',
    href: '/customers',
    sortOrder: 30,
    legacyMenuId: 'customers',
    legacyMapId: 'customers',
    eyebrow: 'Customers',
    title: '거래처와 상담 관리',
    description: '거래처, 파트너, 상담을 하나의 고객 중심 흐름으로 관리합니다.',
    metrics: [
      { label: '거래처 관리', value: 1 },
      { label: '파트너 관리', value: 1 },
      { label: '상담 관리', value: 1 },
      { label: 'CRM 테이블군', value: 4 }
    ],
    sections: [
      { title: '거래처 원장', body: '고객 기본정보, 담당자, 주소, 등급을 관리합니다.' },
      { title: '파트너', body: '협력사와 담당자를 별도 원장으로 관리합니다.' },
      { title: '상담 이력', body: '문의 유형, 처리 상태, 결과를 고객과 연결합니다.' }
    ],
    children: customerItems
  },
  {
    code: 'inventory',
    label: 'Inventory',
    href: '/inventory',
    sortOrder: 40,
    legacyMenuId: 'inventory',
    legacyMapId: 'inventory',
    eyebrow: 'Inventory',
    title: '상품과 재고 관리',
    description: '상품/품목, 창고, 입출고 이력을 재고 분석의 기준으로 정리합니다.',
    metrics: [
      { label: '상품/품목', value: 1 },
      { label: '창고', value: 1 },
      { label: '입출고', value: 1 },
      { label: '재고 테이블군', value: 5 }
    ],
    sections: [
      { title: '상품/품목', body: '판매 상품과 부품/품목 원장을 통합합니다.' },
      { title: '창고', body: '보관 위치와 재고 책임 단위를 관리합니다.' },
      { title: '입출고', body: '현재고와 입출고 이력을 안전재고 분석으로 연결합니다.' }
    ],
    children: inventoryItems
  },
  {
    code: 'finance',
    label: 'Finance',
    href: '/finance',
    sortOrder: 50,
    legacyMenuId: 'LFIN',
    legacyMapId: 'LFIN',
    eyebrow: 'Finance',
    title: '청구와 재무 관리',
    description: '청구, 세금계산서, 계좌/현금, 비용을 수금 중심으로 관리합니다.',
    metrics: [
      { label: '청구', value: 1 },
      { label: '세금계산서', value: 1 },
      { label: '세무/비용', value: 1 },
      { label: '계좌/현금', value: 1 }
    ],
    sections: [
      { title: '청구/수금', body: '미수, 부분수금, 완납 상태를 관리합니다.' },
      { title: '세금계산서', body: '거래처와 품목 기준의 전자세금계산서 흐름을 준비합니다.' },
      { title: '계좌/현금', body: '입출금과 현금 출납을 비용/수금과 연결합니다.' }
    ],
    children: financeItems
  },
  {
    code: 'operations',
    label: 'Operations',
    href: '/operations',
    sortOrder: 60,
    legacyMenuId: 'LHR',
    legacyMapId: 'LHR',
    eyebrow: 'Operations',
    title: '운영과 인사 관리',
    description: '직원, 업무 일정, 상담 일정, AS, 휴가/근태를 운영 흐름으로 묶습니다.',
    metrics: [
      { label: '사원', value: 1 },
      { label: '캘린더', value: 2 },
      { label: 'AS/서비스', value: 1 },
      { label: '휴가/근태', value: 1 }
    ],
    sections: [
      { title: '사원관리', body: '직원과 조직 정보를 ERP 권한/업무와 연결합니다.' },
      { title: '캘린더', body: '업무 일정과 상담 일정을 별도 축으로 관리합니다.' },
      { title: '서비스', body: 'AS와 휴가/근태 흐름을 운영 리스크로 분석합니다.' }
    ],
    children: operationsItems
  },
  {
    code: 'commerce',
    label: 'Commerce',
    href: '/commerce',
    sortOrder: 70,
    legacyMenuId: 'LSHOP',
    legacyMapId: 'LSHOP',
    eyebrow: 'Commerce',
    title: '쇼핑몰과 주문 관리',
    description: '온라인 상품, 주문, 결제, 배송 데이터를 ERP 상품/재고와 연결할 준비 영역입니다.',
    metrics: [
      { label: '상품', value: 1 },
      { label: '주문', value: 1 },
      { label: '결제/배송', value: 2 },
      { label: '우선도', value: '참조' }
    ],
    sections: [
      { title: '쇼핑몰 상품', body: '온라인 노출 상품과 ERP 상품 원장을 연결합니다.' },
      { title: '주문', body: '주문, 결제, 배송 상태를 판매/재고 흐름으로 보냅니다.' },
      { title: '분석', body: '쇼핑몰 매출 차트와 고객 구매 흐름을 분석합니다.' }
    ],
    children: commerceItems
  },
  {
    code: 'content',
    label: 'Content',
    href: '/content',
    sortOrder: 80,
    legacyMenuId: 'LCONT',
    legacyMapId: 'LCONT',
    eyebrow: 'Content',
    title: '콘텐츠와 게시판 관리',
    description: '게시판, 팝업, 배너, 콘텐츠를 ERP/홈페이지 공통 운영 자산으로 정리합니다.',
    metrics: [
      { label: '게시판', value: 2 },
      { label: '팝업/배너', value: 2 },
      { label: '콘텐츠', value: 1 },
      { label: '우선도', value: '참조' }
    ],
    sections: [
      { title: '게시판', body: '공지, 스토리, 자료실성 콘텐츠를 관리합니다.' },
      { title: '팝업/배너', body: '노출 기간과 링크를 가진 운영 배너를 관리합니다.' },
      { title: '첨부', body: '파일과 이미지는 공통 첨부 구조로 연결합니다.' }
    ],
    children: contentItems
  },
  {
    code: 'collaboration',
    label: 'Collaboration',
    href: '/collaboration',
    sortOrder: 90,
    legacyMenuId: 'LCOMM',
    legacyMapId: 'LCOMM',
    eyebrow: 'Collaboration',
    title: '메시징과 회의 관리',
    description: 'SMS/알림과 회의 연동을 업무 이벤트와 연결합니다.',
    metrics: [
      { label: 'SMS', value: 3 },
      { label: '회의', value: 3 },
      { label: '템플릿', value: 1 },
      { label: '우선도', value: '참조' }
    ],
    sections: [
      { title: '메시징', body: '발송, 이력, 템플릿을 고객/업무 이벤트와 연결합니다.' },
      { title: '회의', body: '회의, 사용자, 채널을 ERP 일정과 연결합니다.' },
      { title: '자동화 후보', body: '반복 알림과 회의 예약은 자동화 작업으로 확장합니다.' }
    ],
    children: collaborationItems
  },
  {
    code: 'analytics',
    label: 'Analytics',
    href: '/analytics',
    sortOrder: 100,
    legacyMenuId: 'LSTAT',
    legacyMapId: 'LSTAT',
    eyebrow: 'Analytics',
    title: '통계와 맞춤 차트',
    description: '홈 카드와 맞춤 차트, 쇼핑몰 매출 차트를 Uni 차트 라이브러리로 흡수합니다.',
    metrics: [
      { label: '맞춤 차트', value: 1 },
      { label: '매출 차트', value: 1 },
      { label: 'Uni Charts', value: 'ON' },
      { label: '우선도', value: 3 }
    ],
    sections: [
      { title: '맞춤 차트', body: '사용자 정의 데이터셋과 차트 구성을 저장합니다.' },
      { title: '매출 차트', body: '쇼핑몰/ERP 매출 데이터를 차트로 분석합니다.' },
      { title: 'AI 분석', body: '저장된 차트 정의를 자연어 분석 결과와 연결합니다.' }
    ],
    children: analyticsItems
  },
  {
    code: 'automation',
    label: 'Automation',
    href: '/automation',
    sortOrder: 110,
    legacyMenuId: 'LAUTO',
    legacyMapId: 'LAUTO',
    eyebrow: 'Automation',
    title: '자동화와 예약 작업',
    description: '반복 실행 작업, 알림, 데이터 동기화를 관리하는 영역입니다.',
    metrics: [
      { label: '예약작업', value: 1 },
      { label: '연결 후보', value: 4 },
      { label: '실행 이력', value: '예정' },
      { label: '우선도', value: '참조' }
    ],
    sections: [
      { title: '예약 실행', body: '정해진 주기로 실행되는 업무 작업을 관리합니다.' },
      { title: '업무 연결', body: '청구, 메시지, 차트, 재고 동기화와 연결할 수 있습니다.' },
      { title: '안전장치', body: '실행 전 승인, 실패 이력, 재시도 정책을 분리합니다.' }
    ],
    children: automationItems
  },
  {
    code: 'system',
    label: 'System',
    href: '/system',
    sortOrder: 120,
    legacyMenuId: 'LSYS',
    legacyMapId: 'LSYS',
    eyebrow: 'System',
    title: '시스템과 로그인 관리',
    description: '회사, 도메인, 사용자, 권한, 메뉴, 코드, 홈 카드와 개인 설정을 관리합니다.',
    metrics: [
      { label: '시스템 메뉴', value: systemItems.length },
      { label: '권한 플래그', value: 'CRUD' },
      { label: '도메인', value: 'ERP' },
      { label: 'Legacy Root', value: 'LSYS' }
    ],
    sections: [
      { title: '사용자와 역할', body: '사용자, 역할, 역할별 메뉴 권한을 관리합니다.' },
      { title: '메뉴와 URL 권한', body: '메뉴 트리와 URL 접근 권한을 같은 기준으로 연결합니다.' },
      { title: '도메인과 회사', body: '회사, 도메인, 공통코드, 홈 카드 설정을 관리합니다.' }
    ],
    children: systemItems
  }
];

export const uniErpMenuItems = uniErpModules.flatMap((module) => module.children);

export function getUniErpModule(pathname: string) {
  return uniErpModules.find((module) => module.href === pathname);
}

export function findUniErpMenuItem(pathname: string, legacy?: string) {
  if (!legacy) return undefined;
  return uniErpMenuItems.find((item) => item.href === `${pathname}?legacy=${legacy}`);
}
