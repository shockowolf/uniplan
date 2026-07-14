import { PrismaClient } from '@prisma/client';

export const testDatabaseClient = new PrismaClient();

const TEST_SCHEMA = 'uniplan_test_u10';
const TEST_GUARD = 'uniplan_test_u10_only';

const auditActorByCompanyId = new Map<
  string,
  { companyId: string; actorUserId: string }
>();

export async function assertDisposableTestSchema() {
  if (
    process.env.UNIPLAN_TEST_DATABASE_GUARD !== TEST_GUARD ||
    process.env.UNIPLAN_TEST_DATABASE_SCHEMA !== TEST_SCHEMA
  ) {
    throw new Error('Refusing destructive SQL without the U9 test guard.');
  }
  const [databaseContext] = await testDatabaseClient.$queryRaw<
    { schemaName: string }[]
  >`SELECT current_schema() AS "schemaName"`;
  if (databaseContext?.schemaName !== TEST_SCHEMA) {
    throw new Error(
      `Refusing destructive SQL in schema ${databaseContext?.schemaName ?? 'unknown'}.`,
    );
  }
}

export async function resetTestDatabase() {
  await assertDisposableTestSchema();
  await testDatabaseClient.$executeRawUnsafe(`
    TRUNCATE TABLE
      "login_rate_limit_buckets",
      "audit_events",
      "auth_sessions",
      "inventory_entries", "inventory_transactions", "inventory_balances",
      "bom_components", "bom_versions", "boms", "warehouses", "items", "item_categories",
      "payments", "invoice_items", "invoices", "sales_order_items", "sales_orders",
      "service_cases", "consultations", "employees", "customers",
      "role_permissions", "menu_items", "user_roles", "roles", "users", "domains", "companies"
    CASCADE
  `);
}

export async function createTestCompany(companyCode: string) {
  const company = await testDatabaseClient.company.create({
    data: { code: companyCode, name: `${companyCode} Company` },
  });
  const auditUser = await testDatabaseClient.user.create({
    data: {
      companyId: company.id,
      email: `audit-${company.id}@test.invalid`,
      passwordHash: 'test-only',
      name: 'Test Audit Actor',
    },
  });
  const auditActor = {
    companyId: company.id,
    actorUserId: auditUser.id,
  } as const;
  auditActorByCompanyId.set(company.id, auditActor);
  return { ...company, auditActor };
}

export function testAuditActor(companyId: string) {
  const actor = auditActorByCompanyId.get(companyId);
  if (!actor) throw new Error(`No test audit actor for company ${companyId}.`);
  return actor;
}
