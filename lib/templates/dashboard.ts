import { prisma } from '@/lib/db';
import { money, QueryTemplate } from './types';
import { salesMonthlySummary } from './sales';

export const todaySummary: QueryTemplate = {
  id: 'dashboard.today_summary',
  title: '오늘 사업 현황 요약',
  examples: ['오늘 사업 현황 요약', '대시보드 요약', '지금 회사 상태 정리해줘'],
  keywords: ['오늘', '현황', '대시보드', '요약'],
  async run({ companyId, params }) {
    const [sales, receivables, lowStockRows, serviceCases] = await Promise.all([
      salesMonthlySummary.run({ companyId, params }),
      prisma.invoice.aggregate({ where: { companyId, remainingAmount: { gt: 0 } }, _sum: { remainingAmount: true } }),
      prisma.inventoryBalance.findMany({ where: { companyId }, include: { product: true } }),
      prisma.serviceCase.findMany({ where: { companyId }, include: { customer: true, product: true }, orderBy: { receivedAt: 'asc' } })
    ]);

    const lowStockCount = lowStockRows.filter((row) => row.quantity <= row.safetyQuantity).length;
    const delayedAs = serviceCases.filter((item) => item.status === 'delayed').length;
    const receivableAmount = receivables._sum.remainingAmount ?? 0;

    return {
      templateId: 'dashboard.today_summary',
      message: `오늘 기준 ${sales.metrics?.[0].label}은 ${sales.metrics?.[0].value}, 전체 미수금은 ${money(receivableAmount)}입니다. 재고 부족 ${lowStockCount}건, 지연 AS ${delayedAs}건이 있습니다.`,
      resultType: 'mixed',
      metrics: [
        { label: sales.metrics?.[0].label ?? '매출', value: sales.metrics?.[0].value ?? '-' },
        { label: '총 미수금', value: money(receivableAmount) },
        { label: '재고 부족', value: lowStockCount },
        { label: '지연 AS', value: delayedAs }
      ],
      chart: sales.chart,
      grid: {
        columns: ['구분', '거래처', '내용'],
        rows: serviceCases.map((item) => ({
          구분: 'AS',
          거래처: item.customer?.name ?? '-',
          내용: `${item.product?.name ?? '-'} - ${item.symptom}`
        }))
      },
      suggestions: ['미수금 보기', '재고 부족 보기', '상담 지연 보기']
    };
  }
};
