-- Supabase Auth owns identities. App roles are provisioned independently.
ALTER TABLE "UserProfile" ADD CONSTRAINT profile_auth_identity
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE "Membership" ADD CONSTRAINT membership_store_scope CHECK (
  (role IN ('STORE_MANAGER', 'SALES_ASSOCIATE') AND "storeId" IS NOT NULL)
  OR (role IN ('ORG_ADMIN', 'MARKETING_ANALYST') AND "storeId" IS NULL)
);
ALTER TABLE "Inventory" ADD CHECK ("onHand" >= 0 AND price >= 0);
ALTER TABLE "RecommendationItem" ADD CHECK (rank > 0);
ALTER TABLE "TransactionItem" ADD CHECK (quantity > 0 AND "unitPrice" >= 0);
ALTER TABLE "Feedback" ADD CHECK (rating BETWEEN 1 AND 5);
CREATE UNIQUE INDEX one_human_open_per_session ON "InteractionEvent" ("organizationId", "sessionId") WHERE name = 'mobile_report_opened';
CREATE UNIQUE INDEX one_active_kiosk_session ON "CustomerSession" ("organizationId", "deviceId") WHERE "endedAt" IS NULL;

-- Deny direct browser access to domain writes, capability hashes and private reports.
-- The trusted Next.js database role performs the scoped business operations.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'Organization','Store','Device','UserProfile','Membership','Brand','Product','ProductImage',
    'Inventory','CustomerSession','CustomerPreference','ColorAnalysis','MobileReportToken','Consent',
    'RecommendationRun','RecommendationItem','InteractionEvent','ProductInquiry','TryOn','Transaction',
    'TransactionItem','Experiment','ExperimentAssignment','Feedback','AIModelConfig','PromptVersion',
    '_prisma_migrations'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
  END LOOP;
END $$;
GRANT SELECT ON "Membership", "UserProfile" TO authenticated;
CREATE POLICY own_memberships ON "Membership" FOR SELECT TO authenticated USING ("userId" = (SELECT auth.uid()));
CREATE POLICY own_profile ON "UserProfile" FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));
