import { deserializeDateRange, parseDateRange } from '@/lib/ai/dateRange';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { money, QueryTemplate } from './types';

export const salesMonthlySummary: QueryTemplate = {
  id: 'sales.monthly_summary',
  title: '기간별 매출 요약',
  examples: [
    '이번 달 매출 어때?',
    '지난달 매출 보여줘',
    '최근 30일 판매 현황',
    '올해 매출 요약',
  ],
  keywords: ['매출', '판매'],
  async run({ companyId, params }) {
    const reportingPeriod =
      deserializeDateRange(params) ?? parseDateRange('이번 달');
    const invoiceDateFilter = {
      gte: reportingPeriod.from,
      lt: reportingPeriod.to,
    };

    const invoiceAggregate = await prisma.invoice.aggregate({
      where: {
        companyId,
        issueDate: invoiceDateFilter,
        status: { not: 'cancelled' },
      },
      _sum: { totalAmount: true, remainingAmount: true },
      _count: { id: true },
    });

    const salesByCustomer = await prisma.invoice.groupBy({
      by: ['customerId'],
      where: {
        companyId,
        issueDate: invoiceDateFilter,
        status: { not: 'cancelled' },
      },
      _sum: { totalAmount: true },
      orderBy: { _sum: { totalAmount: 'desc' } },
      take: 5,
    });
    const salesCustomers = await prisma.customer.findMany({
      where: {
        companyId,
        id: {
          in: salesByCustomer.map(
            (customerSalesAggregate) => customerSalesAggregate.customerId,
          ),
        },
      },
    });
    const customerNameById = new Map(
      salesCustomers.map((customer) => [customer.id, customer.name]),
    );

    const totalSales =
      invoiceAggregate._sum.totalAmount ?? new Prisma.Decimal(0);
    const receivables =
      invoiceAggregate._sum.remainingAmount ?? new Prisma.Decimal(0);

    return {
      templateId: 'sales.monthly_summary',
      message: `${reportingPeriod.label} 매출은 ${money(totalSales)}이고, 해당 기간 미수는 ${money(receivables)}입니다.`,
      resultType: 'mixed',
      metrics: [
        { label: `${reportingPeriod.label} 매출`, value: money(totalSales) },
        { label: '청구건수', value: invoiceAggregate._count.id },
        { label: '미수금', value: money(receivables) },
      ],
      chart: {
        type: 'bar',
        title: `${reportingPeriod.label} 거래처별 매출 TOP 5`,
        xKey: '거래처',
        yKey: '매출',
        data: salesByCustomer.map((customerSalesAggregate) => ({
          거래처:
            customerNameById.get(customerSalesAggregate.customerId) ?? '-',
          매출: customerSalesAggregate._sum.totalAmount?.toNumber() ?? 0,
        })),
      },
      suggestions: [
        '지난달 매출 보여줘',
        '최근 30일 매출',
        '품목별 순위',
        '미수금 보기',
      ],
    };
  },
};
