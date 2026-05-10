import { prisma } from '@/lib/db';

export type EntityResolution = {
  customerId?: string;
  customerName?: string;
  productId?: string;
  productName?: string;
};

function normalize(value: string) {
  return value.replace(/\s+/g, '').toLowerCase();
}

export async function resolveEntities(message: string, companyId: string): Promise<EntityResolution> {
  const normalizedMessage = normalize(message);

  const [customers, products] = await Promise.all([
    prisma.customer.findMany({ where: { companyId }, select: { id: true, name: true, code: true } }),
    prisma.product.findMany({ where: { companyId }, select: { id: true, name: true, code: true } })
  ]);

  const customer = customers.find((item) => normalizedMessage.includes(normalize(item.name)) || normalizedMessage.includes(normalize(item.code)));
  const product = products.find((item) => normalizedMessage.includes(normalize(item.name)) || normalizedMessage.includes(normalize(item.code)));

  return {
    customerId: customer?.id,
    customerName: customer?.name,
    productId: product?.id,
    productName: product?.name
  };
}

export function mergeEntityParams(
  params: Record<string, string | number | boolean | null> | undefined,
  entities: EntityResolution
): Record<string, string | number | boolean | null> {
  return {
    ...(params ?? {}),
    ...(entities.customerId ? { customerId: entities.customerId, customerName: entities.customerName ?? null } : {}),
    ...(entities.productId ? { productId: entities.productId, productName: entities.productName ?? null } : {})
  };
}
