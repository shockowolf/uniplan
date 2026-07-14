import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { money, QueryTemplate } from './types';
import { salesMonthlySummary } from './sales';

export const todaySummary: QueryTemplate = {
  id: 'dashboard.today_summary',
  title: '오늘 사업 현황 요약',
  examples: ['오늘 사업 현황 요약', '대시보드 요약', '지금 회사 상태 정리해줘'],
  keywords: ['오늘', '현황', '대시보드', '요약'],
  async run({ companyId, params }) {
    const [
      salesSummaryResult,
      receivablesAggregate,
      inventoryBalances,
      serviceCaseRecords,
    ] = await Promise.all([
      salesMonthlySummary.run({ companyId, params }),
      prisma.invoice.aggregate({
        where: { companyId, remainingAmount: { gt: 0 } },
        _sum: { remainingAmount: true },
      }),
      prisma.inventoryBalance.findMany({
        where: { companyId },
        include: { item: true },
      }),
      prisma.serviceCase.findMany({
        where: { companyId },
        include: { customer: true, item: true },
        orderBy: { receivedAt: 'asc' },
      }),
    ]);

    const lowStockCount = inventoryBalances.filter((inventoryBalance) =>
      inventoryBalance.quantity.lte(inventoryBalance.safetyQuantity),
    ).length;
    const delayedServiceCaseCount = serviceCaseRecords.filter(
      (serviceCaseRecord) => serviceCaseRecord.status === 'delayed',
    ).length;
    const receivableAmount =
      receivablesAggregate._sum.remainingAmount ?? new Prisma.Decimal(0);

    return {
      templateId: 'dashboard.today_summary',
      message: `오늘 기준 ${salesSummaryResult.metrics?.[0].label}은 ${salesSummaryResult.metrics?.[0].value}, 전체 미수금은 ${money(receivableAmount)}입니다. 재고 부족 ${lowStockCount}건, 지연 AS ${delayedServiceCaseCount}건이 있습니다.`,
      resultType: 'mixed',
      metrics: [
        {
          label: salesSummaryResult.metrics?.[0].label ?? '매출',
          value: salesSummaryResult.metrics?.[0].value ?? '-',
        },
        { label: '총 미수금', value: money(receivableAmount) },
        { label: '재고 부족', value: lowStockCount },
        { label: '지연 AS', value: delayedServiceCaseCount },
      ],
      chart: salesSummaryResult.chart,
      grid: {
        columns: ['구분', '거래처', '내용'],
        rows: serviceCaseRecords.map((serviceCaseRecord) => ({
          구분: 'AS',
          거래처: serviceCaseRecord.customer?.name ?? '-',
          내용: `${serviceCaseRecord.item?.name ?? '-'} - ${serviceCaseRecord.symptom}`,
        })),
      },
      suggestions: ['미수금 보기', '재고 부족 보기', '상담 지연 보기'],
    };
  },
};
