import { deserializeDateRange, parseDateRange } from '@/lib/ai/dateRange';
import { prisma } from '@/lib/db';
import { money, QueryTemplate } from './types';

export const salesMonthlySummary: QueryTemplate = {
  id: 'sales.monthly_summary',
  title: '기간별 매출 요약',
  examples: ['이번 달 매출 어때?', '지난달 매출 보여줘', '최근 30일 판매 현황', '올해 매출 요약'],
  keywords: ['매출', '판매'],
  async run({ companyId, params }) {
    const range = deserializeDateRange(params) ?? parseDateRange('이번 달');
    const dateWhere = { gte: range.from, lt: range.to };

    const aggregate = await prisma.invoice.aggregate({
      where: { companyId, issueDate: dateWhere, status: { not: 'cancelled' } },
      _sum: { totalAmount: true, remainingAmount: true },
      _count: { id: true }
    });

    const byCustomer = await prisma.invoice.groupBy({
      by: ['customerId'],
      where: { companyId, issueDate: dateWhere, status: { not: 'cancelled' } },
      _sum: { totalAmount: true },
      orderBy: { _sum: { totalAmount: 'desc' } },
      take: 5
    });
    const customers = await prisma.customer.findMany({ where: { id: { in: byCustomer.map((item) => item.customerId) } } });
    const customerName = new Map(customers.map((customer) => [customer.id, customer.name]));

    const totalSales = aggregate._sum.totalAmount ?? 0;
    const receivables = aggregate._sum.remainingAmount ?? 0;

    return {
      templateId: 'sales.monthly_summary',
      message: `${range.label} 매출은 ${money(totalSales)}이고, 해당 기간 미수는 ${money(receivables)}입니다.`,
      resultType: 'mixed',
      metrics: [
        { label: `${range.label} 매출`, value: money(totalSales) },
        { label: '청구건수', value: aggregate._count.id },
        { label: '미수금', value: money(receivables) }
      ],
      chart: {
        type: 'bar',
        title: `${range.label} 거래처별 매출 TOP 5`,
        xKey: '거래처',
        yKey: '매출',
        data: byCustomer.map((item) => ({ 거래처: customerName.get(item.customerId) ?? '-', 매출: item._sum.totalAmount ?? 0 }))
      },
      suggestions: ['지난달 매출 보여줘', '최근 30일 매출', '상품별 순위', '미수금 보기']
    };
  }
};
