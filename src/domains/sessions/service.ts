import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { env, reportOrigin } from "@/lib/env";
import { issue, digest } from "@/lib/credentials";
import { HttpError } from "@/lib/http";
import { storeFilter, allow, type StaffScope } from "../authentication/access";
import { writeEvent } from "../analytics/events";
import { assignExperiment } from "../experiments/assign";
import { cameraNotice, stationFor } from "../color-analysis/stations";
import { resultInput } from "../color-analysis/result";
import { colorStyles } from "../color-analysis/swatches";
import { metalChoices } from "../color-analysis/draping";
import { resolveColorResult } from "../color-analysis/report-result";

export async function startSession(deviceKey: string) {
  const deviceHash = digest(deviceKey, "device");
  const credential = issue("kiosk");
  const expiresAt = new Date(Date.now() + env().KIOSK_SESSION_MINUTES * 60000);
  return db.$transaction(async (tx) => {
    const [device] = await tx.$queryRaw<
      { id: string; organizationId: string; storeId: string }[]
    >`
      SELECT id, "organizationId", "storeId" FROM "Device" WHERE "keyHash" = ${deviceHash} AND kind = 'KIOSK' AND "revokedAt" IS NULL AND "expiresAt" > now() FOR UPDATE`;
    if (!device) throw new HttpError(401, "invalid_device");
    // A device serves one customer at a time, including after a browser restart.
    await tx.customerSession.updateMany({
      where: {
        organizationId: device.organizationId,
        deviceId: device.id,
        endedAt: null,
      },
      data: { endedAt: new Date(), kioskKeyHash: null },
    });
    const now = new Date();
    await tx.device.update({ where: { id: device.id }, data: { lastSeenAt: now } });
    const campaign = await tx.analyticsCampaign.findFirst({
      where: {
        organizationId: device.organizationId,
        storeId: device.storeId,
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      select: { id: true },
    });
    const session = await tx.customerSession.create({
      data: {
        organizationId: device.organizationId,
        storeId: device.storeId,
        deviceId: device.id,
        kioskKeyHash: digest(credential, "kiosk"),
        expiresAt,
        campaignId: campaign?.id,
      },
    });
    const assignment = await assignExperiment(tx, session, "kiosk-reveal", [
      "palette-first",
      "metals-first",
    ]);
    await writeEvent(tx, session, "KIOSK", {
      id: randomUUID(),
      name: "kiosk_session_started",
      occurredAt: new Date(),
    });
    return {
      sessionId: session.id,
      credential,
      expiresAt,
      variant: assignment?.variant ?? "palette-first",
      station: stationFor(device.id),
      cameraNotice,
    };
  });
}
export async function kioskScope(tx: Prisma.TransactionClient, token: string) {
  const key = digest(token, "kiosk");
  const [session] = await tx.$queryRaw<
    { id: string; organizationId: string; storeId: string; deviceId: string }[]
  >`
    SELECT s.id, s."organizationId", s."storeId", s."deviceId" FROM "CustomerSession" s
    JOIN "Device" d ON d.id = s."deviceId" AND d."organizationId" = s."organizationId"
    WHERE s."kioskKeyHash" = ${key} AND s."endedAt" IS NULL AND s."expiresAt" > now() AND d."revokedAt" IS NULL AND d."expiresAt" > now() FOR UPDATE OF s`;
  if (!session) throw new HttpError(401, "invalid_kiosk_session");
  return session;
}
export async function resetSession(token: string) {
  return db.$transaction(async (tx) => {
    const session = await kioskScope(tx, token);
    await tx.customerSession.update({
      where: {
        organizationId_id: {
          organizationId: session.organizationId,
          id: session.id,
        },
      },
      data: { kioskKeyHash: null, endedAt: new Date() },
    });
    return { reset: true };
  });
}
export const paletteInput = z
  .object({
    assisted: z.boolean().optional(),
    reportCredential: z
      .string()
      .regex(/^report_[A-Za-z0-9_-]{43}$/)
      .optional(),
    cameraConsentId: z.uuid().optional(),
    quality: z
      .enum([
        "manual",
        "ready",
        "dark",
        "bright",
        "uneven",
        "unavailable",
        "unchecked",
      ])
      .optional(),
    profile: z.enum(["warm", "cool", "neutral", "uncertain"]),
    palette: z
      .array(z.string().regex(/^#[0-9a-f]{6}$/i))
      .min(1)
      .max(8),
  })
  .strict();
const versionedReportInput = z.object({
  result: resultInput,
  style: z.enum(colorStyles).optional(),
  /** The metal chosen in the comparison's first step. */
  metal: z.enum(metalChoices).optional(),
  /** Whether the comparison confirmed the camera trial's picks. Only with the local trial. */
  check: z.enum(["confirmed", "split", "overruled"]).optional(),
  assisted: paletteInput.shape.assisted,
  reportCredential: paletteInput.shape.reportCredential,
  cameraConsentId: paletteInput.shape.cameraConsentId,
}).strict();
export const reportInput = z.union([versionedReportInput, paletteInput]);
export async function issueReport(
  token: string,
  input: z.infer<typeof reportInput>,
  host?: string | null,
) {
  if (!env().ENABLE_MOBILE_REPORTS)
    throw new HttpError(503, "reports_disabled");
  const { assisted, reportCredential, cameraConsentId } = input;
  const quality = "result" in input ? "manual" : input.quality ?? "manual";
  const credential = reportCredential ?? issue("report");
  const tokenHash = digest(credential, "report");
  const origin = reportOrigin();
  const expiresAt = new Date(Date.now() + env().REPORT_TTL_DAYS * 86400000);
  return db.$transaction(async (tx) => {
    const session = await kioskScope(tx, token);
    const scope = {
      sessionId: session.id,
      organizationId: session.organizationId,
    };
    const existing = await tx.mobileReportToken.findUnique({
      where: { organizationId_sessionId: scope },
    });
    const reportPath = "/results/" + credential;
    if (
      existing?.tokenHash === tokenHash &&
      !existing.revokedAt &&
      existing.expiresAt > new Date()
    ) {
      return {
        reportPath,
        reportUrl: origin + reportPath,
        expiresAt: existing.expiresAt,
      };
    }
    if (existing) throw new HttpError(409, "report_already_issued");
    if (cameraConsentId) {
      const consent = await tx.consent.findFirst({
        where: { ...scope, id: cameraConsentId, purpose: "local_camera" },
      });
      if (
        !consent ||
        (!consent.granted && !["manual", "unavailable"].includes(quality))
      )
        throw new HttpError(400, "invalid_camera_consent");
    } else if (quality !== "manual")
      throw new HttpError(400, "camera_consent_required");
    if (assisted !== undefined)
      await tx.customerSession.update({
        where: { id: session.id },
        data: { assisted },
      });
    const analysis = "result" in input ? await resolveColorResult(tx, session, input.result, cameraConsentId, host, input.style, input.metal, input.check) : {
      profile: input.profile, palette: input.palette, source: "MANUAL" as const,
      methodVersion: "manual-draping-v2", quality, uncertain: input.profile === "uncertain",
    };
    await tx.colorAnalysis.create({ data: { ...scope, ...analysis, cameraConsentId } });
    await tx.mobileReportToken.create({
      data: { ...scope, tokenHash, expiresAt },
    });
    await writeEvent(tx, session, "KIOSK", {
      id: randomUUID(),
      name: "color_analysis_completed",
      occurredAt: new Date(),
    });
    return { reportPath, reportUrl: origin + reportPath, expiresAt };
  });
}
export async function recoverReport(token: string) {
  if (!env().ENABLE_MOBILE_REPORTS) throw new HttpError(503, "reports_disabled");
  const origin = reportOrigin();
  return db.$transaction(async (tx) => {
    const session = await kioskScope(tx, token);
    const credential = issue("report");
    const [row] = await tx.$queryRaw<{ expiresAt: Date }[]>`
      UPDATE "MobileReportToken" SET "tokenHash" = ${digest(credential, "report")}, "updatedAt" = now()
      WHERE "organizationId" = ${session.organizationId}::uuid AND "sessionId" = ${session.id}::uuid
        AND "handedOffAt" IS NULL AND "revokedAt" IS NULL AND "expiresAt" > now()
      RETURNING "expiresAt"`;
    if (!row) throw new HttpError(409, "report_recovery_unavailable");
    const reportPath = "/results/" + credential;
    return { reportPath, reportUrl: origin + reportPath, expiresAt: row.expiresAt };
  });
}

export async function markHandoff(
  tx: Prisma.TransactionClient,
  session: { organizationId: string; id: string },
  token?: string,
) {
  const where = {
    organizationId: session.organizationId, sessionId: session.id,
    revokedAt: null, expiresAt: { gt: new Date() },
    ...(token ? { tokenHash: digest(token, "report") } : {}),
  };
  const result = await tx.mobileReportToken.updateMany({
    where: { ...where, handedOffAt: null }, data: { handedOffAt: new Date() },
  });
  return result.count > 0 || !!(await tx.mobileReportToken.findFirst({ where, select: { id: true } }));
}

export async function reportScope(
  token: string,
  tx: Prisma.TransactionClient = db,
) {
  const where = { tokenHash: digest(token, "report"), revokedAt: null, expiresAt: { gt: new Date() } };
  const row = await tx.mobileReportToken.findFirst({
    where,
    select: {
      handedOffAt: true,
      session: {
        select: {
          id: true,
          organizationId: true,
          storeId: true,
          deviceId: true,
        },
      },
    },
  });
  if (!row) throw new HttpError(401, "invalid_report");
  if (!row.handedOffAt) {
    if (tx !== db) {
      await tx.$queryRaw`SELECT id FROM "CustomerSession" WHERE id = ${row.session.id}::uuid
        AND "organizationId" = ${row.session.organizationId}::uuid FOR NO KEY UPDATE`;
    }
    const updated = await tx.mobileReportToken.updateMany({
      where: { ...where, handedOffAt: null }, data: { handedOffAt: new Date() },
    });
    if (!updated.count && !(await tx.mobileReportToken.findFirst({ where, select: { id: true } })))
      throw new HttpError(401, "invalid_report");
  }
  return row.session;
}
export async function revokeReport(scope: StaffScope, sessionId: string) {
  allow(scope, "admin");
  const result = await db.mobileReportToken.updateMany({
    where: {
      organizationId: scope.organizationId,
      sessionId,
      session: storeFilter(scope),
    },
    data: { revokedAt: new Date() },
  });
  if (!result.count) throw new HttpError(404, "unknown_report");
  return { revoked: true };
}
