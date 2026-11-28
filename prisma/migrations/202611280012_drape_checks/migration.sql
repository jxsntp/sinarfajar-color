-- The metal chosen in the comparison's gold-against-silver step. Null when skipped or for earlier reports.
ALTER TABLE "ColorAnalysis" ADD COLUMN "metal" TEXT;
ALTER TABLE "ColorAnalysis" ADD CONSTRAINT "ColorAnalysis_metal_check"
    CHECK ("metal" IS NULL OR "metal" IN ('yellow', 'white'));
-- Whether the comparison confirmed, split or overruled a local camera trial. Null without a trial.
ALTER TABLE "ColorAnalysis" ADD COLUMN "engineCheck" TEXT;
ALTER TABLE "ColorAnalysis" ADD CONSTRAINT "ColorAnalysis_engineCheck_check"
    CHECK ("engineCheck" IS NULL OR "engineCheck" IN ('confirmed', 'split', 'overruled'));
