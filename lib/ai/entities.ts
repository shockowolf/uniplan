import { prisma } from '@/lib/db';

export type EntityResolution = {
  customerId?: string;
  customerName?: string;
  itemId?: string;
  itemName?: string;
};

function normalize(value: string) {
  return value.replace(/\s+/g, '').toLowerCase();
}

export async function resolveEntities(
  message: string,
  companyId: string,
): Promise<EntityResolution> {
  const normalizedMessage = normalize(message);

  const [customers, items] = await Promise.all([
    prisma.customer.findMany({
      where: { companyId },
      select: { id: true, name: true, code: true },
    }),
    prisma.item.findMany({
      where: { companyId },
      select: { id: true, name: true, code: true },
    }),
  ]);

  const matchedCustomer = customers.find(
    (customerCandidate) =>
      normalizedMessage.includes(normalize(customerCandidate.name)) ||
      normalizedMessage.includes(normalize(customerCandidate.code)),
  );
  const matchedItem = items.find(
    (itemCandidate) =>
      normalizedMessage.includes(normalize(itemCandidate.name)) ||
      normalizedMessage.includes(normalize(itemCandidate.code)),
  );

  return {
    customerId: matchedCustomer?.id,
    customerName: matchedCustomer?.name,
    itemId: matchedItem?.id,
    itemName: matchedItem?.name,
  };
}

export function mergeEntityParams(
  templateParameters:
    Record<string, string | number | boolean | null> | undefined,
  resolvedEntities: EntityResolution,
): Record<string, string | number | boolean | null> {
  return {
    ...(templateParameters ?? {}),
    ...(resolvedEntities.customerId
      ? {
          customerId: resolvedEntities.customerId,
          customerName: resolvedEntities.customerName ?? null,
        }
      : {}),
    ...(resolvedEntities.itemId
      ? {
          itemId: resolvedEntities.itemId,
          itemName: resolvedEntities.itemName ?? null,
        }
      : {}),
  };
}
