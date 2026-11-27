-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "expiresAt" TIMESTAMPTZ(3) NOT NULL DEFAULT (now() + '180 days'::interval),
ADD COLUMN     "lastSeenAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Inventory" ADD COLUMN     "verifiedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "RateBucket" (
    "key" CHAR(64) NOT NULL,
    "window" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "RateBucket_pkey" PRIMARY KEY ("key","window")
);

-- CreateTable
CREATE TABLE "WebhookNonce" (
    "key" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WebhookNonce_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "OperationMinute" (
    "operation" TEXT NOT NULL,
    "minute" TIMESTAMPTZ(3) NOT NULL,
    "outcome" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "OperationMinute_pkey" PRIMARY KEY ("operation","minute","outcome")
);

-- CreateTable
CREATE TABLE "PrivacyAudit" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivacyAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RateBucket_window_idx" ON "RateBucket"("window");

-- CreateIndex
CREATE INDEX "WebhookNonce_expiresAt_idx" ON "WebhookNonce"("expiresAt");

-- CreateIndex
CREATE INDEX "OperationMinute_minute_idx" ON "OperationMinute"("minute");

-- CreateIndex
CREATE INDEX "PrivacyAudit_organizationId_storeId_createdAt_idx" ON "PrivacyAudit"("organizationId", "storeId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerSession_createdAt_id_idx" ON "CustomerSession"("createdAt", "id");


-- Detach customer references on erasure without resetting paid inference quotas.
ALTER TABLE "InferenceAttempt" ALTER COLUMN "runId" DROP NOT NULL;

-- Internal infrastructure tables are never exposed through Supabase API roles.
ALTER TABLE "RateBucket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookNonce" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OperationMinute" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PrivacyAudit" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "RateBucket", "WebhookNonce", "OperationMinute", "PrivacyAudit" FROM PUBLIC, anon, authenticated;
