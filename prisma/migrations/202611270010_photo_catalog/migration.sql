CREATE TABLE "PhotoCatalogItem" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "storagePath" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "category" TEXT,
    "tags" JSONB,
    "proposal" JSONB,
    "proposalModel" TEXT,
    "analysisStartedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "PhotoCatalogItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PhotoCatalogItem_organizationId_storeId_fkey"
        FOREIGN KEY ("organizationId", "storeId") REFERENCES "Store" ("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "PhotoCatalogItem_state_check" CHECK (
        "state" IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')
        AND ("state" <> 'PUBLISHED' OR ("category" IS NOT NULL AND "tags" IS NOT NULL))
    )
);
CREATE UNIQUE INDEX "PhotoCatalogItem_organizationId_storagePath_key" ON "PhotoCatalogItem"("organizationId", "storagePath");
CREATE INDEX "PhotoCatalogItem_organizationId_storeId_state_category_idx" ON "PhotoCatalogItem"("organizationId", "storeId", "state", "category");
ALTER TABLE "PhotoCatalogItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PhotoCatalogItem" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "PhotoCatalogItem" FROM PUBLIC, anon, authenticated;

ALTER TABLE "RecommendationRun"
    ADD COLUMN "photoCandidateIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    ADD COLUMN "photoPicks" JSONB NOT NULL DEFAULT '[]';
