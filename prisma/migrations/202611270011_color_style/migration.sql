-- Customer-chosen color style direction. Null for reports issued before style selection.
ALTER TABLE "ColorAnalysis" ADD COLUMN "colorStyle" TEXT;
ALTER TABLE "ColorAnalysis" ADD CONSTRAINT "ColorAnalysis_colorStyle_check"
    CHECK ("colorStyle" IS NULL OR "colorStyle" IN ('both', 'feminine', 'masculine'));
