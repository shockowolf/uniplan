import {
  BomVersionStatus,
  ItemType,
  Prisma,
  type PrismaClient,
} from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  type CompanyMutationOptions,
  withCompanyMutationTransaction,
} from '@/lib/domain/concurrency';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/lib/domain/errors';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

type ComponentInput = {
  itemId: string;
  quantity: Prisma.Decimal.Value;
  sortOrder?: number;
};

function requiredText(value: string, field: string) {
  const normalizedText = value.trim();
  if (!normalizedText) throw new ValidationError(`${field} is required`);
  return normalizedText;
}

function positiveQuantity(
  value: Prisma.Decimal.Value,
  field: string,
  errorCode: string,
) {
  try {
    const quantity = new Prisma.Decimal(value);
    if (!quantity.isPositive()) {
      throw new ValidationError(`${field} must be positive`, errorCode);
    }
    return quantity;
  } catch (quantityError) {
    if (quantityError instanceof ValidationError) throw quantityError;
    throw new ValidationError(`${field} is invalid`, errorCode);
  }
}

async function requireMutableDraftBomRevision(
  companyId: string,
  bomVersionId: string,
  databaseClient: DatabaseClient,
) {
  const draftBomVersion = await databaseClient.bomVersion.findFirst({
    where: { id: bomVersionId, bom: { companyId } },
    select: {
      id: true,
      status: true,
      _count: { select: { inventoryTransactions: true } },
    },
  });
  if (!draftBomVersion) throw new NotFoundError('BOM revision not found');
  if (
    draftBomVersion.status !== BomVersionStatus.DRAFT ||
    draftBomVersion._count.inventoryTransactions > 0
  ) {
    throw new ConflictError(
      'Activated, retired, or used BOM revisions are immutable',
      'BOM_REVISION_IMMUTABLE',
    );
  }
  return draftBomVersion;
}

export async function createBom(
  companyId: string,
  input: {
    code: string;
    name: string;
    outputItemId: string;
    notes?: string | null;
  },
  databaseClient: PrismaClient = prisma,
  transactionOptions: CompanyMutationOptions = {},
) {
  return withCompanyMutationTransaction(
    companyId,
    databaseClient,
    async (databaseTransaction) => {
      const outputItem = await databaseTransaction.item.findFirst({
        where: { id: input.outputItemId, companyId, active: true },
        select: { id: true, itemType: true, trackInventory: true },
      });
      if (!outputItem)
        throw new ValidationError(
          'Output item must belong to the same company',
          'INVALID_BOM_OUTPUT',
        );
      if (
        outputItem.itemType === ItemType.SERVICE ||
        !outputItem.trackInventory
      ) {
        throw new ValidationError(
          'BOM output must be an inventory-tracked item',
          'INVALID_BOM_OUTPUT',
        );
      }

      return databaseTransaction.bom.create({
        data: {
          companyId,
          code: requiredText(input.code, 'code'),
          name: requiredText(input.name, 'name'),
          outputItemId: input.outputItemId,
          versions: {
            create: {
              revision: 1,
              notes: input.notes?.trim() || null,
            },
          },
        },
        include: { versions: true },
      });
    },
    transactionOptions,
  );
}

export async function updateBom(
  companyId: string,
  bomId: string,
  input: { code?: string; name?: string },
  databaseClient: PrismaClient = prisma,
  transactionOptions: CompanyMutationOptions = {},
) {
  return withCompanyMutationTransaction(
    companyId,
    databaseClient,
    async (databaseTransaction) => {
      const existingBom = await databaseTransaction.bom.findFirst({
        where: { id: bomId, companyId },
        select: { id: true },
      });
      if (!existingBom) throw new NotFoundError('BOM not found');
      const normalizedCode = input.code?.trim();
      const normalizedName = input.name?.trim();
      if (input.code !== undefined && !normalizedCode)
        throw new ValidationError('code is required');
      if (input.name !== undefined && !normalizedName)
        throw new ValidationError('name is required');
      return databaseTransaction.bom.update({
        where: { id: bomId, companyId },
        data: {
          ...(normalizedCode ? { code: normalizedCode } : {}),
          ...(normalizedName ? { name: normalizedName } : {}),
        },
      });
    },
    transactionOptions,
  );
}

export async function deactivateBom(
  companyId: string,
  bomId: string,
  databaseClient: PrismaClient = prisma,
  transactionOptions: CompanyMutationOptions = {},
) {
  return withCompanyMutationTransaction(
    companyId,
    databaseClient,
    async (databaseTransaction) => {
      const existingBom = await databaseTransaction.bom.findFirst({
        where: { id: bomId, companyId },
        select: {
          id: true,
          versions: {
            where: { status: BomVersionStatus.ACTIVE },
            select: { id: true },
            take: 1,
          },
        },
      });
      if (!existingBom) throw new NotFoundError('BOM not found');
      if (existingBom.versions.length > 0) {
        throw new ConflictError(
          'Active BOM revisions must be retired before deactivation',
          'BOM_HAS_ACTIVE_REVISION',
        );
      }
      return databaseTransaction.bom.update({
        where: { id: bomId, companyId },
        data: { active: false },
      });
    },
    transactionOptions,
  );
}

export async function createDraftBomRevision(
  companyId: string,
  bomId: string,
  notes?: string | null,
  databaseClient: PrismaClient = prisma,
  transactionOptions: CompanyMutationOptions = {},
) {
  return withCompanyMutationTransaction(
    companyId,
    databaseClient,
    async (databaseTransaction) => {
      const bomRecord = await databaseTransaction.bom.findFirst({
        where: { id: bomId, companyId, active: true },
        include: {
          versions: {
            where: { status: BomVersionStatus.ACTIVE },
            include: {
              components: {
                orderBy: [{ sortOrder: 'asc' }, { componentItemId: 'asc' }],
              },
            },
            take: 1,
          },
          _count: { select: { versions: true } },
        },
      });
      if (!bomRecord) throw new NotFoundError('BOM not found');
      const latestRevisionAggregate =
        await databaseTransaction.bomVersion.aggregate({
          where: { bomId },
          _max: { revision: true },
        });
      const sourceActiveBomVersion = bomRecord.versions[0];
      return databaseTransaction.bomVersion.create({
        data: {
          companyId,
          bomId,
          revision: (latestRevisionAggregate._max.revision ?? 0) + 1,
          notes: notes?.trim() || null,
          components: sourceActiveBomVersion
            ? {
                create: sourceActiveBomVersion.components.map((component) => ({
                  componentItemId: component.componentItemId,
                  quantity: component.quantity,
                  sortOrder: component.sortOrder,
                })),
              }
            : undefined,
        },
        include: { components: true },
      });
    },
    transactionOptions,
  );
}

export async function replaceDraftBomComponents(
  companyId: string,
  bomVersionId: string,
  componentInputs: ComponentInput[],
  databaseClient: PrismaClient = prisma,
  transactionOptions: CompanyMutationOptions = {},
) {
  return withCompanyMutationTransaction(
    companyId,
    databaseClient,
    async (databaseTransaction) => {
      await requireMutableDraftBomRevision(
        companyId,
        bomVersionId,
        databaseTransaction,
      );
      const uniqueComponentItemIds = new Set(
        componentInputs.map((componentInput) => componentInput.itemId),
      );
      if (uniqueComponentItemIds.size !== componentInputs.length) {
        throw new ValidationError(
          'A component item can appear only once per revision',
          'DUPLICATE_BOM_COMPONENT',
        );
      }
      if (componentInputs.length === 0)
        throw new ValidationError(
          'A BOM revision requires at least one component',
          'EMPTY_BOM',
        );

      const componentItems = await databaseTransaction.item.findMany({
        where: {
          companyId,
          id: {
            in: componentInputs.map((componentInput) => componentInput.itemId),
          },
          active: true,
        },
        select: { id: true, itemType: true, trackInventory: true },
      });
      if (componentItems.length !== componentInputs.length) {
        throw new ValidationError(
          'All components must belong to the same company',
          'INVALID_BOM_COMPONENT',
        );
      }
      if (
        componentItems.some(
          (componentItem) =>
            componentItem.itemType === ItemType.SERVICE ||
            !componentItem.trackInventory,
        )
      ) {
        throw new ValidationError(
          'BOM components must be inventory-tracked items',
          'INVALID_BOM_COMPONENT',
        );
      }

      const componentRecords = componentInputs.map(
        (componentInput, componentIndex) => {
          const componentQuantity = positiveQuantity(
            componentInput.quantity,
            'components',
            'INVALID_BOM_QUANTITY',
          );
          return {
            companyId,
            bomVersionId,
            componentItemId: componentInput.itemId,
            quantity: componentQuantity,
            sortOrder: componentInput.sortOrder ?? componentIndex,
          };
        },
      );
      await databaseTransaction.bomComponent.deleteMany({
        where: { bomVersionId },
      });
      await databaseTransaction.bomComponent.createMany({
        data: componentRecords,
      });
      return databaseTransaction.bomVersion.findUniqueOrThrow({
        where: { id: bomVersionId },
        include: { components: { include: { componentItem: true } } },
      });
    },
    transactionOptions,
  );
}

type LoadedBomVersion = Prisma.BomVersionGetPayload<{
  include: {
    bom: { include: { outputItem: true } };
    components: { include: { componentItem: true } };
  };
}>;

async function assertNoBomCycle(
  targetBomVersion: LoadedBomVersion,
  bomVersionsById: Map<string, LoadedBomVersion>,
  pinnedChildVersionIdsByComponentId: Map<string, string | null>,
) {
  const visitBomVersion = (
    currentBomVersion: LoadedBomVersion,
    ancestorOutputItemIds: readonly string[],
  ) => {
    if (
      !currentBomVersion.bom.active ||
      !currentBomVersion.bom.outputItem.active ||
      !currentBomVersion.bom.outputItem.trackInventory ||
      currentBomVersion.bom.outputItem.itemType === ItemType.SERVICE
    ) {
      throw new ValidationError(
        'BOM output must be active and inventory tracked',
        'INVALID_BOM_OUTPUT',
      );
    }
    const outputItemId = currentBomVersion.bom.outputItemId;
    const currentOutputItemPath = [...ancestorOutputItemIds, outputItemId];
    const sortedComponents = [...currentBomVersion.components].sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.componentItem.code.localeCompare(right.componentItem.code) ||
        left.componentItemId.localeCompare(right.componentItemId),
    );
    for (const component of sortedComponents) {
      if (
        !component.componentItem.active ||
        !component.componentItem.trackInventory ||
        component.componentItem.itemType === ItemType.SERVICE
      ) {
        throw new ValidationError(
          'BOM components must be active and inventory tracked',
          'INVALID_BOM_COMPONENT',
        );
      }
      if (currentOutputItemPath.includes(component.componentItemId)) {
        throw new ConflictError('BOM cycle detected', 'BOM_CYCLE');
      }
      const childBomVersionId =
        currentBomVersion.id === targetBomVersion.id
          ? pinnedChildVersionIdsByComponentId.get(component.id)
          : component.childBomVersionId;
      if (childBomVersionId) {
        const childBomVersion = bomVersionsById.get(childBomVersionId);
        if (!childBomVersion) {
          throw new ValidationError(
            'Pinned child BOM revision is unavailable',
            'INVALID_CHILD_BOM_REVISION',
          );
        }
        visitBomVersion(childBomVersion, currentOutputItemPath);
      }
    }
  };
  visitBomVersion(targetBomVersion, []);
}

export async function activateBomRevision(
  companyId: string,
  bomVersionId: string,
  databaseClient: PrismaClient = prisma,
  transactionOptions: CompanyMutationOptions = {},
) {
  return withCompanyMutationTransaction(
    companyId,
    databaseClient,
    async (databaseTransaction) => {
      await requireMutableDraftBomRevision(
        companyId,
        bomVersionId,
        databaseTransaction,
      );
      const allBomVersions = await databaseTransaction.bomVersion.findMany({
        where: { bom: { companyId } },
        include: {
          bom: { include: { outputItem: true } },
          components: { include: { componentItem: true } },
        },
      });
      const selectedBomVersion = allBomVersions.find(
        (bomVersion) => bomVersion.id === bomVersionId,
      );
      if (!selectedBomVersion)
        throw new NotFoundError('BOM revision not found');
      if (!selectedBomVersion.bom.active) {
        throw new ConflictError(
          'Inactive BOMs cannot be activated',
          'BOM_INACTIVE',
        );
      }
      if (
        !selectedBomVersion.bom.outputItem.active ||
        !selectedBomVersion.bom.outputItem.trackInventory ||
        selectedBomVersion.bom.outputItem.itemType === ItemType.SERVICE
      ) {
        throw new ValidationError(
          'BOM output must be active and inventory tracked',
          'INVALID_BOM_OUTPUT',
        );
      }
      if (selectedBomVersion.components.length === 0) {
        throw new ValidationError(
          'A BOM revision requires at least one component',
          'EMPTY_BOM',
        );
      }
      if (
        selectedBomVersion.components.some(
          (component) =>
            !component.componentItem.active ||
            !component.componentItem.trackInventory ||
            component.componentItem.itemType === ItemType.SERVICE,
        )
      ) {
        throw new ValidationError(
          'BOM components must be active and inventory tracked',
          'INVALID_BOM_COMPONENT',
        );
      }

      const competingActiveBomVersion = allBomVersions.find(
        (bomVersion) =>
          bomVersion.bomId === selectedBomVersion.bomId &&
          bomVersion.status === BomVersionStatus.ACTIVE,
      );
      if (
        competingActiveBomVersion?.activatedAt &&
        competingActiveBomVersion.activatedAt >= selectedBomVersion.createdAt
      ) {
        throw new ConflictError(
          'A competing BOM revision was activated after this draft was created',
          'STALE_BOM_ACTIVATION',
        );
      }

      const activeBomVersionIdByOutputItemId = new Map(
        allBomVersions
          .filter((bomVersion) => bomVersion.status === BomVersionStatus.ACTIVE)
          .map((activeBomVersion) => [
            activeBomVersion.bom.outputItemId,
            activeBomVersion.id,
          ]),
      );
      const pinnedChildVersionIdsByComponentId = new Map(
        selectedBomVersion.components.map((component) => [
          component.id,
          activeBomVersionIdByOutputItemId.get(component.componentItemId) ??
            null,
        ]),
      );
      const bomVersionsById = new Map(
        allBomVersions.map((bomVersion) => [bomVersion.id, bomVersion]),
      );
      await assertNoBomCycle(
        selectedBomVersion,
        bomVersionsById,
        pinnedChildVersionIdsByComponentId,
      );

      // Pinning child revisions keeps future production explosions reproducible after another BOM revision is activated.
      for (const component of [...selectedBomVersion.components].sort(
        (left, right) => left.id.localeCompare(right.id),
      )) {
        await databaseTransaction.bomComponent.update({
          where: { id: component.id },
          data: {
            childBomVersionId:
              pinnedChildVersionIdsByComponentId.get(component.id) ?? null,
          },
        });
      }
      const activationTime = new Date();
      await databaseTransaction.bomVersion.updateMany({
        where: {
          bomId: selectedBomVersion.bomId,
          status: BomVersionStatus.ACTIVE,
        },
        data: { status: BomVersionStatus.RETIRED, retiredAt: activationTime },
      });
      return databaseTransaction.bomVersion.update({
        where: { id: selectedBomVersion.id },
        data: { status: BomVersionStatus.ACTIVE, activatedAt: activationTime },
        include: {
          bom: { include: { outputItem: true } },
          components: { include: { componentItem: true } },
        },
      });
    },
    transactionOptions,
  );
}

export async function retireBomRevision(
  companyId: string,
  bomVersionId: string,
  databaseClient: PrismaClient = prisma,
  transactionOptions: CompanyMutationOptions = {},
) {
  return withCompanyMutationTransaction(
    companyId,
    databaseClient,
    async (databaseTransaction) => {
      const activeBomVersion = await databaseTransaction.bomVersion.findFirst({
        where: { id: bomVersionId, bom: { companyId } },
        select: { id: true, status: true },
      });
      if (!activeBomVersion) throw new NotFoundError('BOM revision not found');
      if (activeBomVersion.status !== BomVersionStatus.ACTIVE) {
        throw new ConflictError(
          'Only an active BOM revision can be retired',
          'BOM_NOT_ACTIVE',
        );
      }
      return databaseTransaction.bomVersion.update({
        where: { id: bomVersionId },
        data: { status: BomVersionStatus.RETIRED, retiredAt: new Date() },
      });
    },
    transactionOptions,
  );
}

export type ExplodedBomItem = {
  itemId: string;
  itemCode: string;
  itemName: string;
  quantity: Prisma.Decimal;
};

export async function explodeBomRevision(
  companyId: string,
  bomVersionId: string,
  outputQuantity: Prisma.Decimal.Value,
  databaseClient: DatabaseClient = prisma,
): Promise<ExplodedBomItem[]> {
  const requestedOutputQuantity = positiveQuantity(
    outputQuantity,
    'quantity',
    'INVALID_PRODUCTION_QUANTITY',
  );
  const rootBomVersion = await databaseClient.bomVersion.findFirst({
    where: {
      id: bomVersionId,
      status: BomVersionStatus.ACTIVE,
      bom: { companyId, active: true },
    },
    include: {
      bom: { include: { outputItem: true } },
      components: { include: { componentItem: true } },
    },
  });
  if (!rootBomVersion) throw new NotFoundError('Active BOM revision not found');

  const bomVersionCache = new Map<string, LoadedBomVersion>([
    [rootBomVersion.id, rootBomVersion],
  ]);
  const componentRequirementsByItemId = new Map<string, ExplodedBomItem>();
  const collectComponentRequirements = async (
    currentBomVersion: LoadedBomVersion,
    quantityMultiplier: Prisma.Decimal,
    ancestorOutputItemIds: readonly string[],
  ) => {
    if (
      !currentBomVersion.bom.active ||
      !currentBomVersion.bom.outputItem.active ||
      !currentBomVersion.bom.outputItem.trackInventory ||
      currentBomVersion.bom.outputItem.itemType === ItemType.SERVICE
    ) {
      throw new ValidationError(
        'BOM output must be active and inventory tracked',
        'INVALID_BOM_OUTPUT',
      );
    }
    if (ancestorOutputItemIds.includes(currentBomVersion.bom.outputItemId)) {
      throw new ConflictError('BOM cycle detected', 'BOM_CYCLE');
    }
    const currentOutputItemPath = [
      ...ancestorOutputItemIds,
      currentBomVersion.bom.outputItemId,
    ];
    const sortedComponents = [...currentBomVersion.components].sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.componentItem.code.localeCompare(right.componentItem.code) ||
        left.componentItemId.localeCompare(right.componentItemId),
    );
    for (const component of sortedComponents) {
      if (
        !component.componentItem.active ||
        !component.componentItem.trackInventory ||
        component.componentItem.itemType === ItemType.SERVICE
      ) {
        throw new ValidationError(
          'BOM components must be active and inventory tracked',
          'INVALID_BOM_COMPONENT',
        );
      }
      if (currentOutputItemPath.includes(component.componentItemId)) {
        throw new ConflictError('BOM cycle detected', 'BOM_CYCLE');
      }
      const requiredComponentQuantity = quantityMultiplier.mul(
        component.quantity,
      );
      if (component.childBomVersionId) {
        let childBomVersion = bomVersionCache.get(component.childBomVersionId);
        if (!childBomVersion) {
          childBomVersion =
            (await databaseClient.bomVersion.findFirst({
              where: { id: component.childBomVersionId, bom: { companyId } },
              include: {
                bom: { include: { outputItem: true } },
                components: { include: { componentItem: true } },
              },
            })) ?? undefined;
          if (!childBomVersion) {
            throw new ValidationError(
              'Pinned child BOM revision is unavailable',
              'INVALID_CHILD_BOM_REVISION',
            );
          }
          bomVersionCache.set(childBomVersion.id, childBomVersion);
        }
        await collectComponentRequirements(
          childBomVersion,
          requiredComponentQuantity,
          currentOutputItemPath,
        );
      } else {
        const existingComponentRequirement = componentRequirementsByItemId.get(
          component.componentItemId,
        );
        componentRequirementsByItemId.set(component.componentItemId, {
          itemId: component.componentItemId,
          itemCode: component.componentItem.code,
          itemName: component.componentItem.name,
          quantity: (
            existingComponentRequirement?.quantity ?? new Prisma.Decimal(0)
          ).add(requiredComponentQuantity),
        });
      }
    }
  };
  await collectComponentRequirements(
    rootBomVersion,
    requestedOutputQuantity,
    [],
  );
  return [...componentRequirementsByItemId.values()].sort(
    (left, right) =>
      left.itemCode.localeCompare(right.itemCode) ||
      left.itemId.localeCompare(right.itemId),
  );
}
