import type { Metric } from '@/lib/templates/types';

export type UniplanPageStatus = 'ready' | 'planned' | 'reference';

export type UniplanModuleItem = {
  code: string;
  label: string;
  href: string;
  sortOrder: number;
  resourceCode: string;
  entities: string[];
  purpose: string;
  status: UniplanPageStatus;
};

export type UniplanModule = {
  code: string;
  label: string;
  href: string;
  sortOrder: number;
  title: string;
  eyebrow: string;
  description: string;
  metrics: Metric[];
  sections: { title: string; body: string }[];
  children: readonly UniplanModuleItem[];
};

const defineModuleItem = (
  path: string,
  code: string,
  label: string,
  sortOrder: number,
  entities: string[],
  purpose: string,
): UniplanModuleItem => ({
  code,
  label,
  href: `${path}?view=${code}`,
  sortOrder,
  resourceCode: code.replaceAll('-', '.'),
  entities,
  purpose,
  status: 'planned',
});

const moduleDefinitions = [
  {
    code: 'dashboard',
    label: 'Dashboard',
    href: '/',
    title: 'UNIPLAN ERP 홈',
    description: 'AI 질의와 핵심 운영 지표를 안전한 분석 흐름으로 연결합니다.',
    children: [],
  },
  {
    code: 'sales',
    label: 'Sales',
    href: '/sales',
    title: '매출 · 수주',
    description: '수주, 계약, 매출 흐름을 고객과 품목 기준으로 분석합니다.',
    children: [
      defineModuleItem(
        '/sales',
        'sales-orders',
        '수주/계약',
        10,
        ['SalesOrder', 'SalesOrderItem'],
        '확정된 판매 계약과 항목을 관리합니다.',
      ),
      defineModuleItem(
        '/sales',
        'sales-activities',
        '영업활동',
        20,
        ['Customer', 'Employee'],
        '고객별 영업 활동과 후속 작업을 관리합니다.',
      ),
    ],
  },
  {
    code: 'customers',
    label: 'Customers',
    href: '/customers',
    title: '고객 · CRM',
    description: '고객, 상담, 서비스 이력을 하나의 운영 맥락으로 봅니다.',
    children: [
      defineModuleItem(
        '/customers',
        'customers-directory',
        '거래처',
        10,
        ['Customer'],
        '고객 원장과 담당 정보를 관리합니다.',
      ),
      defineModuleItem(
        '/customers',
        'customers-consultations',
        '상담',
        20,
        ['Consultation', 'Customer'],
        '상담 상태와 처리 결과를 관리합니다.',
      ),
    ],
  },
  {
    code: 'inventory',
    label: 'Inventory',
    href: '/inventory',
    title: '품목 · 재고',
    description: '품목, BOM, 창고, 불변 재고 원장을 연결합니다.',
    children: [
      defineModuleItem(
        '/inventory',
        'inventory-items',
        '품목',
        10,
        ['Item', 'ItemCategory'],
        'UNIPLAN 품목과 카테고리를 관리합니다.',
      ),
      defineModuleItem(
        '/inventory',
        'inventory-boms',
        'BOM',
        20,
        ['Bom', 'BomVersion', 'BomComponent'],
        '버전형 다단계 BOM을 관리합니다.',
      ),
      defineModuleItem(
        '/inventory',
        'inventory-warehouses',
        '창고',
        30,
        ['Warehouse'],
        '창고와 보관 위치를 관리합니다.',
      ),
      defineModuleItem(
        '/inventory',
        'inventory-stock',
        '현재고',
        40,
        ['InventoryBalance'],
        '원장으로 계산된 현재고를 조회합니다.',
      ),
      defineModuleItem(
        '/inventory',
        'inventory-movements',
        '재고이력',
        50,
        ['InventoryTransaction', 'InventoryEntry'],
        '재고 거래와 불변 원장 항목을 조회합니다.',
      ),
    ],
  },
  {
    code: 'finance',
    label: 'Finance',
    href: '/finance',
    title: '청구 · 수금',
    description: '청구, 수금, 미수 흐름을 고객별로 분석합니다.',
    children: [
      defineModuleItem(
        '/finance',
        'finance-invoices',
        '청구/수금',
        10,
        ['Invoice', 'InvoiceItem', 'Payment'],
        '청구와 수금 상태를 관리합니다.',
      ),
    ],
  },
  {
    code: 'operations',
    label: 'Operations',
    href: '/operations',
    title: '업무 · 운영',
    description: '직원, 서비스, 운영 업무를 연결합니다.',
    children: [
      defineModuleItem(
        '/operations',
        'operations-employees',
        '직원',
        10,
        ['Employee'],
        '직원과 담당 조직 정보를 관리합니다.',
      ),
      defineModuleItem(
        '/operations',
        'operations-service',
        '서비스',
        20,
        ['ServiceCase', 'Customer', 'Item'],
        '서비스 접수와 처리 상태를 관리합니다.',
      ),
    ],
  },
  {
    code: 'system',
    label: 'Settings',
    href: '/system',
    title: '공통 · 권한',
    description: '사용자, 역할, 메뉴와 접근 권한을 관리합니다.',
    children: [
      defineModuleItem(
        '/system',
        'settings-users',
        '사용자',
        10,
        ['User', 'UserRole'],
        '사용자와 역할 연결을 관리합니다.',
      ),
      defineModuleItem(
        '/system',
        'settings-navigation',
        '메뉴와 권한',
        20,
        ['MenuItem', 'RolePermission'],
        '재귀 메뉴와 역할별 권한을 관리합니다.',
      ),
      defineModuleItem(
        '/system',
        'settings-charts',
        '홈 차트',
        30,
        ['Invoice', 'InventoryBalance'],
        '운영 지표 차트를 확인합니다.',
      ),
    ],
  },
  {
    code: 'commerce',
    label: 'Commerce',
    href: '/commerce',
    title: 'Commerce',
    description: '상거래 확장 영역입니다.',
    children: [],
  },
  {
    code: 'collaboration',
    label: 'Collaboration',
    href: '/collaboration',
    title: 'Collaboration',
    description: '협업 확장 영역입니다.',
    children: [],
  },
  {
    code: 'analytics',
    label: 'Analytics',
    href: '/analytics',
    title: 'Analytics',
    description: '분석 확장 영역입니다.',
    children: [],
  },
  {
    code: 'automation',
    label: 'Automation',
    href: '/automation',
    title: 'Automation',
    description: '자동화 확장 영역입니다.',
    children: [],
  },
  {
    code: 'content',
    label: 'Content',
    href: '/content',
    title: 'Content',
    description: '콘텐츠 확장 영역입니다.',
    children: [],
  },
] as const;

export const uniplanModules: UniplanModule[] = moduleDefinitions.map(
  (moduleDefinition, moduleIndex) => ({
    ...moduleDefinition,
    sortOrder: (moduleIndex + 1) * 10,
    eyebrow: moduleDefinition.label,
    metrics: [
      { label: '상태', value: 'Read-only' },
      { label: '연결 영역', value: moduleDefinition.children.length },
      { label: '권한', value: 'Role-based' },
    ],
    sections: [
      { title: '운영 원칙', body: moduleDefinition.description },
      {
        title: '안전 경계',
        body: '허용된 서비스와 템플릿을 통해서만 업무 데이터에 접근합니다.',
      },
    ],
  }),
);

export const uniplanModuleItems = uniplanModules.flatMap(
  (uniplanModule) => uniplanModule.children,
);

export function getUniplanModule(pathname: string) {
  return uniplanModules.find(
    (uniplanModule) => uniplanModule.href === pathname,
  );
}

export function findUniplanModuleItem(pathname: string, view?: string) {
  if (!view) return undefined;
  return uniplanModuleItems.find(
    (moduleItem) => moduleItem.href === `${pathname}?view=${view}`,
  );
}
