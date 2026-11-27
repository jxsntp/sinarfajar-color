-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DeviceKind" AS ENUM ('KIOSK', 'POS');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('ORG_ADMIN', 'STORE_MANAGER', 'SALES_ASSOCIATE', 'MARKETING_ANALYST');

-- CreateEnum
CREATE TYPE "ColorSource" AS ENUM ('MANUAL', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('KIOSK', 'MOBILE', 'STAFF', 'POS');

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'id-ID',
    "accent" TEXT NOT NULL DEFAULT '#623e50',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" UUID NOT NULL,
    "platformAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "DeviceKind" NOT NULL DEFAULT 'KIOSK',
    "keyHash" CHAR(64) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "storeId" UUID,
    "role" "StaffRole" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "goldColor" TEXT NOT NULL,
    "purity" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "storagePath" TEXT NOT NULL,
    "alt" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inventory" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "onHand" INTEGER NOT NULL,
    "price" DECIMAL(16,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'IDR',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSession" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "kioskKeyHash" CHAR(64),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CustomerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPreference" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "style" TEXT,
    "occasion" TEXT,
    "category" TEXT,
    "maxBudget" DECIMAL(16,2),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CustomerPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ColorAnalysis" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "profile" TEXT NOT NULL,
    "palette" TEXT[],
    "methodVersion" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "uncertain" BOOLEAN NOT NULL,
    "source" "ColorSource" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ColorAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobileReportToken" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MobileReportToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIModelConfig" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AIModelConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptVersion" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "template" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PromptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationRun" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "strategy" TEXT NOT NULL,
    "modelConfigId" UUID,
    "promptVersionId" UUID,
    "fallback" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RecommendationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationItem" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "rank" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RecommendationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experiment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Experiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperimentAssignment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "experimentId" UUID NOT NULL,
    "variant" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ExperimentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteractionEvent" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "channel" "Channel" NOT NULL,
    "name" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "runId" UUID,
    "productId" UUID,
    "rank" INTEGER,
    "experimentVersions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InteractionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductInquiry" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProductInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TryOn" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "confirmedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TryOn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "externalRef" TEXT NOT NULL,
    "total" DECIMAL(16,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionItem" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(16,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TransactionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Store_organizationId_id_key" ON "Store"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Store_organizationId_code_key" ON "Store"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Device_keyHash_key" ON "Device"("keyHash");

-- CreateIndex
CREATE INDEX "Device_organizationId_storeId_idx" ON "Device"("organizationId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_organizationId_id_key" ON "Device"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Device_organizationId_storeId_id_key" ON "Device"("organizationId", "storeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organizationId_id_key" ON "Membership"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_organizationId_key" ON "Membership"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_organizationId_id_key" ON "Brand"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_organizationId_name_key" ON "Brand"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Product_organizationId_brandId_idx" ON "Product"("organizationId", "brandId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_organizationId_id_key" ON "Product"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Product_organizationId_sku_key" ON "Product"("organizationId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImage_organizationId_id_key" ON "ProductImage"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImage_organizationId_productId_storagePath_key" ON "ProductImage"("organizationId", "productId", "storagePath");

-- CreateIndex
CREATE UNIQUE INDEX "Inventory_organizationId_id_key" ON "Inventory"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Inventory_organizationId_storeId_productId_key" ON "Inventory"("organizationId", "storeId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSession_kioskKeyHash_key" ON "CustomerSession"("kioskKeyHash");

-- CreateIndex
CREATE INDEX "CustomerSession_organizationId_deviceId_idx" ON "CustomerSession"("organizationId", "deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSession_organizationId_id_key" ON "CustomerSession"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSession_organizationId_storeId_id_key" ON "CustomerSession"("organizationId", "storeId", "id");

-- CreateIndex
CREATE INDEX "CustomerPreference_organizationId_sessionId_idx" ON "CustomerPreference"("organizationId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPreference_organizationId_id_key" ON "CustomerPreference"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPreference_organizationId_sessionId_key" ON "CustomerPreference"("organizationId", "sessionId");

-- CreateIndex
CREATE INDEX "ColorAnalysis_organizationId_sessionId_idx" ON "ColorAnalysis"("organizationId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ColorAnalysis_organizationId_id_key" ON "ColorAnalysis"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ColorAnalysis_organizationId_sessionId_key" ON "ColorAnalysis"("organizationId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "MobileReportToken_tokenHash_key" ON "MobileReportToken"("tokenHash");

-- CreateIndex
CREATE INDEX "MobileReportToken_organizationId_sessionId_idx" ON "MobileReportToken"("organizationId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "MobileReportToken_organizationId_id_key" ON "MobileReportToken"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MobileReportToken_organizationId_sessionId_key" ON "MobileReportToken"("organizationId", "sessionId");

-- CreateIndex
CREATE INDEX "Consent_organizationId_sessionId_idx" ON "Consent"("organizationId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Consent_organizationId_id_key" ON "Consent"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AIModelConfig_organizationId_id_key" ON "AIModelConfig"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AIModelConfig_organizationId_provider_model_key" ON "AIModelConfig"("organizationId", "provider", "model");

-- CreateIndex
CREATE UNIQUE INDEX "PromptVersion_organizationId_id_key" ON "PromptVersion"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PromptVersion_organizationId_name_version_key" ON "PromptVersion"("organizationId", "name", "version");

-- CreateIndex
CREATE INDEX "RecommendationRun_organizationId_sessionId_idx" ON "RecommendationRun"("organizationId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationRun_organizationId_id_key" ON "RecommendationRun"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationRun_organizationId_sessionId_id_key" ON "RecommendationRun"("organizationId", "sessionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationItem_organizationId_id_key" ON "RecommendationItem"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationItem_organizationId_runId_rank_key" ON "RecommendationItem"("organizationId", "runId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationItem_organizationId_runId_productId_key" ON "RecommendationItem"("organizationId", "runId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Experiment_organizationId_id_key" ON "Experiment"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Experiment_organizationId_name_version_key" ON "Experiment"("organizationId", "name", "version");

-- CreateIndex
CREATE INDEX "ExperimentAssignment_organizationId_sessionId_idx" ON "ExperimentAssignment"("organizationId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExperimentAssignment_organizationId_id_key" ON "ExperimentAssignment"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ExperimentAssignment_organizationId_sessionId_experimentId_key" ON "ExperimentAssignment"("organizationId", "sessionId", "experimentId");

-- CreateIndex
CREATE INDEX "InteractionEvent_organizationId_sessionId_idx" ON "InteractionEvent"("organizationId", "sessionId");

-- CreateIndex
CREATE INDEX "InteractionEvent_organizationId_sessionId_occurredAt_idx" ON "InteractionEvent"("organizationId", "sessionId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "InteractionEvent_organizationId_id_key" ON "InteractionEvent"("organizationId", "id");

-- CreateIndex
CREATE INDEX "ProductInquiry_organizationId_sessionId_idx" ON "ProductInquiry"("organizationId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductInquiry_organizationId_id_key" ON "ProductInquiry"("organizationId", "id");

-- CreateIndex
CREATE INDEX "TryOn_organizationId_sessionId_idx" ON "TryOn"("organizationId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "TryOn_organizationId_id_key" ON "TryOn"("organizationId", "id");

-- CreateIndex
CREATE INDEX "Transaction_organizationId_sessionId_idx" ON "Transaction"("organizationId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_organizationId_id_key" ON "Transaction"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_organizationId_storeId_externalRef_key" ON "Transaction"("organizationId", "storeId", "externalRef");

-- CreateIndex
CREATE INDEX "TransactionItem_organizationId_transactionId_idx" ON "TransactionItem"("organizationId", "transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionItem_organizationId_id_key" ON "TransactionItem"("organizationId", "id");

-- CreateIndex
CREATE INDEX "Feedback_organizationId_sessionId_idx" ON "Feedback"("organizationId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_organizationId_id_key" ON "Feedback"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_organizationId_storeId_fkey" FOREIGN KEY ("organizationId", "storeId") REFERENCES "Store"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_storeId_fkey" FOREIGN KEY ("organizationId", "storeId") REFERENCES "Store"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_brandId_fkey" FOREIGN KEY ("organizationId", "brandId") REFERENCES "Brand"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "Product"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_organizationId_storeId_fkey" FOREIGN KEY ("organizationId", "storeId") REFERENCES "Store"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "Product"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CustomerSession" ADD CONSTRAINT "CustomerSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CustomerSession" ADD CONSTRAINT "CustomerSession_organizationId_storeId_deviceId_fkey" FOREIGN KEY ("organizationId", "storeId", "deviceId") REFERENCES "Device"("organizationId", "storeId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CustomerPreference" ADD CONSTRAINT "CustomerPreference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CustomerPreference" ADD CONSTRAINT "CustomerPreference_organizationId_sessionId_fkey" FOREIGN KEY ("organizationId", "sessionId") REFERENCES "CustomerSession"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ColorAnalysis" ADD CONSTRAINT "ColorAnalysis_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ColorAnalysis" ADD CONSTRAINT "ColorAnalysis_organizationId_sessionId_fkey" FOREIGN KEY ("organizationId", "sessionId") REFERENCES "CustomerSession"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MobileReportToken" ADD CONSTRAINT "MobileReportToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MobileReportToken" ADD CONSTRAINT "MobileReportToken_organizationId_sessionId_fkey" FOREIGN KEY ("organizationId", "sessionId") REFERENCES "CustomerSession"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_organizationId_sessionId_fkey" FOREIGN KEY ("organizationId", "sessionId") REFERENCES "CustomerSession"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AIModelConfig" ADD CONSTRAINT "AIModelConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PromptVersion" ADD CONSTRAINT "PromptVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "RecommendationRun" ADD CONSTRAINT "RecommendationRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "RecommendationRun" ADD CONSTRAINT "RecommendationRun_organizationId_sessionId_fkey" FOREIGN KEY ("organizationId", "sessionId") REFERENCES "CustomerSession"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "RecommendationRun" ADD CONSTRAINT "RecommendationRun_organizationId_modelConfigId_fkey" FOREIGN KEY ("organizationId", "modelConfigId") REFERENCES "AIModelConfig"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "RecommendationRun" ADD CONSTRAINT "RecommendationRun_organizationId_promptVersionId_fkey" FOREIGN KEY ("organizationId", "promptVersionId") REFERENCES "PromptVersion"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "RecommendationItem" ADD CONSTRAINT "RecommendationItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "RecommendationItem" ADD CONSTRAINT "RecommendationItem_organizationId_runId_fkey" FOREIGN KEY ("organizationId", "runId") REFERENCES "RecommendationRun"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "RecommendationItem" ADD CONSTRAINT "RecommendationItem_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "Product"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ExperimentAssignment" ADD CONSTRAINT "ExperimentAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ExperimentAssignment" ADD CONSTRAINT "ExperimentAssignment_organizationId_sessionId_fkey" FOREIGN KEY ("organizationId", "sessionId") REFERENCES "CustomerSession"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ExperimentAssignment" ADD CONSTRAINT "ExperimentAssignment_organizationId_experimentId_fkey" FOREIGN KEY ("organizationId", "experimentId") REFERENCES "Experiment"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InteractionEvent" ADD CONSTRAINT "InteractionEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InteractionEvent" ADD CONSTRAINT "InteractionEvent_organizationId_sessionId_fkey" FOREIGN KEY ("organizationId", "sessionId") REFERENCES "CustomerSession"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InteractionEvent" ADD CONSTRAINT "InteractionEvent_organizationId_sessionId_runId_fkey" FOREIGN KEY ("organizationId", "sessionId", "runId") REFERENCES "RecommendationRun"("organizationId", "sessionId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InteractionEvent" ADD CONSTRAINT "InteractionEvent_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "Product"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ProductInquiry" ADD CONSTRAINT "ProductInquiry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ProductInquiry" ADD CONSTRAINT "ProductInquiry_organizationId_sessionId_fkey" FOREIGN KEY ("organizationId", "sessionId") REFERENCES "CustomerSession"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ProductInquiry" ADD CONSTRAINT "ProductInquiry_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "Product"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TryOn" ADD CONSTRAINT "TryOn_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TryOn" ADD CONSTRAINT "TryOn_organizationId_sessionId_fkey" FOREIGN KEY ("organizationId", "sessionId") REFERENCES "CustomerSession"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TryOn" ADD CONSTRAINT "TryOn_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "Product"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_organizationId_storeId_sessionId_fkey" FOREIGN KEY ("organizationId", "storeId", "sessionId") REFERENCES "CustomerSession"("organizationId", "storeId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TransactionItem" ADD CONSTRAINT "TransactionItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TransactionItem" ADD CONSTRAINT "TransactionItem_organizationId_transactionId_fkey" FOREIGN KEY ("organizationId", "transactionId") REFERENCES "Transaction"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TransactionItem" ADD CONSTRAINT "TransactionItem_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "Product"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_organizationId_sessionId_fkey" FOREIGN KEY ("organizationId", "sessionId") REFERENCES "CustomerSession"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;
