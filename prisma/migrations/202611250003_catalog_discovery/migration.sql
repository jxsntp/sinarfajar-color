-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "catalogVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "rankingSettings" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "gemstones" TEXT,
ADD COLUMN     "manufacturerId" UUID,
ADD COLUMN     "occasionTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "styleTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "weightGrams" DECIMAL(10,3);

-- AlterTable
ALTER TABLE "Inventory" ADD COLUMN     "displayLocation" TEXT;

-- AlterTable
ALTER TABLE "RecommendationRun" ADD COLUMN     "assignedStrategy" TEXT NOT NULL DEFAULT 'rules',
ADD COLUMN     "candidateSkus" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "catalogVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "failureCategory" TEXT,
ADD COLUMN     "fingerprint" TEXT,
ADD COLUMN     "inferenceCost" DECIMAL(12,8),
ADD COLUMN     "inputTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "latencyMs" INTEGER,
ADD COLUMN     "modelIdentifier" TEXT,
ADD COLUMN     "outputTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "preferences" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "promptLabel" TEXT NOT NULL DEFAULT 'legacy',
ADD COLUMN     "providerName" TEXT,
ADD COLUMN     "returnedRanking" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "schemaValid" BOOLEAN,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'COMPLETE',
ADD COLUMN     "variant" TEXT;

-- CreateTable
CREATE TABLE "Manufacturer" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Manufacturer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogAudit" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivationRequest" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "key" UUID NOT NULL,
    "preferenceHash" TEXT NOT NULL,
    "runId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InferenceAttempt" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "reservedUsd" DECIMAL(12,8) NOT NULL,
    "costUsd" DECIMAL(12,8),
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "outcome" TEXT NOT NULL DEFAULT 'reserved',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InferenceAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Manufacturer_organizationId_id_key" ON "Manufacturer"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Manufacturer_organizationId_name_key" ON "Manufacturer"("organizationId", "name");

-- CreateIndex
CREATE INDEX "CatalogAudit_organizationId_subject_createdAt_idx" ON "CatalogAudit"("organizationId", "subject", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ActivationRequest_organizationId_sessionId_key_key" ON "ActivationRequest"("organizationId", "sessionId", "key");

-- CreateIndex
CREATE INDEX "InferenceAttempt_organizationId_createdAt_idx" ON "InferenceAttempt"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "InferenceAttempt_runId_idx" ON "InferenceAttempt"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationRun_organizationId_sessionId_fingerprint_key" ON "RecommendationRun"("organizationId", "sessionId", "fingerprint");

-- AddForeignKey
ALTER TABLE "Manufacturer" ADD CONSTRAINT "Manufacturer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogAudit" ADD CONSTRAINT "CatalogAudit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogAudit" ADD CONSTRAINT "CatalogAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivationRequest" ADD CONSTRAINT "ActivationRequest_organizationId_sessionId_runId_fkey" FOREIGN KEY ("organizationId", "sessionId", "runId") REFERENCES "RecommendationRun"("organizationId", "sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InferenceAttempt" ADD CONSTRAINT "InferenceAttempt_organizationId_runId_fkey" FOREIGN KEY ("organizationId", "runId") REFERENCES "RecommendationRun"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_manufacturerId_fkey" FOREIGN KEY ("organizationId", "manufacturerId") REFERENCES "Manufacturer"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- Apply the same server-only boundary as the foundation tables.
DO $$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['Manufacturer','CatalogAudit','ActivationRequest','InferenceAttempt'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC, anon, authenticated', relation_name);
  END LOOP;
END $$;

CREATE FUNCTION bump_catalog_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE "Organization" SET "catalogVersion" = "catalogVersion" + 1 WHERE id = OLD."organizationId";
  ELSE
    UPDATE "Organization" SET "catalogVersion" = "catalogVersion" + 1 WHERE id = NEW."organizationId";
  END IF;
  RETURN NULL;
END $$;
DO $$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['Brand','Manufacturer','Product','ProductImage','Inventory'] LOOP
    EXECUTE format('CREATE TRIGGER catalog_revision AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION bump_catalog_version()', relation_name);
  END LOOP;
END $$;