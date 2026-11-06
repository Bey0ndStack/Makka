-- Trigram search support for ILIKE '%term%' lookups.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "ChequeStatus" AS ENUM ('PENDING', 'CLEARED', 'BOUNCED');

-- Merchants: buyer tax registration number shown on printed invoices.
ALTER TABLE "merchants" ADD COLUMN "taxNumber" TEXT;

-- Invoices: VAT and a sequential internal number.
ALTER TABLE "invoices"
  ADD COLUMN "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "internalNumber" SERIAL NOT NULL;

-- Number existing invoices in creation order, then continue after the last
-- internal number issued by the previous system (1729).
UPDATE "invoices" AS i
SET "internalNumber" = ordered.rn
FROM (SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS rn FROM "invoices") AS ordered
WHERE ordered."id" = i."id";
SELECT setval(
  pg_get_serial_sequence('"invoices"', 'internalNumber'),
  GREATEST((SELECT COALESCE(MAX("internalNumber"), 0) FROM "invoices"), 1729)
);
CREATE UNIQUE INDEX "invoices_internalNumber_key" ON "invoices"("internalNumber");

-- Invoice lines: code name, item code and unit type.
ALTER TABLE "invoice_items"
  ADD COLUMN "codeName" TEXT,
  ADD COLUMN "itemCode" TEXT,
  ADD COLUMN "unit" TEXT;

-- CreateTable
CREATE TABLE "cheques" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "chequeDate" DATE NOT NULL,
    "chequeNumber" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "status" "ChequeStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cheques_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cheques_chequeDate_idx" ON "cheques"("chequeDate");
CREATE INDEX "cheques_status_chequeDate_idx" ON "cheques"("status", "chequeDate");
CREATE INDEX "cheques_chequeNumber_idx" ON "cheques"("chequeNumber");
CREATE INDEX "cheques_companyName_trgm_idx" ON "cheques" USING GIN ("companyName" gin_trgm_ops);

ALTER TABLE "cheques" ADD CONSTRAINT "cheques_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Performance indexes.
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");
CREATE INDEX "payments_paymentDate_idx" ON "payments"("paymentDate");
CREATE INDEX "merchants_name_trgm_idx" ON "merchants" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "merchants_merchantCode_trgm_idx" ON "merchants" USING GIN ("merchantCode" gin_trgm_ops);
CREATE INDEX "merchants_phone_trgm_idx" ON "merchants" USING GIN ("phone" gin_trgm_ops);
CREATE INDEX "invoices_invoiceNumber_trgm_idx" ON "invoices" USING GIN ("invoiceNumber" gin_trgm_ops);
CREATE INDEX "payments_reference_trgm_idx" ON "payments" USING GIN ("reference" gin_trgm_ops);

-- Cheque permissions for databases that were seeded before this migration.
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid()::text, 'cheque.read', 'View cheques'),
  (gen_random_uuid()::text, 'cheque.create', 'Record cheques'),
  (gen_random_uuid()::text, 'cheque.update', 'Update cheque status')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON
  (r."key" IN ('OWNER', 'ADMIN') AND p."key" IN ('cheque.read', 'cheque.create', 'cheque.update'))
  OR (r."key" = 'COLLECTOR' AND p."key" IN ('cheque.read', 'cheque.create'))
  OR (r."key" = 'VIEWER' AND p."key" = 'cheque.read')
ON CONFLICT DO NOTHING;
