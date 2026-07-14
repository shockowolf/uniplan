import { readFileSync } from 'node:fs';

type CoverageEntry = {
  file: string;
  anchor: string;
  actions: string[];
};

const coverage: CoverageEntry[] = [
  { file: 'lib/domain/items.ts', anchor: 'createItem', actions: ['item.created'] },
  { file: 'lib/domain/items.ts', anchor: 'updateItem', actions: ['item.updated'] },
  { file: 'lib/domain/items.ts', anchor: 'deactivateItem', actions: ['item.deactivated'] },
  { file: 'lib/domain/items.ts', anchor: 'activateItem', actions: ['item.activated'] },
  { file: 'lib/domain/items.ts', anchor: 'createItemCategory', actions: ['item_category.created'] },
  { file: 'lib/domain/items.ts', anchor: 'updateItemCategory', actions: ['item_category.updated'] },
  { file: 'lib/domain/items.ts', anchor: 'deactivateItemCategory', actions: ['item_category.deactivated'] },
  { file: 'lib/domain/items.ts', anchor: 'activateItemCategory', actions: ['item_category.activated'] },
  { file: 'lib/domain/inventory.ts', anchor: 'createWarehouse', actions: ['warehouse.created'] },
  { file: 'lib/domain/inventory.ts', anchor: 'updateWarehouse', actions: ['warehouse.updated'] },
  { file: 'lib/domain/inventory.ts', anchor: 'deactivateWarehouse', actions: ['warehouse.deactivated'] },
  { file: 'lib/domain/inventory.ts', anchor: 'activateWarehouse', actions: ['warehouse.activated'] },
  { file: 'lib/domain/inventory.ts', anchor: 'updateSafetyQuantity', actions: ['inventory.safety_quantity_updated'] },
  {
    file: 'lib/domain/inventory.ts',
    anchor: 'executeInventoryPostingTransaction',
    actions: [
      'inventory.transaction_posted',
      'inventory.transaction_reversed',
      'inventory.production_posted',
    ],
  },
  { file: 'lib/domain/boms.ts', anchor: 'createBom', actions: ['bom.created'] },
  { file: 'lib/domain/boms.ts', anchor: 'updateBom', actions: ['bom.updated'] },
  { file: 'lib/domain/boms.ts', anchor: 'deactivateBom', actions: ['bom.deactivated'] },
  { file: 'lib/domain/boms.ts', anchor: 'activateBom', actions: ['bom.activated'] },
  { file: 'lib/domain/boms.ts', anchor: 'createDraftBomRevision', actions: ['bom_revision.created'] },
  { file: 'lib/domain/boms.ts', anchor: 'replaceDraftBomComponents', actions: ['bom_revision.components_replaced'] },
  { file: 'lib/domain/boms.ts', anchor: 'activateBomRevision', actions: ['bom_revision.activated'] },
  { file: 'lib/domain/boms.ts', anchor: 'retireBomRevision', actions: ['bom_revision.retired'] },
  { file: 'lib/domain/navigation-settings.ts', anchor: 'createNavigationMenuItem', actions: ['navigation.created'] },
  { file: 'lib/domain/navigation-settings.ts', anchor: 'updateNavigationMenuItem', actions: ['navigation.updated', 'navigation.reparented'] },
  { file: 'lib/domain/navigation-settings.ts', anchor: 'deactivateNavigationMenuItem', actions: ['navigation.deactivated'] },
  { file: 'lib/domain/navigation-settings.ts', anchor: 'activateNavigationMenuItem', actions: ['navigation.activated'] },
  { file: 'lib/auth/login.ts', anchor: 'loginWithPassword', actions: ['auth.login'] },
  { file: 'app/api/auth/login/route.ts', anchor: 'POST', actions: ['auth.login.rate_limited', 'auth.login'] },
  { file: 'lib/auth/session.ts', anchor: 'revokeSessionWithAudit', actions: ['auth.logout'] },
  { file: 'lib/auth/login.ts', anchor: 'setInvitedUserPassword', actions: ['auth.password_reset'] },
  { file: 'lib/auth/cleanup.ts', anchor: 'cleanupAuthenticationState', actions: ['auth.cleanup'] },
];

const failures: string[] = [];
for (const entry of coverage) {
  const source = readFileSync(entry.file, 'utf8');
  const anchorPattern = new RegExp(
    `(?:export\\s+)?async\\s+function\\s+${entry.anchor}\\s*\\(`,
  );
  const anchorMatch = anchorPattern.exec(source);
  if (!anchorMatch) {
    failures.push(`${entry.file}:${entry.anchor}:missing-entry-point`);
    continue;
  }
  const nextFunctionOffset = source
    .slice(anchorMatch.index + anchorMatch[0].length)
    .search(/\n(?:export\s+)?async\s+function\s+[A-Za-z0-9_]+\s*\(/);
  const boundary =
    nextFunctionOffset < 0
      ? source.length
      : anchorMatch.index + anchorMatch[0].length + nextFunctionOffset;
  const functionSource = source.slice(anchorMatch.index, boundary);
  if (
    !functionSource.includes('recordMutationAuditEvent') &&
    !functionSource.includes('recordAuditEvent') &&
    !functionSource.includes('recordStandaloneAuditEvent')
  ) {
    failures.push(`${entry.file}:${entry.anchor}:missing-audit-boundary`);
  }
  for (const action of entry.actions) {
    if (!functionSource.includes(`'${action}'`)) {
      failures.push(`${entry.file}:${entry.anchor}:missing-${action}`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Audit coverage failed:\n${failures.join('\n')}`);
}

console.log(
  JSON.stringify({
    status: 'complete',
    entryPointCount: coverage.length,
    actionCount: coverage.reduce((sum, entry) => sum + entry.actions.length, 0),
  }),
);
