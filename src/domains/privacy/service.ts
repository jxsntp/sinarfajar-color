import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";
import type { Tx } from "../catalog/service";
import { reportScope } from "../sessions/service";

export const privacyInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("withdraw"), purpose: z.enum(["marketing", "local_camera"]) }).strict(),
  z.object({ action: z.literal("erase"), confirm: z.literal("delete") }).strict(),
]);

type Scope = { id: string; organizationId: string; storeId: string };
async function lockSession(tx: Tx, session: Scope) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "CustomerSession" WHERE id = ${session.id}::uuid
      AND "organizationId" = ${session.organizationId}::uuid AND "storeId" = ${session.storeId}::uuid FOR UPDATE`;
  return rows.length > 0;
}
async function erase(tx: Tx, scope: Scope, action: string) {
  const { id, organizationId, storeId } = scope;
  const where = { organizationId, sessionId: id };
  if (await tx.recommendationRun.findFirst({
    where: { ...where, status: "PENDING", createdAt: { gt: new Date(Date.now() - 60000) } },
    select: { id: true },
  })) throw new HttpError(409, "recommendation_in_progress");

  const inquiries = await tx.productInquiry.findMany({ where, select: { id: true } });
  const tryOns = await tx.tryOn.findMany({ where, select: { id: true } });
  await tx.operationalAlert.deleteMany({
    where: { organizationId, storeId, subject: { in: [...inquiries, ...tryOns].map((entry) => entry.id) } },
  });
  await tx.transactionItem.updateMany({ where: { organizationId, transaction: { ...where, storeId } }, data: { recommended: false } });
  await tx.transaction.updateMany({ where: { ...where, storeId }, data: { sessionId: null, attribution: "unattributed" } });
  await tx.interactionEvent.deleteMany({ where });
  await tx.activationRequest.deleteMany({ where });
  // Preserve quota accounting without retaining a relationship to the customer.
  await tx.inferenceAttempt.updateMany({ where: { organizationId, run: where }, data: { runId: null } });
  await tx.recommendationItem.deleteMany({ where: { organizationId, run: where } });
  await tx.recommendationRun.deleteMany({ where });
  await tx.colorAnalysis.deleteMany({ where });
  await tx.consent.deleteMany({ where });
  await tx.feedback.deleteMany({ where });
  await tx.customerPreference.deleteMany({ where });
  await tx.experimentAssignment.deleteMany({ where });
  await tx.mobileReportToken.deleteMany({ where });
  await tx.productInquiry.deleteMany({ where });
  await tx.tryOn.deleteMany({ where });
  await tx.customerSession.deleteMany({ where: { id, organizationId, storeId } });
  await tx.privacyAudit.create({ data: { organizationId, storeId, action } });
}
export async function customerPrivacy(token: string, input: z.infer<typeof privacyInput>) {
  return db.$transaction(async (tx) => {
    const scope = await reportScope(token, tx);
    if (!(await lockSession(tx, scope))) throw new HttpError(401, "invalid_report");
    await reportScope(token, tx);
    const { organizationId, storeId, id } = scope;
    const where = { organizationId, sessionId: id };
    if (input.action === "erase") {
      await erase(tx, scope, "customer_erasure");
      return { erased: true };
    }
    const purpose = input.purpose;
    const previous = await tx.consent.findFirst({ where: { ...where, purpose }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    if (previous?.granted !== false) {
      await tx.consent.create({ data: { ...where, purpose, granted: false, version: "privacy-v1" } });
      await tx.privacyAudit.create({ data: { organizationId, storeId, action: purpose + "_withdrawal" } });
    }
    if (purpose === "local_camera")
      await tx.colorAnalysis.updateMany({ where, data: { cameraConsentId: null, quality: "manual" } });
    else
      await tx.productInquiry.updateMany({ where: { ...where, contactEmail: { not: null } }, data: { contactEmail: null } });
    return { withdrawn: true };
  });
}

export async function enforceRetention(now = new Date()) {
  const config = env();
  const cutoff = new Date(now.getTime() - config.CUSTOMER_RETENTION_DAYS * 86400000);
  const candidates = await db.customerSession.findMany({
    where: {
      createdAt: { lt: cutoff },
      mobileReportTokenRecords: { none: { expiresAt: { gt: now }, revokedAt: null } },
    }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 20,
    select: { id: true, organizationId: true, storeId: true },
  });
  let erased = 0;
  let deferred = 0;
  for (const scope of candidates) {
    try {
      const removed = await db.$transaction(async (tx) => {
        if (!(await lockSession(tx, scope))) return false;
        await erase(tx, scope, "retention_erasure");
        return true;
      });
      if (removed) erased += 1;
    } catch (error) {
      if (!(error instanceof HttpError) || error.code !== "recommendation_in_progress") throw error;
      deferred += 1;
    }
  }
  const recent = new Date(now.getTime() - 86400000);
  const auditCutoff = new Date(now.getTime() - config.PRIVACY_AUDIT_RETENTION_DAYS * 86400000);
  await Promise.all([
    db.$executeRaw`DELETE FROM "WebhookNonce" WHERE key IN (SELECT key FROM "WebhookNonce" WHERE "expiresAt" < ${now} LIMIT 2000)`,
    db.$executeRaw`DELETE FROM "RateBucket" WHERE (key, "window") IN (SELECT key, "window" FROM "RateBucket" WHERE "window" < ${recent} LIMIT 2000)`,
    db.$executeRaw`DELETE FROM "OperationMinute" WHERE (operation, minute, outcome) IN (SELECT operation, minute, outcome FROM "OperationMinute" WHERE minute < ${auditCutoff} LIMIT 2000)`,
    db.$executeRaw`DELETE FROM "PrivacyAudit" WHERE id IN (SELECT id FROM "PrivacyAudit" WHERE "createdAt" < ${auditCutoff} LIMIT 2000)`,
    db.$executeRaw`DELETE FROM "InferenceAttempt" WHERE id IN (SELECT id FROM "InferenceAttempt" WHERE "runId" IS NULL AND "createdAt" < ${auditCutoff} LIMIT 2000)`,
  ]);
  return { examined: candidates.length, erased, deferred };
}
