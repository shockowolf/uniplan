import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const companyId = 'demo-company';

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

async function main() {
  await prisma.company.upsert({
    where: { id: companyId },
    update: {},
    create: {
      id: companyId,
      code: 'DEMO',
      name: '테크아틀리에 데모'
    }
  });

  await prisma.user.upsert({
    where: { companyId_email: { companyId, email: 'admin@uniplan.local' } },
    update: {},
    create: {
      companyId,
      email: 'admin@uniplan.local',
      passwordHash: 'demo-only',
      name: '관리자'
    }
  });

  const employees = await Promise.all([
    prisma.employee.upsert({
      where: { companyId_employeeNo: { companyId, employeeNo: 'E001' } },
      update: {},
      create: { companyId, employeeNo: 'E001', name: '김영업', department: '영업팀', position: '팀장', isSales: true }
    }),
    prisma.employee.upsert({
      where: { companyId_employeeNo: { companyId, employeeNo: 'E002' } },
      update: {},
      create: { companyId, employeeNo: 'E002', name: '박운영', department: '운영팀', position: '매니저', isSales: false }
    })
  ]);

  const customerSeeds = [
    ['C001', '구리정밀', 'A'],
    ['C002', '남양유통', 'B'],
    ['C003', '한강푸드', 'A'],
    ['C004', '별내테크', 'C'],
    ['C005', '다산메디', 'B']
  ] as const;

  const customers = await Promise.all(
    customerSeeds.map(([code, name, grade]) =>
      prisma.customer.upsert({
        where: { companyId_code: { companyId, code } },
        update: { name, grade },
        create: { companyId, code, name, grade, phone: '02-0000-0000', email: `${code.toLowerCase()}@example.com` }
      })
    )
  );

  const saasCategory = await prisma.productCategory.upsert({
    where: { companyId_code: { companyId, code: 'SAAS' } },
    update: {},
    create: { companyId, code: 'SAAS', name: 'SaaS' }
  });
  const deviceCategory = await prisma.productCategory.upsert({
    where: { companyId_code: { companyId, code: 'DEVICE' } },
    update: {},
    create: { companyId, code: 'DEVICE', name: 'Device' }
  });

  const productSeeds = [
    ['P001', 'ERP Basic 월구독', saasCategory.id, 49000, 999, 0],
    ['P002', '재고관리 모듈', saasCategory.id, 59000, 999, 0],
    ['P003', 'QR 주문 태블릿', deviceCategory.id, 320000, 6, 10],
    ['P004', '바코드 스캐너', deviceCategory.id, 180000, 12, 8],
    ['P005', '현장 설치 지원', saasCategory.id, 300000, 999, 0]
  ] as const;

  const products = await Promise.all(
    productSeeds.map(([code, name, categoryId, price]) =>
      prisma.product.upsert({
        where: { companyId_code: { companyId, code } },
        update: { name, categoryId, standardPrice: price },
        create: { companyId, code, name, categoryId, standardPrice: price, productType: code === 'P003' || code === 'P004' ? 'product' : 'service' }
      })
    )
  );

  const warehouse = await prisma.warehouse.upsert({
    where: { companyId_code: { companyId, code: 'MAIN' } },
    update: {},
    create: { companyId, code: 'MAIN', name: '메인 창고', location: '구리' }
  });

  for (const [index, seed] of productSeeds.entries()) {
    await prisma.inventoryBalance.upsert({
      where: { companyId_productId_warehouseId: { companyId, productId: products[index].id, warehouseId: warehouse.id } },
      update: { quantity: seed[4], safetyQuantity: seed[5] },
      create: { companyId, productId: products[index].id, warehouseId: warehouse.id, quantity: seed[4], safetyQuantity: seed[5] }
    });
  }

  const invoiceSeeds = [
    ['INV-202605-001', customers[0], '2026-05-01', 4_800_000, 4_800_000, 'paid'],
    ['INV-202605-002', customers[1], '2026-05-02', 2_600_000, 1_000_000, 'partial'],
    ['INV-202605-003', customers[2], '2026-05-03', 7_200_000, 0, 'issued'],
    ['INV-202604-001', customers[3], '2026-04-20', 1_800_000, 0, 'overdue'],
    ['INV-202604-002', customers[4], '2026-04-28', 3_600_000, 3_600_000, 'paid'],
    ['INV-202604-003', customers[0], '2026-04-10', 5_200_000, 5_200_000, 'paid']
  ] as const;

  for (const [index, [invoiceNo, customer, issueDate, totalAmount, paidAmount, status]] of invoiceSeeds.entries()) {
    const invoice = await prisma.invoice.upsert({
      where: { companyId_invoiceNo: { companyId, invoiceNo } },
      update: { totalAmount, paidAmount, remainingAmount: totalAmount - paidAmount, status },
      create: {
        companyId,
        invoiceNo,
        customerId: customer.id,
        issueDate: date(issueDate),
        dueDate: date(issueDate),
        status,
        supplyAmount: Math.round(totalAmount / 1.1),
        taxAmount: totalAmount - Math.round(totalAmount / 1.1),
        totalAmount,
        paidAmount,
        remainingAmount: totalAmount - paidAmount
      }
    });

    const product = products[index % products.length];
    await prisma.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } });
    await prisma.invoiceItem.create({
      data: {
        invoiceId: invoice.id,
        productId: product.id,
        itemName: product.name,
        quantity: 1,
        unitPrice: totalAmount,
        supplyAmount: Math.round(totalAmount / 1.1),
        taxAmount: totalAmount - Math.round(totalAmount / 1.1),
        totalAmount
      }
    });
  }

  await prisma.consultation.deleteMany({ where: { companyId } });
  await prisma.consultation.createMany({
    data: [
      { companyId, customerId: customers[1].id, type: '도입문의', status: 'open', content: '재고관리 모듈 견적 요청', createdAt: date('2026-04-30') },
      { companyId, customerId: customers[3].id, type: '장애문의', status: 'pending', content: '대시보드 로딩 지연 문의', createdAt: date('2026-04-29') },
      { companyId, customerId: customers[0].id, type: '사용문의', status: 'resolved', content: '거래처별 매출 조회 방법', createdAt: date('2026-05-02') }
    ]
  });

  await prisma.serviceCase.deleteMany({ where: { companyId } });
  await prisma.serviceCase.createMany({
    data: [
      { companyId, customerId: customers[2].id, productId: products[2].id, status: 'delayed', symptom: 'QR 주문 태블릿 충전 불량', receivedAt: date('2026-04-27'), dueAt: date('2026-05-01') },
      { companyId, customerId: customers[4].id, productId: products[3].id, status: 'in_progress', symptom: '스캐너 인식률 저하', receivedAt: date('2026-05-01'), dueAt: date('2026-05-04') }
    ]
  });

  console.log('Seed complete:', { companyId, customers: customers.length, products: products.length, invoices: invoiceSeeds.length, employees: employees.length });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
