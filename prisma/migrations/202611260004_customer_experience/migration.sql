ALTER TABLE "CustomerSession" ADD COLUMN "assisted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "checkoutHash" CHAR(64) UNIQUE,
  ADD COLUMN "checkoutExpiresAt" TIMESTAMPTZ(3);
ALTER TABLE "ColorAnalysis" ADD COLUMN "cameraConsentId" UUID;
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_organization_session_id_key" UNIQUE ("organizationId","sessionId",id);
ALTER TABLE "ColorAnalysis" ADD CONSTRAINT "ColorAnalysis_camera_consent_fkey"
  FOREIGN KEY ("organizationId","sessionId","cameraConsentId") REFERENCES "Consent" ("organizationId","sessionId",id) ON DELETE RESTRICT;
ALTER TABLE "ProductInquiry" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'in_store', ADD COLUMN "contactEmail" TEXT;
ALTER TABLE "CustomerSession" ADD CONSTRAINT "CustomerSession_checkout_pair" CHECK (("checkoutHash" IS NULL) = ("checkoutExpiresAt" IS NULL));
CREATE INDEX phase3_product_click_lookup ON "InteractionEvent" ("organizationId","sessionId","runId","productId") WHERE name='recommended_product_clicked';
