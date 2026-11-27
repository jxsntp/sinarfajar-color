CREATE TABLE "CustomerRegistration" (
    "organizationId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerRegistration_pkey" PRIMARY KEY ("organizationId", "sessionId"),
    CONSTRAINT "CustomerRegistration_organizationId_sessionId_fkey"
        FOREIGN KEY ("organizationId", "sessionId")
        REFERENCES "CustomerSession" ("organizationId", "id") ON DELETE CASCADE ON UPDATE NO ACTION
);
ALTER TABLE "CustomerRegistration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerRegistration" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "CustomerRegistration" FROM PUBLIC, anon, authenticated;
