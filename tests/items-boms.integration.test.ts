import { ItemType } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  activateBomRevision,
  createBom,
  explodeBomRevision,
  replaceDraftBomComponents,
} from '@/lib/domain/boms';
import { createItem } from '@/lib/domain/items';
import {
  createTestCompany,
  resetTestDatabase,
  testDatabaseClient,
} from './helpers/database';

describe('Item and versioned BOM domain', () => {
  beforeEach(resetTestDatabase);
  afterAll(() => testDatabaseClient.$disconnect());

  async function createTestItem(
    companyId: string,
    itemCode: string,
    itemType: ItemType = ItemType.COMPONENT,
  ) {
    return createItem(
      companyId,
      {
        code: itemCode,
        name: itemCode,
        itemType,
        standardPrice: '1.25',
        costPrice: '0.50',
      },
      testDatabaseClient,
    );
  }

  async function createAndActivateTestBom(
    companyId: string,
    bomCode: string,
    outputItemId: string,
    componentInputs: { itemId: string; quantity: string }[],
  ) {
    const bomWithDraftRevision = await createBom(
      companyId,
      { code: `BOM-${bomCode}`, name: `${bomCode} BOM`, outputItemId },
      testDatabaseClient,
    );
    const draftBomRevision = bomWithDraftRevision.versions[0];
    await replaceDraftBomComponents(
      companyId,
      draftBomRevision.id,
      componentInputs,
      testDatabaseClient,
    );
    return activateBomRevision(
      companyId,
      draftBomRevision.id,
      testDatabaseClient,
    );
  }

  it('explodes three levels deterministically and aggregates duplicate leaves with Decimal arithmetic', async () => {
    const company = await createTestCompany('BOM-EXPLODE');
    const rawMaterialA = await createTestItem(
      company.id,
      'RAW-A',
      ItemType.RAW_MATERIAL,
    );
    const rawMaterialB = await createTestItem(
      company.id,
      'RAW-B',
      ItemType.RAW_MATERIAL,
    );
    const levelCAssembly = await createTestItem(company.id, 'LEVEL-C');
    const levelBAssembly = await createTestItem(company.id, 'LEVEL-B');
    const levelAFinishedGood = await createTestItem(
      company.id,
      'LEVEL-A',
      ItemType.FINISHED_GOOD,
    );
    await createAndActivateTestBom(company.id, 'C', levelCAssembly.id, [
      { itemId: rawMaterialA.id, quantity: '2' },
    ]);
    await createAndActivateTestBom(company.id, 'B', levelBAssembly.id, [
      { itemId: levelCAssembly.id, quantity: '3' },
      { itemId: rawMaterialB.id, quantity: '1' },
    ]);
    const rootBomRevision = await createAndActivateTestBom(
      company.id,
      'A',
      levelAFinishedGood.id,
      [
        { itemId: levelBAssembly.id, quantity: '2' },
        { itemId: rawMaterialA.id, quantity: '4' },
        { itemId: rawMaterialB.id, quantity: '5' },
      ],
    );

    const componentRequirements = await explodeBomRevision(
      company.id,
      rootBomRevision.id,
      '1.5',
      testDatabaseClient,
    );
    expect(
      componentRequirements.map((componentRequirement) => [
        componentRequirement.itemCode,
        componentRequirement.quantity.toFixed(6),
      ]),
    ).toEqual([
      ['RAW-A', '24.000000'],
      ['RAW-B', '10.500000'],
    ]);
  });

  it('rejects self cycles and indirect cycles', async () => {
    const company = await createTestCompany('BOM-CYCLE');
    const selfReferencingItem = await createTestItem(
      company.id,
      'SELF',
      ItemType.FINISHED_GOOD,
    );
    const selfReferencingBom = await createBom(
      company.id,
      { code: 'BOM-SELF', name: 'Self', outputItemId: selfReferencingItem.id },
      testDatabaseClient,
    );
    await replaceDraftBomComponents(
      company.id,
      selfReferencingBom.versions[0].id,
      [{ itemId: selfReferencingItem.id, quantity: '1' }],
      testDatabaseClient,
    );
    await expect(
      activateBomRevision(
        company.id,
        selfReferencingBom.versions[0].id,
        testDatabaseClient,
      ),
    ).rejects.toMatchObject({ code: 'BOM_CYCLE' });

    const finishedGoodX = await createTestItem(
      company.id,
      'X',
      ItemType.FINISHED_GOOD,
    );
    const componentY = await createTestItem(
      company.id,
      'Y',
      ItemType.COMPONENT,
    );
    await createAndActivateTestBom(company.id, 'Y', componentY.id, [
      { itemId: finishedGoodX.id, quantity: '1' },
    ]);
    const finishedGoodXBom = await createBom(
      company.id,
      { code: 'BOM-X', name: 'X', outputItemId: finishedGoodX.id },
      testDatabaseClient,
    );
    await replaceDraftBomComponents(
      company.id,
      finishedGoodXBom.versions[0].id,
      [{ itemId: componentY.id, quantity: '1' }],
      testDatabaseClient,
    );
    await expect(
      activateBomRevision(
        company.id,
        finishedGoodXBom.versions[0].id,
        testDatabaseClient,
      ),
    ).rejects.toMatchObject({ code: 'BOM_CYCLE' });
  });

  it('enforces service inventory validation and company boundaries', async () => {
    const company = await createTestCompany('BOM-A');
    const otherCompany = await createTestCompany('BOM-B');
    await expect(
      createItem(
        company.id,
        {
          code: 'BAD-SERVICE',
          name: 'Bad Service',
          itemType: ItemType.SERVICE,
          trackInventory: true,
        },
        testDatabaseClient,
      ),
    ).rejects.toMatchObject({ code: 'SERVICE_INVENTORY_NOT_ALLOWED' });
    const outputItem = await createTestItem(
      company.id,
      'OUTPUT',
      ItemType.FINISHED_GOOD,
    );
    const serviceItem = await createItem(
      company.id,
      {
        code: 'SERVICE',
        name: 'Service',
        itemType: ItemType.SERVICE,
        trackInventory: false,
      },
      testDatabaseClient,
    );
    const foreignCompanyComponent = await createTestItem(
      otherCompany.id,
      'FOREIGN',
      ItemType.RAW_MATERIAL,
    );
    const outputBomWithDraftRevision = await createBom(
      company.id,
      { code: 'BOM-OUTPUT', name: 'Output', outputItemId: outputItem.id },
      testDatabaseClient,
    );
    await expect(
      replaceDraftBomComponents(
        company.id,
        outputBomWithDraftRevision.versions[0].id,
        [{ itemId: serviceItem.id, quantity: '1' }],
        testDatabaseClient,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_BOM_COMPONENT' });
    await expect(
      replaceDraftBomComponents(
        company.id,
        outputBomWithDraftRevision.versions[0].id,
        [{ itemId: foreignCompanyComponent.id, quantity: '1' }],
        testDatabaseClient,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_BOM_COMPONENT' });
    await expect(
      createBom(
        company.id,
        { code: 'BOM-SERVICE', name: 'Service', outputItemId: serviceItem.id },
        testDatabaseClient,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_BOM_OUTPUT' });
  });

  it('prevents activated revision mutation in both the service and database', async () => {
    const company = await createTestCompany('BOM-IMMUTABLE');
    const rawMaterial = await createTestItem(
      company.id,
      'RAW',
      ItemType.RAW_MATERIAL,
    );
    const outputItem = await createTestItem(
      company.id,
      'OUTPUT',
      ItemType.FINISHED_GOOD,
    );
    const activeBomRevision = await createAndActivateTestBom(
      company.id,
      'OUTPUT',
      outputItem.id,
      [{ itemId: rawMaterial.id, quantity: '2' }],
    );
    await expect(
      replaceDraftBomComponents(
        company.id,
        activeBomRevision.id,
        [{ itemId: rawMaterial.id, quantity: '3' }],
        testDatabaseClient,
      ),
    ).rejects.toMatchObject({ code: 'BOM_REVISION_IMMUTABLE' });
    const immutableBomComponent =
      await testDatabaseClient.bomComponent.findFirstOrThrow({
        where: { bomVersionId: activeBomRevision.id },
      });
    await expect(
      testDatabaseClient.bomComponent.update({
        where: { id: immutableBomComponent.id },
        data: { quantity: '3' },
      }),
    ).rejects.toThrow(/draft revisions/i);
  });
});
