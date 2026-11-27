-- AlterTable
ALTER TABLE "CustomerSession" ADD COLUMN     "campaignId" UUID;

-- AlterTable
ALTER TABLE "Experiment" ADD COLUMN     "closedAt" TIMESTAMPTZ(3),
ADD COLUMN     "minimumPerArm" INTEGER,
ADD COLUMN     "observationDays" INTEGER,
ADD COLUMN     "openedAt" TIMESTAMPTZ(3),
ADD COLUMN     "primaryOutcome" TEXT,
ADD COLUMN     "protocol" TEXT,
ADD COLUMN     "rankingSnapshot" JSONB,
ADD COLUMN     "state" TEXT NOT NULL DEFAULT 'LEGACY';

-- CreateTable
CREATE TABLE "AnalyticsCampaign" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsDaily" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "day" CHAR(10) NOT NULL,
    "cohort" TEXT NOT NULL,
    "campaignId" UUID,
    "visitors" INTEGER,
    "verifiedContent" INTEGER,
    "sourceRef" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AnalyticsDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialPeriod" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "month" CHAR(7) NOT NULL,
    "initialInvestment" DECIMAL(16,2) NOT NULL,
    "softwareCost" DECIMAL(16,2) NOT NULL,
    "inferenceCost" DECIMAL(16,2) NOT NULL,
    "operationsCost" DECIMAL(16,2) NOT NULL,
    "grossProfit" DECIMAL(16,2) NOT NULL,
    "controlGrossProfit" DECIMAL(16,2),
    "sourceRef" TEXT NOT NULL,
    "controlRef" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FinancialPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationCase" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "profile" JSONB NOT NULL,
    "expectedSkus" TEXT[],
    "reviewerId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationResult" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "promptId" UUID,
    "label" TEXT NOT NULL,
    "model" TEXT,
    "provider" TEXT,
    "candidates" TEXT[],
    "ranking" JSONB NOT NULL DEFAULT '[]',
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "schemaValid" BOOLEAN,
    "invalidSkus" INTEGER,
    "returnedSkus" INTEGER,
    "relevantCount" INTEGER,
    "outputCount" INTEGER,
    "durationMs" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "reservedUsd" DECIMAL(12,8),
    "costUsd" DECIMAL(12,8),
    "fallback" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalyticsCampaign_organizationId_storeId_startsAt_endsAt_idx" ON "AnalyticsCampaign"("organizationId", "storeId", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsCampaign_organizationId_storeId_id_key" ON "AnalyticsCampaign"("organizationId", "storeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDaily_organizationId_storeId_day_cohort_key" ON "AnalyticsDaily"("organizationId", "storeId", "day", "cohort");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialPeriod_organizationId_storeId_month_key" ON "FinancialPeriod"("organizationId", "storeId", "month");

-- CreateIndex
CREATE INDEX "EvaluationCase_organizationId_storeId_createdAt_idx" ON "EvaluationCase"("organizationId", "storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationCase_organizationId_id_key" ON "EvaluationCase"("organizationId", "id");

-- CreateIndex
CREATE INDEX "EvaluationResult_organizationId_createdAt_idx" ON "EvaluationResult"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationResult_organizationId_batchId_label_key" ON "EvaluationResult"("organizationId", "batchId", "label");

-- CreateIndex
CREATE INDEX "CustomerSession_organizationId_storeId_createdAt_idx" ON "CustomerSession"("organizationId", "storeId", "createdAt");

-- AddForeignKey
ALTER TABLE "CustomerSession" ADD CONSTRAINT "CustomerSession_organizationId_storeId_campaignId_fkey" FOREIGN KEY ("organizationId", "storeId", "campaignId") REFERENCES "AnalyticsCampaign"("organizationId", "storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsCampaign" ADD CONSTRAINT "AnalyticsCampaign_organizationId_storeId_fkey" FOREIGN KEY ("organizationId", "storeId") REFERENCES "Store"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDaily" ADD CONSTRAINT "AnalyticsDaily_organizationId_storeId_fkey" FOREIGN KEY ("organizationId", "storeId") REFERENCES "Store"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDaily" ADD CONSTRAINT "AnalyticsDaily_organizationId_storeId_campaignId_fkey" FOREIGN KEY ("organizationId", "storeId", "campaignId") REFERENCES "AnalyticsCampaign"("organizationId", "storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialPeriod" ADD CONSTRAINT "FinancialPeriod_organizationId_storeId_fkey" FOREIGN KEY ("organizationId", "storeId") REFERENCES "Store"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationCase" ADD CONSTRAINT "EvaluationCase_organizationId_storeId_fkey" FOREIGN KEY ("organizationId", "storeId") REFERENCES "Store"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationResult" ADD CONSTRAINT "EvaluationResult_organizationId_caseId_fkey" FOREIGN KEY ("organizationId", "caseId") REFERENCES "EvaluationCase"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationResult" ADD CONSTRAINT "EvaluationResult_organizationId_promptId_fkey" FOREIGN KEY ("organizationId", "promptId") REFERENCES "PromptVersion"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AnalyticsCampaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnalyticsDaily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinancialPeriod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvaluationCase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvaluationResult" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AnalyticsCampaign","AnalyticsDaily","FinancialPeriod","EvaluationCase","EvaluationResult" FROM PUBLIC, anon, authenticated;
ALTER TABLE "AnalyticsCampaign" ADD CHECK ("startsAt" < "endsAt");
ALTER TABLE "AnalyticsDaily" ADD CHECK ((visitors IS NULL OR visitors>=0) AND ("verifiedContent" IS NULL OR "verifiedContent">=0));
ALTER TABLE "Experiment" ADD CHECK (state IN ('LEGACY','DRAFT','RUNNING','PAUSED','STOPPED'));

CREATE FUNCTION preserve_prompt_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Prompt versions are immutable';
  END IF;
  IF NEW.template IS DISTINCT FROM OLD.template OR NEW.name IS DISTINCT FROM OLD.name OR NEW.version IS DISTINCT FROM OLD.version OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId" THEN
    RAISE EXCEPTION 'Prompt versions are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_prompt_version BEFORE UPDATE OR DELETE ON "PromptVersion"
FOR EACH ROW EXECUTE FUNCTION preserve_prompt_version();
