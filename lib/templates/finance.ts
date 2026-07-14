import { prisma } from '@/lib/db';
import { money, QueryTemplate } from './types';

export const receivablesTop: QueryTemplate = {
  id: 'finance.receivables_top',
  title: '미수금 TOP 거래처',
  examples: [
    '미수금 많은 거래처 TOP 10',
    '구리정밀 미수금 보여줘',
    '연체된 청구건',
  ],
  keywords: ['미수', '못받은', '연체'],
  async run({ companyId, params }) {
    const customerId =
      typeof params?.customerId === 'string' ? params.customerId : undefined;
    const customerName =
      typeof params?.customerName === 'string'
        ? params.customerName
        : undefined;
    const outstandingInvoiceFilter = {
      companyId,
      remainingAmount: { gt: 0 },
      ...(customerId ? { customerId } : {}),
    };

    const outstandingInvoices = await prisma.invoice.findMany({
      where: outstandingInvoiceFilter,
      include: { customer: true },
      orderBy: { remainingAmount: 'desc' },
      take: 10,
    });

    const outstandingReceivablesAggregate = await prisma.invoice.aggregate({
      where: outstandingInvoiceFilter,
      _sum: { remainingAmount: true },
    });

    const receivableRows = outstandingInvoices.map((invoice) => ({
      거래처: invoice.customer.name,
      청구번호: invoice.invoiceNo,
      상태: invoice.status,
      미수금: money(invoice.remainingAmount),
    }));

    const targetLabel = customerName ? `${customerName}의` : '현재';

    return {
      templateId: 'finance.receivables_top',
      message: `${targetLabel} 미수금은 총 ${money(outstandingReceivablesAggregate._sum.remainingAmount ?? 0)}입니다.${customerName ? '' : ' 가장 큰 미수 거래처부터 정리했습니다.'}`,
      resultType: 'mixed',
      metrics: [
        {
          label: customerName ? `${customerName} 미수금` : '총 미수금',
          value: money(
            outstandingReceivablesAggregate._sum.remainingAmount ?? 0,
          ),
        },
      ],
      chart: {
        type: 'bar',
        title: customerName ? `${customerName} 미수 청구건` : '거래처별 미수금',
        xKey: customerName ? '청구번호' : '거래처',
        yKey: '미수금액',
        data: outstandingInvoices.map((invoice) => ({
          [customerName ? '청구번호' : '거래처']: customerName
            ? invoice.invoiceNo
            : invoice.customer.name,
          미수금액: invoice.remainingAmount.toNumber(),
        })),
      },
      grid: {
        columns: ['거래처', '청구번호', '상태', '미수금'],
        rows: receivableRows,
      },
      suggestions: customerName
        ? ['전체 미수금 보기', '이번 달 매출 어때?']
        : ['구리정밀 미수금 보여줘', '연체 건만 보기', '이번 달 입금 내역'],
    };
  },
};
