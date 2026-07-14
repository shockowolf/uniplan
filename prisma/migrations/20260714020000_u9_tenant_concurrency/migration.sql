BEGIN;

-- U9 never guesses ownership. Abort before adding/backfilling tenant columns if
-- any existing multi-parent relationship crosses a company boundary.
DO $$
DECLARE
  malformed_relation text;
BEGIN
  SELECT relation_name INTO malformed_relation
  FROM (
    SELECT 'users.domain' AS relation_name WHERE EXISTS (
      SELECT 1 FROM "users" c JOIN "domains" p ON p."id" = c."domainId"
      WHERE c."companyId" <> p."companyId")
    UNION ALL SELECT 'roles.domain' WHERE EXISTS (
      SELECT 1 FROM "roles" c JOIN "domains" p ON p."id" = c."domainId"
      WHERE c."companyId" <> p."companyId")
    UNION ALL SELECT 'user_roles.user-role' WHERE EXISTS (
      SELECT 1 FROM "user_roles" c JOIN "users" u ON u."id" = c."userId"
      JOIN "roles" r ON r."id" = c."roleId" WHERE u."companyId" <> r."companyId")
    UNION ALL SELECT 'menu_items.domain' WHERE EXISTS (
      SELECT 1 FROM "menu_items" c JOIN "domains" p ON p."id" = c."domainId"
      WHERE c."companyId" <> p."companyId")
    UNION ALL SELECT 'menu_items.parent' WHERE EXISTS (
      SELECT 1 FROM "menu_items" c JOIN "menu_items" p ON p."id" = c."parentId"
      WHERE c."companyId" <> p."companyId")
    UNION ALL SELECT 'role_permissions.role-menu' WHERE EXISTS (
      SELECT 1 FROM "role_permissions" c JOIN "roles" r ON r."id" = c."roleId"
      JOIN "menu_items" m ON m."id" = c."menuItemId" WHERE r."companyId" <> m."companyId")
    UNION ALL SELECT 'item_categories.parent' WHERE EXISTS (
      SELECT 1 FROM "item_categories" c JOIN "item_categories" p ON p."id" = c."parentId"
      WHERE c."companyId" <> p."companyId")
    UNION ALL SELECT 'items.category' WHERE EXISTS (
      SELECT 1 FROM "items" c JOIN "item_categories" p ON p."id" = c."categoryId"
      WHERE c."companyId" <> p."companyId")
    UNION ALL SELECT 'boms.output-item' WHERE EXISTS (
      SELECT 1 FROM "boms" c JOIN "items" p ON p."id" = c."outputItemId"
      WHERE c."companyId" <> p."companyId")
    UNION ALL SELECT 'bom_components.component-item' WHERE EXISTS (
      SELECT 1 FROM "bom_components" c JOIN "bom_versions" v ON v."id" = c."bomVersionId"
      JOIN "boms" b ON b."id" = v."bomId" JOIN "items" i ON i."id" = c."componentItemId"
      WHERE b."companyId" <> i."companyId")
    UNION ALL SELECT 'bom_components.child-version' WHERE EXISTS (
      SELECT 1 FROM "bom_components" c JOIN "bom_versions" v ON v."id" = c."bomVersionId"
      JOIN "boms" b ON b."id" = v."bomId" JOIN "bom_versions" cv ON cv."id" = c."childBomVersionId"
      JOIN "boms" cb ON cb."id" = cv."bomId" WHERE b."companyId" <> cb."companyId")
    UNION ALL SELECT 'inventory_balances.item' WHERE EXISTS (
      SELECT 1 FROM "inventory_balances" c JOIN "items" p ON p."id" = c."itemId"
      WHERE c."companyId" <> p."companyId")
    UNION ALL SELECT 'inventory_balances.warehouse' WHERE EXISTS (
      SELECT 1 FROM "inventory_balances" c JOIN "warehouses" p ON p."id" = c."warehouseId"
      WHERE c."companyId" <> p."companyId")
    UNION ALL SELECT 'inventory_transactions.creator' WHERE EXISTS (
      SELECT 1 FROM "inventory_transactions" c JOIN "users" p ON p."id" = c."createdById"
      WHERE c."companyId" <> p."companyId")
    UNION ALL SELECT 'inventory_transactions.bom-version' WHERE EXISTS (
      SELECT 1 FROM "inventory_transactions" c JOIN "bom_versions" v ON v."id" = c."bomVersionId"
      JOIN "boms" b ON b."id" = v."bomId" WHERE c."companyId" <> b."companyId")
    UNION ALL SELECT 'inventory_transactions.reversal' WHERE EXISTS (
      SELECT 1 FROM "inventory_transactions" c JOIN "inventory_transactions" p ON p."id" = c."reversalOfId"
      WHERE c."companyId" <> p."companyId")
    UNION ALL SELECT 'inventory_entries.transaction' WHERE EXISTS (
      SELECT 1 FROM "inventory_entries" c JOIN "inventory_transactions" p ON p."id" = c."transactionId"
      WHERE c."companyId" <> p."companyId")
    UNION ALL SELECT 'inventory_entries.item' WHERE EXISTS (
      SELECT 1 FROM "inventory_entries" c JOIN "items" p ON p."id" = c."itemId"
      WHERE c."companyId" <> p."companyId")
    UNION ALL SELECT 'inventory_entries.warehouse' WHERE EXISTS (
      SELECT 1 FROM "inventory_entries" c JOIN "warehouses" p ON p."id" = c."warehouseId"
      WHERE c."companyId" <> p."companyId")
    UNION ALL SELECT 'sales_orders.customer' WHERE EXISTS (
      SELECT 1 FROM "sales_orders" c JOIN "customers" p ON p."id" = c."customerId"
      WHERE c."companyId" <> p."companyId")
    UNION ALL SELECT 'sales_orders.employee' WHERE EXISTS (
      SELECT 1 FROM "sales_orders" c JOIN "employees" p ON p."id" = c."salesEmployeeId"
      WHERE c."companyId" <> p."companyId")
    UNION ALL SELECT 'sales_order_items.item' WHERE EXISTS (
      SELECT 1 FROM "sales_order_items" c JOIN "sales_orders" o ON o."id" = c."salesOrderId"
      JOIN "items" i ON i."id" = c."itemId" WHERE o."companyId" <> i."companyId")
    UNION ALL SELECT 'invoices.customer' WHERE EXISTS (
      SELECT 1 FROM "invoices" c JOIN "customers" p ON p."id" = c."customerId"
      WHERE c."companyId" <> p."companyId")
    UNION ALL SELECT 'invoices.sales-order' WHERE EXISTS (
      SELECT 1 FROM "invoices" c JOIN "sales_orders" p ON p."id" = c."salesOrderId"
      WHERE c."companyId" <> p."companyId")
    UNION ALL SELECT 'invoice_items.item' WHERE EXISTS (
      SELECT 1 FROM "invoice_items" c JOIN "invoices" i ON i."id" = c."invoiceId"
      JOIN "items" p ON p."id" = c."itemId" WHERE i."companyId" <> p."companyId")
    UNION ALL SELECT 'consultations.customer' WHERE EXISTS (
      SELECT 1 FROM "consultations" c JOIN "customers" p ON p."id" = c."customerId"
      WHERE c."companyId" <> p."companyId")
    UNION ALL SELECT 'service_cases.customer' WHERE EXISTS (
      SELECT 1 FROM "service_cases" c JOIN "customers" p ON p."id" = c."customerId"
      WHERE c."companyId" <> p."companyId")
    UNION ALL SELECT 'service_cases.item' WHERE EXISTS (
      SELECT 1 FROM "service_cases" c JOIN "items" p ON p."id" = c."itemId"
      WHERE c."companyId" <> p."companyId")
  ) failures
  LIMIT 1;

  IF malformed_relation IS NOT NULL THEN
    RAISE EXCEPTION 'U9 tenant ownership validation failed: %', malformed_relation
      USING ERRCODE = '23514';
  END IF;
END $$;

ALTER TABLE "auth_sessions" ADD COLUMN "companyId" TEXT;
ALTER TABLE "user_roles" ADD COLUMN "companyId" TEXT;
ALTER TABLE "role_permissions" ADD COLUMN "companyId" TEXT;
ALTER TABLE "bom_versions" ADD COLUMN "companyId" TEXT;
ALTER TABLE "bom_components" ADD COLUMN "companyId" TEXT;
ALTER TABLE "sales_order_items" ADD COLUMN "companyId" TEXT;
ALTER TABLE "invoice_items" ADD COLUMN "companyId" TEXT;
ALTER TABLE "payments" ADD COLUMN "companyId" TEXT;

UPDATE "auth_sessions" c SET "companyId" = p."companyId" FROM "users" p WHERE p."id" = c."userId";
UPDATE "user_roles" c SET "companyId" = p."companyId" FROM "users" p WHERE p."id" = c."userId";
UPDATE "role_permissions" c SET "companyId" = p."companyId" FROM "roles" p WHERE p."id" = c."roleId";
UPDATE "bom_versions" c SET "companyId" = p."companyId" FROM "boms" p WHERE p."id" = c."bomId";
UPDATE "bom_components" c SET "companyId" = p."companyId" FROM "bom_versions" p WHERE p."id" = c."bomVersionId";
UPDATE "sales_order_items" c SET "companyId" = p."companyId" FROM "sales_orders" p WHERE p."id" = c."salesOrderId";
UPDATE "invoice_items" c SET "companyId" = p."companyId" FROM "invoices" p WHERE p."id" = c."invoiceId";
UPDATE "payments" c SET "companyId" = p."companyId" FROM "invoices" p WHERE p."id" = c."invoiceId";

ALTER TABLE "auth_sessions" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "user_roles" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "role_permissions" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "bom_versions" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "bom_components" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "sales_order_items" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "invoice_items" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "payments" ALTER COLUMN "companyId" SET NOT NULL;

ALTER TABLE "auth_sessions" DROP CONSTRAINT "auth_sessions_userId_fkey";
ALTER TABLE "users" DROP CONSTRAINT "users_domainId_fkey";
ALTER TABLE "roles" DROP CONSTRAINT "roles_domainId_fkey";
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_userId_fkey", DROP CONSTRAINT "user_roles_roleId_fkey";
ALTER TABLE "menu_items" DROP CONSTRAINT "menu_items_domainId_fkey", DROP CONSTRAINT "menu_items_parentId_fkey";
ALTER TABLE "role_permissions" DROP CONSTRAINT "role_permissions_roleId_fkey", DROP CONSTRAINT "role_permissions_menuItemId_fkey";
ALTER TABLE "item_categories" DROP CONSTRAINT "item_categories_parentId_fkey";
ALTER TABLE "items" DROP CONSTRAINT "items_categoryId_fkey";
ALTER TABLE "boms" DROP CONSTRAINT "boms_outputItemId_fkey";
ALTER TABLE "bom_versions" DROP CONSTRAINT "bom_versions_bomId_fkey";
ALTER TABLE "bom_components" DROP CONSTRAINT "bom_components_bomVersionId_fkey", DROP CONSTRAINT "bom_components_componentItemId_fkey", DROP CONSTRAINT "bom_components_childBomVersionId_fkey";
ALTER TABLE "inventory_balances" DROP CONSTRAINT "inventory_balances_itemId_fkey", DROP CONSTRAINT "inventory_balances_warehouseId_fkey";
ALTER TABLE "inventory_transactions" DROP CONSTRAINT "inventory_transactions_createdById_fkey", DROP CONSTRAINT "inventory_transactions_bomVersionId_fkey", DROP CONSTRAINT "inventory_transactions_reversalOfId_fkey";
ALTER TABLE "inventory_entries" DROP CONSTRAINT "inventory_entries_transactionId_fkey", DROP CONSTRAINT "inventory_entries_itemId_fkey", DROP CONSTRAINT "inventory_entries_warehouseId_fkey";
ALTER TABLE "sales_orders" DROP CONSTRAINT "sales_orders_customerId_fkey", DROP CONSTRAINT "sales_orders_salesEmployeeId_fkey";
ALTER TABLE "sales_order_items" DROP CONSTRAINT "sales_order_items_salesOrderId_fkey", DROP CONSTRAINT "sales_order_items_itemId_fkey";
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_customerId_fkey", DROP CONSTRAINT "invoices_salesOrderId_fkey";
ALTER TABLE "invoice_items" DROP CONSTRAINT "invoice_items_invoiceId_fkey", DROP CONSTRAINT "invoice_items_itemId_fkey";
ALTER TABLE "payments" DROP CONSTRAINT "payments_invoiceId_fkey";
ALTER TABLE "consultations" DROP CONSTRAINT "consultations_customerId_fkey";
ALTER TABLE "service_cases" DROP CONSTRAINT "service_cases_customerId_fkey", DROP CONSTRAINT "service_cases_itemId_fkey";

CREATE UNIQUE INDEX "users_companyId_id_key" ON "users"("companyId", "id");
CREATE UNIQUE INDEX "auth_sessions_companyId_id_key" ON "auth_sessions"("companyId", "id");
CREATE UNIQUE INDEX "domains_companyId_id_key" ON "domains"("companyId", "id");
CREATE UNIQUE INDEX "roles_companyId_id_key" ON "roles"("companyId", "id");
CREATE UNIQUE INDEX "user_roles_companyId_id_key" ON "user_roles"("companyId", "id");
CREATE UNIQUE INDEX "menu_items_companyId_id_key" ON "menu_items"("companyId", "id");
CREATE UNIQUE INDEX "role_permissions_companyId_id_key" ON "role_permissions"("companyId", "id");
CREATE UNIQUE INDEX "customers_companyId_id_key" ON "customers"("companyId", "id");
CREATE UNIQUE INDEX "employees_companyId_id_key" ON "employees"("companyId", "id");
CREATE UNIQUE INDEX "item_categories_companyId_id_key" ON "item_categories"("companyId", "id");
CREATE UNIQUE INDEX "items_companyId_id_key" ON "items"("companyId", "id");
CREATE UNIQUE INDEX "boms_companyId_id_key" ON "boms"("companyId", "id");
CREATE UNIQUE INDEX "boms_companyId_outputItemId_key" ON "boms"("companyId", "outputItemId");
CREATE UNIQUE INDEX "bom_versions_companyId_id_key" ON "bom_versions"("companyId", "id");
CREATE UNIQUE INDEX "bom_components_companyId_id_key" ON "bom_components"("companyId", "id");
CREATE UNIQUE INDEX "warehouses_companyId_id_key" ON "warehouses"("companyId", "id");
CREATE UNIQUE INDEX "inventory_balances_companyId_id_key" ON "inventory_balances"("companyId", "id");
CREATE UNIQUE INDEX "inventory_transactions_companyId_id_key" ON "inventory_transactions"("companyId", "id");
CREATE UNIQUE INDEX "inventory_transactions_companyId_reversalOfId_key" ON "inventory_transactions"("companyId", "reversalOfId");
CREATE UNIQUE INDEX "inventory_entries_companyId_id_key" ON "inventory_entries"("companyId", "id");
CREATE UNIQUE INDEX "sales_orders_companyId_id_key" ON "sales_orders"("companyId", "id");
CREATE UNIQUE INDEX "sales_order_items_companyId_id_key" ON "sales_order_items"("companyId", "id");
CREATE UNIQUE INDEX "invoices_companyId_id_key" ON "invoices"("companyId", "id");
CREATE UNIQUE INDEX "invoice_items_companyId_id_key" ON "invoice_items"("companyId", "id");
CREATE UNIQUE INDEX "payments_companyId_id_key" ON "payments"("companyId", "id");
CREATE UNIQUE INDEX "consultations_companyId_id_key" ON "consultations"("companyId", "id");
CREATE UNIQUE INDEX "service_cases_companyId_id_key" ON "service_cases"("companyId", "id");

ALTER TABLE "users" ADD CONSTRAINT "users_companyId_domainId_fkey" FOREIGN KEY ("companyId", "domainId") REFERENCES "domains"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_companyId_userId_fkey" FOREIGN KEY ("companyId", "userId") REFERENCES "users"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "roles" ADD CONSTRAINT "roles_companyId_domainId_fkey" FOREIGN KEY ("companyId", "domainId") REFERENCES "domains"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_companyId_userId_fkey" FOREIGN KEY ("companyId", "userId") REFERENCES "users"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_companyId_roleId_fkey" FOREIGN KEY ("companyId", "roleId") REFERENCES "roles"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_companyId_domainId_fkey" FOREIGN KEY ("companyId", "domainId") REFERENCES "domains"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_companyId_parentId_fkey" FOREIGN KEY ("companyId", "parentId") REFERENCES "menu_items"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_companyId_roleId_fkey" FOREIGN KEY ("companyId", "roleId") REFERENCES "roles"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_companyId_menuItemId_fkey" FOREIGN KEY ("companyId", "menuItemId") REFERENCES "menu_items"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_companyId_parentId_fkey" FOREIGN KEY ("companyId", "parentId") REFERENCES "item_categories"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "items" ADD CONSTRAINT "items_companyId_categoryId_fkey" FOREIGN KEY ("companyId", "categoryId") REFERENCES "item_categories"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "boms" ADD CONSTRAINT "boms_companyId_outputItemId_fkey" FOREIGN KEY ("companyId", "outputItemId") REFERENCES "items"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bom_versions" ADD CONSTRAINT "bom_versions_companyId_bomId_fkey" FOREIGN KEY ("companyId", "bomId") REFERENCES "boms"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bom_components" ADD CONSTRAINT "bom_components_companyId_bomVersionId_fkey" FOREIGN KEY ("companyId", "bomVersionId") REFERENCES "bom_versions"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bom_components" ADD CONSTRAINT "bom_components_companyId_componentItemId_fkey" FOREIGN KEY ("companyId", "componentItemId") REFERENCES "items"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bom_components" ADD CONSTRAINT "bom_components_companyId_childBomVersionId_fkey" FOREIGN KEY ("companyId", "childBomVersionId") REFERENCES "bom_versions"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "items"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_companyId_warehouseId_fkey" FOREIGN KEY ("companyId", "warehouseId") REFERENCES "warehouses"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_companyId_createdById_fkey" FOREIGN KEY ("companyId", "createdById") REFERENCES "users"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_companyId_bomVersionId_fkey" FOREIGN KEY ("companyId", "bomVersionId") REFERENCES "bom_versions"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_companyId_reversalOfId_fkey" FOREIGN KEY ("companyId", "reversalOfId") REFERENCES "inventory_transactions"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "inventory_entries" ADD CONSTRAINT "inventory_entries_companyId_transactionId_fkey" FOREIGN KEY ("companyId", "transactionId") REFERENCES "inventory_transactions"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_entries" ADD CONSTRAINT "inventory_entries_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "items"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_entries" ADD CONSTRAINT "inventory_entries_companyId_warehouseId_fkey" FOREIGN KEY ("companyId", "warehouseId") REFERENCES "warehouses"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_companyId_customerId_fkey" FOREIGN KEY ("companyId", "customerId") REFERENCES "customers"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_companyId_salesEmployeeId_fkey" FOREIGN KEY ("companyId", "salesEmployeeId") REFERENCES "employees"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_companyId_salesOrderId_fkey" FOREIGN KEY ("companyId", "salesOrderId") REFERENCES "sales_orders"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "items"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_companyId_customerId_fkey" FOREIGN KEY ("companyId", "customerId") REFERENCES "customers"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_companyId_salesOrderId_fkey" FOREIGN KEY ("companyId", "salesOrderId") REFERENCES "sales_orders"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_companyId_invoiceId_fkey" FOREIGN KEY ("companyId", "invoiceId") REFERENCES "invoices"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "items"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_companyId_invoiceId_fkey" FOREIGN KEY ("companyId", "invoiceId") REFERENCES "invoices"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_companyId_customerId_fkey" FOREIGN KEY ("companyId", "customerId") REFERENCES "customers"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "service_cases" ADD CONSTRAINT "service_cases_companyId_customerId_fkey" FOREIGN KEY ("companyId", "customerId") REFERENCES "customers"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "service_cases" ADD CONSTRAINT "service_cases_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "items"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

COMMIT;
