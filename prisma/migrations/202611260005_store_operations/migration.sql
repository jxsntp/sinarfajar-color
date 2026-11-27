BEGIN;
CREATE TYPE "FulfillmentState" AS ENUM ('PENDING','ACKNOWLEDGED','PREPARING','READY','COMPLETED','CANCELLED');
CREATE TYPE "OperationalAlertKind" AS ENUM ('NEW_REQUEST','UNACKNOWLEDGED','EXCESSIVE_WAIT','INVENTORY_DISCREPANCY','INCIDENT');
ALTER TABLE "ProductInquiry" ADD COLUMN "fulfillmentState" "FulfillmentState" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "assigneeId" UUID REFERENCES "UserProfile"(id) ON DELETE RESTRICT,
  ADD COLUMN "acknowledgedAt" TIMESTAMPTZ(3),
  ADD COLUMN "completedAt" TIMESTAMPTZ(3),
  ADD COLUMN "cancelledAt" TIMESTAMPTZ(3);
ALTER TABLE "TryOn" ADD COLUMN "fulfillmentState" "FulfillmentState" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "assigneeId" UUID REFERENCES "UserProfile"(id) ON DELETE RESTRICT,
  ADD COLUMN "acknowledgedAt" TIMESTAMPTZ(3),
  ADD COLUMN "completedAt" TIMESTAMPTZ(3),
  ADD COLUMN "cancelledAt" TIMESTAMPTZ(3), ADD COLUMN source TEXT NOT NULL DEFAULT 'customer', ADD COLUMN "scannedAt" TIMESTAMPTZ(3), ADD COLUMN "customerConfirmedAt" TIMESTAMPTZ(3);
UPDATE "TryOn" SET "fulfillmentState"='COMPLETED', "completedAt"="confirmedAt" WHERE "confirmedAt" IS NOT NULL;
CREATE INDEX "TryOn_organizationId_fulfillmentState_createdAt_idx" ON "TryOn" ("organizationId","fulfillmentState","createdAt");
CREATE INDEX "ProductInquiry_organizationId_fulfillmentState_createdAt_idx" ON "ProductInquiry" ("organizationId","fulfillmentState","createdAt");
ALTER TABLE "Product" ADD COLUMN barcode TEXT;
CREATE UNIQUE INDEX "Product_organizationId_barcode_key" ON "Product" ("organizationId",barcode);
ALTER TABLE "Inventory" ADD COLUMN "posSyncedAt" TIMESTAMPTZ(3);
ALTER TABLE "Transaction" ALTER COLUMN "sessionId" DROP NOT NULL,
  ADD COLUMN source TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN "soldAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN attribution TEXT NOT NULL DEFAULT 'unattributed',
  ADD COLUMN "duplicateCount" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "Transaction_organizationId_storeId_fkey" FOREIGN KEY ("organizationId","storeId") REFERENCES "Store" ("organizationId",id) ON DELETE RESTRICT;
UPDATE "Transaction" SET "soldAt"="createdAt", attribution=CASE WHEN "sessionId" IS NULL THEN 'unattributed' ELSE 'session_only' END;
CREATE INDEX "Transaction_organizationId_storeId_soldAt_idx" ON "Transaction" ("organizationId","storeId","soldAt");
ALTER TABLE "TransactionItem" ADD COLUMN recommended BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE "OperationalAlert" (
  id UUID PRIMARY KEY, "organizationId" UUID NOT NULL, "storeId" UUID NOT NULL,
  kind "OperationalAlertKind" NOT NULL, subject TEXT NOT NULL, message TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "resolvedAt" TIMESTAMPTZ(3),
  "deliveredAt" TIMESTAMPTZ(3), "leaseUntil" TIMESTAMPTZ(3), attempts INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY ("organizationId","storeId") REFERENCES "Store" ("organizationId",id) ON DELETE RESTRICT,
  UNIQUE ("organizationId","storeId",kind,subject)
);
CREATE INDEX "OperationalAlert_organizationId_storeId_resolvedAt_createdAt_idx" ON "OperationalAlert" ("organizationId","storeId","resolvedAt","createdAt");
CREATE TABLE "SaleAdjustment" (
  id UUID PRIMARY KEY, "organizationId" UUID NOT NULL, "transactionId" UUID NOT NULL,
  "externalRef" TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('refund','cancel')),
  amount DECIMAL(16,2) NOT NULL CHECK (amount >= 0),
  "occurredAt" TIMESTAMPTZ(3) NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("organizationId","transactionId") REFERENCES "Transaction" ("organizationId",id) ON DELETE RESTRICT,
  UNIQUE ("organizationId","transactionId","externalRef")
);
ALTER TABLE "OperationalAlert" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SaleAdjustment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "OperationalAlert","SaleAdjustment" FROM PUBLIC, anon, authenticated;
COMMIT;
