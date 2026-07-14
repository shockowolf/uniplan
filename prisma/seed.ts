import { BomVersionStatus, ItemType, PrismaClient } from '@prisma/client';
import {
  activateBomRevision,
  replaceDraftBomComponents,
} from '../lib/domain/boms';
import { postInventoryTransaction } from '../lib/domain/inventory';

const prisma = new PrismaClient();
const companyId = 'demo-company';
const atUtcMidnight = (calendarDate: string) =>
  new Date(`${calendarDate}T00:00:00.000Z`);

const menuDefinitions = [
  {
    code: 'dashboard',
    label: '대시보드',
    href: '/',
    resourceCode: 'dashboard.analytics',
    sortOrder: 10,
  },
  {
    code: 'sales',
    label: '영업',
    href: '/sales',
    resourceCode: 'sales.read',
    sortOrder: 20,
  },
  {
    code: 'customers',
    label: '고객',
    href: '/customers',
    resourceCode: 'customers.read',
    sortOrder: 30,
  },
  {
    code: 'inventory',
    label: '재고',
    href: '/inventory',
    resourceCode: 'inventory.read',
    sortOrder: 40,
  },
  {
    code: 'inventory-items',
    label: '품목',
    href: '/inventory/items',
    resourceCode: 'inventory.items',
    sortOrder: 10,
    parentCode: 'inventory',
  },
  {
    code: 'inventory-boms',
    label: 'BOM',
    href: '/inventory/boms',
    resourceCode: 'inventory.boms',
    sortOrder: 20,
    parentCode: 'inventory',
  },
  {
    code: 'inventory-warehouses',
    label: '창고',
    href: '/inventory/warehouses',
    resourceCode: 'inventory.warehouses',
    sortOrder: 30,
    parentCode: 'inventory',
  },
  {
    code: 'inventory-stock',
    label: '현재고',
    href: '/inventory/stock',
    resourceCode: 'inventory.stock',
    sortOrder: 40,
    parentCode: 'inventory',
  },
  {
    code: 'inventory-movements',
    label: '재고 거래',
    href: '/inventory/movements',
    resourceCode: 'inventory.movements',
    sortOrder: 50,
    parentCode: 'inventory',
  },
  {
    code: 'finance',
    label: '재무',
    href: '/finance',
    resourceCode: 'finance.read',
    sortOrder: 50,
  },
  {
    code: 'operations',
    label: '운영',
    href: '/operations',
    resourceCode: 'operations.read',
    sortOrder: 60,
  },
  {
    code: 'settings',
    label: '설정',
    href: '/system',
    resourceCode: 'settings.read',
    sortOrder: 70,
  },
  {
    code: 'settings-navigation',
    label: '메뉴 관리',
    href: '/settings/navigation',
    resourceCode: 'settings.navigation',
    sortOrder: 10,
    parentCode: 'settings',
  },
] as const;

async function seedDemoIdentityAndPermissions() {
  await prisma.company.upsert({
    where: { id: companyId },
    update: { name: '테크아틀리에 데모' },
    create: { id: companyId, code: 'DEMO', name: '테크아틀리에 데모' },
  });
  const erpDomain = await prisma.domain.upsert({
    where: { companyId_code: { companyId, code: 'ERP' } },
    update: { name: 'UNIPLAN ERP', domainName: 'uniplan.local', active: true },
    create: {
      companyId,
      code: 'ERP',
      name: 'UNIPLAN ERP',
      domainName: 'uniplan.local',
    },
  });
  const [adminRole, staffRole] = await Promise.all([
    prisma.role.upsert({
      where: { companyId_code: { companyId, code: 'admin' } },
      update: { domainId: erpDomain.id, name: '관리자', active: true },
      create: {
        companyId,
        domainId: erpDomain.id,
        code: 'admin',
        name: '관리자',
        description: 'UNIPLAN 전체 관리 역할',
      },
    }),
    prisma.role.upsert({
      where: { companyId_code: { companyId, code: 'staff' } },
      update: { domainId: erpDomain.id, name: '사용자', active: true },
      create: {
        companyId,
        domainId: erpDomain.id,
        code: 'staff',
        name: '사용자',
        description: 'UNIPLAN 조회 역할',
      },
    }),
  ]);
  const adminUser = await prisma.user.upsert({
    where: { companyId_email: { companyId, email: 'admin@uniplan.local' } },
    update: { domainId: erpDomain.id, name: '관리자', status: 'active' },
    create: {
      companyId,
      domainId: erpDomain.id,
      email: 'admin@uniplan.local',
      passwordHash: 'demo-only',
      name: '관리자',
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: adminRole.id } },
    update: {},
    create: { userId: adminUser.id, roleId: adminRole.id },
  });

  const menuItemIdByCode = new Map<string, string>();
  for (const menuDefinition of menuDefinitions) {
    const menuItem = await prisma.menuItem.upsert({
      where: { companyId_code: { companyId, code: menuDefinition.code } },
      update: {
        domainId: erpDomain.id,
        parentId:
          'parentCode' in menuDefinition
            ? (menuItemIdByCode.get(menuDefinition.parentCode) ?? null)
            : null,
        label: menuDefinition.label,
        href: menuDefinition.href,
        resourceCode: menuDefinition.resourceCode,
        sortOrder: menuDefinition.sortOrder,
        active: true,
      },
      create: {
        companyId,
        domainId: erpDomain.id,
        parentId:
          'parentCode' in menuDefinition
            ? (menuItemIdByCode.get(menuDefinition.parentCode) ?? null)
            : null,
        code: menuDefinition.code,
        label: menuDefinition.label,
        href: menuDefinition.href,
        resourceCode: menuDefinition.resourceCode,
        sortOrder: menuDefinition.sortOrder,
      },
    });
    menuItemIdByCode.set(menuDefinition.code, menuItem.id);
    await prisma.rolePermission.upsert({
      where: {
        roleId_menuItemId: { roleId: adminRole.id, menuItemId: menuItem.id },
      },
      update: {
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        canAdmin: true,
      },
      create: {
        roleId: adminRole.id,
        menuItemId: menuItem.id,
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        canAdmin: true,
      },
    });
    const staffHasReadPermission =
      !menuDefinition.resourceCode.startsWith('settings.');
    await prisma.rolePermission.upsert({
      where: {
        roleId_menuItemId: { roleId: staffRole.id, menuItemId: menuItem.id },
      },
      update: {
        canRead: staffHasReadPermission,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
        canAdmin: false,
      },
      create: {
        roleId: staffRole.id,
        menuItemId: menuItem.id,
        canRead: staffHasReadPermission,
      },
    });
  }
  return adminUser;
}

async function seedDemoItemsAndBoms(adminUserId: string) {
  const [materialCategory, assemblyCategory, serviceCategory] =
    await Promise.all([
      prisma.itemCategory.upsert({
        where: { companyId_code: { companyId, code: 'MATERIAL' } },
        update: { name: '원자재', active: true },
        create: { companyId, code: 'MATERIAL', name: '원자재' },
      }),
      prisma.itemCategory.upsert({
        where: { companyId_code: { companyId, code: 'ASSEMBLY' } },
        update: { name: '조립품', active: true },
        create: { companyId, code: 'ASSEMBLY', name: '조립품' },
      }),
      prisma.itemCategory.upsert({
        where: { companyId_code: { companyId, code: 'SERVICE' } },
        update: { name: '서비스', active: true },
        create: { companyId, code: 'SERVICE', name: '서비스' },
      }),
    ]);
  const itemDefinitions = [
    {
      code: 'FRAME',
      name: '태블릿 프레임',
      itemType: ItemType.RAW_MATERIAL,
      categoryId: materialCategory.id,
      standardPrice: '18000',
      costPrice: '12000',
      trackInventory: true,
    },
    {
      code: 'SCREW',
      name: '조립 나사',
      itemType: ItemType.RAW_MATERIAL,
      categoryId: materialCategory.id,
      standardPrice: '100',
      costPrice: '40',
      trackInventory: true,
    },
    {
      code: 'PACK',
      name: '포장 상자',
      itemType: ItemType.CONSUMABLE,
      categoryId: materialCategory.id,
      standardPrice: '1500',
      costPrice: '900',
      trackInventory: true,
    },
    {
      code: 'TABLET-CORE',
      name: '태블릿 코어 조립품',
      itemType: ItemType.COMPONENT,
      categoryId: assemblyCategory.id,
      standardPrice: '210000',
      costPrice: '160000',
      trackInventory: true,
    },
    {
      code: 'TABLET-KIT',
      name: 'QR 주문 태블릿',
      itemType: ItemType.FINISHED_GOOD,
      categoryId: assemblyCategory.id,
      standardPrice: '320000',
      costPrice: '190000',
      trackInventory: true,
    },
    {
      code: 'SCANNER',
      name: '바코드 스캐너',
      itemType: ItemType.FINISHED_GOOD,
      categoryId: assemblyCategory.id,
      standardPrice: '180000',
      costPrice: '110000',
      trackInventory: true,
    },
    {
      code: 'INSTALL',
      name: '현장 설치 지원',
      itemType: ItemType.SERVICE,
      categoryId: serviceCategory.id,
      standardPrice: '300000',
      costPrice: '0',
      trackInventory: false,
    },
  ] as const;
  const seededItemsByCode = new Map<string, { id: string; name: string }>();
  for (const itemDefinition of itemDefinitions) {
    const seededItem = await prisma.item.upsert({
      where: { companyId_code: { companyId, code: itemDefinition.code } },
      update: {
        name: itemDefinition.name,
        itemType: itemDefinition.itemType,
        categoryId: itemDefinition.categoryId,
        standardPrice: itemDefinition.standardPrice,
        costPrice: itemDefinition.costPrice,
        trackInventory: itemDefinition.trackInventory,
        active: true,
      },
      create: { companyId, ...itemDefinition },
    });
    seededItemsByCode.set(itemDefinition.code, seededItem);
  }
  const mainWarehouse = await prisma.warehouse.upsert({
    where: { companyId_code: { companyId, code: 'MAIN' } },
    update: { name: '메인 창고', location: '구리', active: true },
    create: { companyId, code: 'MAIN', name: '메인 창고', location: '구리' },
  });
  const productionWarehouse = await prisma.warehouse.upsert({
    where: { companyId_code: { companyId, code: 'LINE' } },
    update: { name: '생산 창고', location: '구리 생산라인', active: true },
    create: {
      companyId,
      code: 'LINE',
      name: '생산 창고',
      location: '구리 생산라인',
    },
  });

  const tabletCoreBom = await prisma.bom.upsert({
    where: { companyId_code: { companyId, code: 'BOM-TABLET-CORE' } },
    update: { name: '태블릿 코어 BOM', active: true },
    create: {
      companyId,
      code: 'BOM-TABLET-CORE',
      name: '태블릿 코어 BOM',
      outputItemId: seededItemsByCode.get('TABLET-CORE')!.id,
    },
  });
  const tabletCoreDraftRevision = await prisma.bomVersion.upsert({
    where: { bomId_revision: { bomId: tabletCoreBom.id, revision: 1 } },
    update: {},
    create: { bomId: tabletCoreBom.id, revision: 1 },
  });
  if (tabletCoreDraftRevision.status === BomVersionStatus.DRAFT) {
    await replaceDraftBomComponents(companyId, tabletCoreDraftRevision.id, [
      {
        itemId: seededItemsByCode.get('FRAME')!.id,
        quantity: '1',
        sortOrder: 10,
      },
      {
        itemId: seededItemsByCode.get('SCREW')!.id,
        quantity: '4',
        sortOrder: 20,
      },
    ]);
    await activateBomRevision(companyId, tabletCoreDraftRevision.id);
  }

  const tabletKitBom = await prisma.bom.upsert({
    where: { companyId_code: { companyId, code: 'BOM-TABLET-KIT' } },
    update: { name: 'QR 주문 태블릿 BOM', active: true },
    create: {
      companyId,
      code: 'BOM-TABLET-KIT',
      name: 'QR 주문 태블릿 BOM',
      outputItemId: seededItemsByCode.get('TABLET-KIT')!.id,
    },
  });
  const tabletKitDraftRevision = await prisma.bomVersion.upsert({
    where: { bomId_revision: { bomId: tabletKitBom.id, revision: 1 } },
    update: {},
    create: { bomId: tabletKitBom.id, revision: 1 },
  });
  if (tabletKitDraftRevision.status === BomVersionStatus.DRAFT) {
    await replaceDraftBomComponents(companyId, tabletKitDraftRevision.id, [
      {
        itemId: seededItemsByCode.get('TABLET-CORE')!.id,
        quantity: '1',
        sortOrder: 10,
      },
      {
        itemId: seededItemsByCode.get('PACK')!.id,
        quantity: '1',
        sortOrder: 20,
      },
      {
        itemId: seededItemsByCode.get('SCREW')!.id,
        quantity: '2',
        sortOrder: 30,
      },
    ]);
    await activateBomRevision(companyId, tabletKitDraftRevision.id);
  }

  await postInventoryTransaction(companyId, {
    type: 'OPENING',
    idempotencyKey: 'seed-opening-inventory-v1',
    occurredAt: atUtcMidnight('2026-05-01'),
    reference: 'UNIPLAN-DEMO-OPENING',
    createdById: adminUserId,
    lines: [
      {
        itemId: seededItemsByCode.get('FRAME')!.id,
        warehouseId: mainWarehouse.id,
        quantity: '100',
      },
      {
        itemId: seededItemsByCode.get('SCREW')!.id,
        warehouseId: mainWarehouse.id,
        quantity: '500',
      },
      {
        itemId: seededItemsByCode.get('PACK')!.id,
        warehouseId: mainWarehouse.id,
        quantity: '100',
      },
      {
        itemId: seededItemsByCode.get('TABLET-KIT')!.id,
        warehouseId: mainWarehouse.id,
        quantity: '6',
      },
      {
        itemId: seededItemsByCode.get('SCANNER')!.id,
        warehouseId: mainWarehouse.id,
        quantity: '12',
      },
    ],
  });
  await Promise.all([
    prisma.inventoryBalance.update({
      where: {
        companyId_itemId_warehouseId: {
          companyId,
          itemId: seededItemsByCode.get('TABLET-KIT')!.id,
          warehouseId: mainWarehouse.id,
        },
      },
      data: { safetyQuantity: 10 },
    }),
    prisma.inventoryBalance.update({
      where: {
        companyId_itemId_warehouseId: {
          companyId,
          itemId: seededItemsByCode.get('SCANNER')!.id,
          warehouseId: mainWarehouse.id,
        },
      },
      data: { safetyQuantity: 8 },
    }),
  ]);
  return { seededItemsByCode, mainWarehouse, productionWarehouse };
}

async function seedDemoSalesAndCrm(
  seededItemsByCode: Map<string, { id: string; name: string }>,
) {
  await Promise.all([
    prisma.employee.upsert({
      where: { companyId_employeeNo: { companyId, employeeNo: 'E001' } },
      update: {},
      create: {
        companyId,
        employeeNo: 'E001',
        name: '김영업',
        department: '영업팀',
        position: '팀장',
        isSales: true,
      },
    }),
    prisma.employee.upsert({
      where: { companyId_employeeNo: { companyId, employeeNo: 'E002' } },
      update: {},
      create: {
        companyId,
        employeeNo: 'E002',
        name: '박운영',
        department: '운영팀',
        position: '매니저',
      },
    }),
  ]);
  const customerDefinitions = [
    ['C001', '구리정밀', 'A'],
    ['C002', '남양유통', 'B'],
    ['C003', '한강푸드', 'A'],
    ['C004', '별내테크', 'C'],
    ['C005', '다산메디', 'B'],
  ] as const;
  const seededCustomers = await Promise.all(
    customerDefinitions.map(([customerCode, customerName, customerGrade]) =>
      prisma.customer.upsert({
        where: { companyId_code: { companyId, code: customerCode } },
        update: { name: customerName, grade: customerGrade },
        create: {
          companyId,
          code: customerCode,
          name: customerName,
          grade: customerGrade,
          phone: '02-0000-0000',
          email: `${customerCode.toLowerCase()}@example.com`,
        },
      }),
    ),
  );
  const invoiceDefinitions = [
    [
      'INV-202605-001',
      seededCustomers[0],
      '2026-05-01',
      4_800_000,
      4_800_000,
      'paid',
    ],
    [
      'INV-202605-002',
      seededCustomers[1],
      '2026-05-02',
      2_600_000,
      1_000_000,
      'partial',
    ],
    [
      'INV-202605-003',
      seededCustomers[2],
      '2026-05-03',
      7_200_000,
      0,
      'issued',
    ],
    [
      'INV-202604-001',
      seededCustomers[3],
      '2026-04-20',
      1_800_000,
      0,
      'overdue',
    ],
    [
      'INV-202604-002',
      seededCustomers[4],
      '2026-04-28',
      3_600_000,
      3_600_000,
      'paid',
    ],
    [
      'INV-202604-003',
      seededCustomers[0],
      '2026-04-10',
      5_200_000,
      5_200_000,
      'paid',
    ],
  ] as const;
  const rotatingInvoiceItems = [
    seededItemsByCode.get('TABLET-KIT')!,
    seededItemsByCode.get('SCANNER')!,
    seededItemsByCode.get('INSTALL')!,
  ];
  for (const [
    invoiceDefinitionIndex,
    [invoiceNo, customer, issueDate, totalAmount, paidAmount, status],
  ] of invoiceDefinitions.entries()) {
    const supplyAmount = Math.round(totalAmount / 1.1);
    const invoice = await prisma.invoice.upsert({
      where: { companyId_invoiceNo: { companyId, invoiceNo } },
      update: {
        totalAmount,
        paidAmount,
        remainingAmount: totalAmount - paidAmount,
        status,
      },
      create: {
        companyId,
        invoiceNo,
        customerId: customer.id,
        issueDate: atUtcMidnight(issueDate),
        dueDate: atUtcMidnight(issueDate),
        status,
        supplyAmount,
        taxAmount: totalAmount - supplyAmount,
        totalAmount,
        paidAmount,
        remainingAmount: totalAmount - paidAmount,
      },
    });
    const invoiceItem =
      rotatingInvoiceItems[
        invoiceDefinitionIndex % rotatingInvoiceItems.length
      ];
    await prisma.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } });
    await prisma.invoiceItem.create({
      data: {
        invoiceId: invoice.id,
        itemId: invoiceItem.id,
        itemName: invoiceItem.name,
        quantity: 1,
        unitPrice: totalAmount,
        supplyAmount,
        taxAmount: totalAmount - supplyAmount,
        totalAmount,
      },
    });
  }
  await prisma.consultation.deleteMany({ where: { companyId } });
  await prisma.consultation.createMany({
    data: [
      {
        companyId,
        customerId: seededCustomers[1].id,
        type: '도입문의',
        status: 'open',
        content: '재고관리 모듈 견적 요청',
        createdAt: atUtcMidnight('2026-04-30'),
      },
      {
        companyId,
        customerId: seededCustomers[3].id,
        type: '장애문의',
        status: 'pending',
        content: '대시보드 로딩 지연 문의',
        createdAt: atUtcMidnight('2026-04-29'),
      },
      {
        companyId,
        customerId: seededCustomers[0].id,
        type: '사용문의',
        status: 'resolved',
        content: '거래처별 매출 조회 방법',
        createdAt: atUtcMidnight('2026-05-02'),
      },
    ],
  });
  await prisma.serviceCase.deleteMany({ where: { companyId } });
  await prisma.serviceCase.createMany({
    data: [
      {
        companyId,
        customerId: seededCustomers[2].id,
        itemId: seededItemsByCode.get('TABLET-KIT')!.id,
        status: 'delayed',
        symptom: 'QR 주문 태블릿 충전 불량',
        receivedAt: atUtcMidnight('2026-04-27'),
        dueAt: atUtcMidnight('2026-05-01'),
      },
      {
        companyId,
        customerId: seededCustomers[4].id,
        itemId: seededItemsByCode.get('SCANNER')!.id,
        status: 'in_progress',
        symptom: '스캐너 인식률 저하',
        receivedAt: atUtcMidnight('2026-05-01'),
        dueAt: atUtcMidnight('2026-05-04'),
      },
    ],
  });
  return seededCustomers.length;
}

async function seedDemoDatabase() {
  const adminUser = await seedDemoIdentityAndPermissions();
  const inventorySeedResult = await seedDemoItemsAndBoms(adminUser.id);
  const customerCount = await seedDemoSalesAndCrm(
    inventorySeedResult.seededItemsByCode,
  );
  console.log('Seed complete:', {
    companyId,
    menus: menuDefinitions.length,
    items: inventorySeedResult.seededItemsByCode.size,
    customers: customerCount,
    warehouses: 2,
    boms: 2,
  });
}

seedDemoDatabase()
  .catch((seedFailure) => {
    console.error(seedFailure);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
