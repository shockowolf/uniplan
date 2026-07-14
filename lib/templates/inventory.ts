import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { QueryTemplate } from './types';

export const lowStockItems: QueryTemplate = {
  id: 'inventory.low_stock_items',
  title: '재고 부족 품목',
  examples: [
    '재고 부족한 품목',
    'QR 주문 태블릿 재고 보여줘',
    '부족한 재고 보여줘',
  ],
  keywords: ['재고', '부족'],
  async run({ companyId, params }) {
    const itemId =
      typeof params?.itemId === 'string' ? params.itemId : undefined;
    const itemName =
      typeof params?.itemName === 'string' ? params.itemName : undefined;

    const inventoryBalances = await prisma.inventoryBalance.findMany({
      where: { companyId, ...(itemId ? { itemId } : {}) },
      include: { item: { include: { category: true } } },
    });

    const matchingInventoryBalances = itemId
      ? inventoryBalances
      : inventoryBalances.filter((inventoryBalance) =>
          inventoryBalance.quantity.lte(inventoryBalance.safetyQuantity),
        );
    const stockStatusRows = matchingInventoryBalances.map(
      (inventoryBalance) => ({
        품목: inventoryBalance.item.name,
        카테고리: inventoryBalance.item.category?.name ?? '-',
        현재고: inventoryBalance.quantity.toNumber(),
        안전재고: inventoryBalance.safetyQuantity.toNumber(),
        부족수량: Prisma.Decimal.max(
          inventoryBalance.safetyQuantity.sub(inventoryBalance.quantity),
          0,
        ).toNumber(),
        상태: inventoryBalance.quantity.lte(inventoryBalance.safetyQuantity)
          ? '부족'
          : '정상',
      }),
    );

    return {
      templateId: 'inventory.low_stock_items',
      message: itemName
        ? `${itemName} 현재고는 ${stockStatusRows[0]?.현재고 ?? 0}개입니다. 안전재고는 ${stockStatusRows[0]?.안전재고 ?? 0}개입니다.`
        : `안전재고 이하 품목은 ${stockStatusRows.length}개입니다.`,
      resultType: 'mixed',
      metrics: itemName
        ? [
            {
              label: `${itemName} 현재고`,
              value: stockStatusRows[0]?.현재고 ?? 0,
            },
            { label: '안전재고', value: stockStatusRows[0]?.안전재고 ?? 0 },
            { label: '상태', value: stockStatusRows[0]?.상태 ?? '-' },
          ]
        : [{ label: '재고 부족 품목', value: stockStatusRows.length }],
      chart: {
        type: 'bar',
        title: itemName ? `${itemName} 재고 상태` : '재고 부족 품목',
        xKey: '품목',
        yKey: itemName ? '현재고' : '부족수량',
        data: stockStatusRows.map((stockStatusRow) => ({
          품목: stockStatusRow.품목,
          현재고: stockStatusRow.현재고,
          부족수량: stockStatusRow.부족수량,
        })),
      },
      grid: {
        columns: ['품목', '카테고리', '현재고', '안전재고', '부족수량', '상태'],
        rows: stockStatusRows,
      },
      suggestions: itemName
        ? ['재고 부족한 품목', '입출고 이력']
        : ['QR 주문 태블릿 재고 보여줘', '발주안 만들기', '입출고 이력'],
    };
  },
};
