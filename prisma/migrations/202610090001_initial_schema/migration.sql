CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "MerchantStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');
CREATE TYPE "PaymentStatus" AS ENUM ('COMPLETED', 'REVERSED');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CARD', 'OTHER');
CREATE TYPE "ImportStatus" AS ENUM ('VALIDATING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

CREATE TABLE "users" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL, "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "lastLoginAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "roles" (
  "id" TEXT NOT NULL, "key" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "permissions" (
  "id" TEXT NOT NULL, "key" TEXT NOT NULL, "description" TEXT NOT NULL,
  CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "user_roles" (
  "userId" TEXT NOT NULL, "roleId" TEXT NOT NULL,
  CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId", "roleId")
);
CREATE TABLE "role_permissions" (
  "roleId" TEXT NOT NULL, "permissionId" TEXT NOT NULL,
  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId", "permissionId")
);
CREATE TABLE "merchants" (
  "id" TEXT NOT NULL, "merchantCode" TEXT NOT NULL, "name" TEXT NOT NULL, "phone" TEXT NOT NULL,
  "alternatePhone" TEXT, "address" TEXT, "city" TEXT, "region" TEXT,
  "status" "MerchantStatus" NOT NULL DEFAULT 'ACTIVE', "notes" TEXT,
  "createdById" TEXT, "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "products" (
  "id" TEXT NOT NULL, "sku" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT,
  "unit" TEXT NOT NULL DEFAULT 'قطعة', "defaultPrice" DECIMAL(12,2) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "invoices" (
  "id" TEXT NOT NULL, "invoiceNumber" TEXT NOT NULL, "merchantId" TEXT NOT NULL,
  "transactionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "dueDate" TIMESTAMP(3),
  "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT', "notes" TEXT,
  "subtotal" DECIMAL(12,2) NOT NULL, "totalAmount" DECIMAL(12,2) NOT NULL,
  "createdById" TEXT, "updatedById" TEXT, "cancelledById" TEXT, "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoices_amount_nonnegative" CHECK ("subtotal" >= 0 AND "totalAmount" >= 0)
);
CREATE TABLE "invoice_items" (
  "id" TEXT NOT NULL, "invoiceId" TEXT NOT NULL, "productId" TEXT, "description" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL, "unitPrice" DECIMAL(12,2) NOT NULL,
  "subtotal" DECIMAL(12,2) NOT NULL, CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoice_items_amount_positive" CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "subtotal" >= 0)
);
CREATE TABLE "payments" (
  "id" TEXT NOT NULL, "merchantId" TEXT NOT NULL, "amount" DECIMAL(12,2) NOT NULL,
  "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paymentMethod" "PaymentMethod" NOT NULL, "reference" TEXT, "notes" TEXT,
  "status" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED', "createdById" TEXT, "updatedById" TEXT,
  "reversedById" TEXT, "reversedAt" TIMESTAMP(3), "reversalReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0)
);
CREATE TABLE "payment_allocations" (
  "id" TEXT NOT NULL, "paymentId" TEXT NOT NULL, "invoiceId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL, "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_allocations_amount_positive" CHECK ("amount" > 0)
);
CREATE TABLE "audit_logs" (
  "id" TEXT NOT NULL, "actorUserId" TEXT, "action" TEXT NOT NULL, "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL, "beforeData" JSONB, "afterData" JSONB,
  "metadata" JSONB NOT NULL DEFAULT '{}', "ipAddress" TEXT, "userAgent" TEXT, "requestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "login_attempts" (
  "id" TEXT NOT NULL, "emailHash" TEXT NOT NULL, "ipHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "import_batches" (
  "id" TEXT NOT NULL, "fileName" TEXT NOT NULL, "importedById" TEXT NOT NULL,
  "totalRows" INTEGER NOT NULL DEFAULT 0, "successfulRows" INTEGER NOT NULL DEFAULT 0,
  "failedRows" INTEGER NOT NULL DEFAULT 0, "status" "ImportStatus" NOT NULL DEFAULT 'VALIDATING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3),
  CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "import_batches_row_counts_nonnegative" CHECK ("totalRows" >= 0 AND "successfulRows" >= 0 AND "failedRows" >= 0)
);
CREATE TABLE "import_rows" (
  "id" TEXT NOT NULL, "batchId" TEXT NOT NULL, "rowNumber" INTEGER NOT NULL,
  "externalId" TEXT, "payload" JSONB NOT NULL, "errors" JSONB NOT NULL DEFAULT '[]',
  "importedAt" TIMESTAMP(3), CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");
CREATE INDEX "users_status_idx" ON "users"("status");
CREATE INDEX "user_roles_roleId_idx" ON "user_roles"("roleId");
CREATE INDEX "role_permissions_permissionId_idx" ON "role_permissions"("permissionId");
CREATE UNIQUE INDEX "merchants_merchantCode_key" ON "merchants"("merchantCode");
CREATE INDEX "merchants_name_idx" ON "merchants"("name");
CREATE INDEX "merchants_phone_idx" ON "merchants"("phone");
CREATE INDEX "merchants_status_city_idx" ON "merchants"("status","city");
CREATE INDEX "merchants_createdAt_idx" ON "merchants"("createdAt");
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
CREATE INDEX "products_name_idx" ON "products"("name");
CREATE INDEX "products_isActive_idx" ON "products"("isActive");
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");
CREATE INDEX "invoices_merchantId_status_transactionDate_idx" ON "invoices"("merchantId","status","transactionDate");
CREATE INDEX "invoices_status_dueDate_idx" ON "invoices"("status","dueDate");
CREATE INDEX "invoices_transactionDate_idx" ON "invoices"("transactionDate");
CREATE INDEX "invoice_items_invoiceId_idx" ON "invoice_items"("invoiceId");
CREATE INDEX "invoice_items_productId_idx" ON "invoice_items"("productId");
CREATE INDEX "payments_merchantId_status_paymentDate_idx" ON "payments"("merchantId","status","paymentDate");
CREATE INDEX "payments_status_paymentDate_idx" ON "payments"("status","paymentDate");
CREATE UNIQUE INDEX "payment_allocations_paymentId_invoiceId_key" ON "payment_allocations"("paymentId","invoiceId");
CREATE INDEX "payment_allocations_invoiceId_idx" ON "payment_allocations"("invoiceId");
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
CREATE INDEX "audit_logs_actorUserId_createdAt_idx" ON "audit_logs"("actorUserId","createdAt");
CREATE INDEX "audit_logs_entityType_entityId_createdAt_idx" ON "audit_logs"("entityType","entityId","createdAt");
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action","createdAt");
CREATE INDEX "login_attempts_emailHash_createdAt_idx" ON "login_attempts"("emailHash","createdAt");
CREATE INDEX "login_attempts_ipHash_createdAt_idx" ON "login_attempts"("ipHash","createdAt");
CREATE INDEX "import_batches_importedById_createdAt_idx" ON "import_batches"("importedById","createdAt");
CREATE INDEX "import_batches_status_createdAt_idx" ON "import_batches"("status","createdAt");
CREATE UNIQUE INDEX "import_rows_batchId_rowNumber_key" ON "import_rows"("batchId","rowNumber");
CREATE INDEX "import_rows_externalId_idx" ON "import_rows"("externalId");

ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "audit_logs_append_only"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
