import { prisma } from '@/lib/db';
import { QueryTemplate } from './types';

export const lowStockItems: QueryTemplate = {
  id: 'inventory.low_stock_items',
  title: '재고 부족 품목',
  examples: ['재고 부족한 품목', 'QR 주문 태블릿 재고 보여줘', '부족한 재고 보여줘'],
  keywords: ['재고', '부족'],
  async run({ companyId, params }) {
    const productId = typeof params?.productId === 'string' ? params.productId : undefined;
    const productName = typeof params?.productName === 'string' ? params.productName : undefined;

    const balances = await prisma.inventoryBalance.findMany({
      where: { companyId, ...(productId ? { productId } : {}) },
      include: { product: { include: { category: true } } }
    });

    const targetBalances = productId ? balances : balances.filter((balance) => balance.quantity <= balance.safetyQuantity);
    const rows = targetBalances.map((balance) => ({
      품목: balance.product.name,
      카테고리: balance.product.category?.name ?? '-',
      현재고: balance.quantity,
      안전재고: balance.safetyQuantity,
      부족수량: Math.max(balance.safetyQuantity - balance.quantity, 0),
      상태: balance.quantity <= balance.safetyQuantity ? '부족' : '정상'
    }));

    return {
      templateId: 'inventory.low_stock_items',
      message: productName
        ? `${productName} 현재고는 ${rows[0]?.현재고 ?? 0}개입니다. 안전재고는 ${rows[0]?.안전재고 ?? 0}개입니다.`
        : `안전재고 이하 품목은 ${rows.length}개입니다.`,
      resultType: 'mixed',
      metrics: productName
        ? [
            { label: `${productName} 현재고`, value: rows[0]?.현재고 ?? 0 },
            { label: '안전재고', value: rows[0]?.안전재고 ?? 0 },
            { label: '상태', value: rows[0]?.상태 ?? '-' }
          ]
        : [{ label: '재고 부족 품목', value: rows.length }],
      chart: {
        type: 'bar',
        title: productName ? `${productName} 재고 상태` : '재고 부족 품목',
        xKey: '품목',
        yKey: productName ? '현재고' : '부족수량',
        data: rows.map((row) => ({ 품목: row.품목, 현재고: row.현재고, 부족수량: row.부족수량 }))
      },
      grid: { columns: ['품목', '카테고리', '현재고', '안전재고', '부족수량', '상태'], rows },
      suggestions: productName ? ['재고 부족한 품목', '입출고 이력'] : ['QR 주문 태블릿 재고 보여줘', '발주안 만들기', '입출고 이력']
    };
  }
};
