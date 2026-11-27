ALTER TABLE "ColorAnalysis"
  ALTER COLUMN "profile" DROP NOT NULL,
  ADD COLUMN "toneGroups" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "paletteVersion" TEXT,
  ADD COLUMN "calibrationVersion" TEXT,
  ADD COLUMN "paletteSnapshot" JSONB,
  ADD COLUMN "uncertainty" TEXT;

ALTER TABLE "MobileReportToken" ADD COLUMN "handedOffAt" TIMESTAMPTZ(3);
UPDATE "MobileReportToken" SET "handedOffAt" = "createdAt";

ALTER TABLE "Product" ADD COLUMN "visibleColors" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "RecommendationRun" ADD COLUMN "colorContext" JSONB;
