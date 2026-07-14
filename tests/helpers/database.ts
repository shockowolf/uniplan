import { PrismaClient } from '@prisma/client';

export const testDatabaseClient = new PrismaClient();

export async function resetTestDatabase() {
  if (process.env.UNIPLAN_TEST_DATABASE_GUARD !== 'enabled') {
    throw new Error(
      'Refusing to truncate PostgreSQL outside the isolated npm test runner.',
    );
  }
  await testDatabaseClient.$executeRawUnsafe(`
    TRUNCATE TABLE
      "login_rate_limit_buckets",
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
  return testDatabaseClient.company.create({
    data: { code: companyCode, name: `${companyCode} Company` },
  });
}
