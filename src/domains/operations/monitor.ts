import { db } from "@/lib/db";
import { env } from "@/lib/env";

async function probeDatabase(clientSlug: string) {
  const [state] = await db.$queryRaw<{ organization: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM "Organization" WHERE "slug" = ${clientSlug}) AS organization,
           EXISTS (SELECT 1 FROM "Inventory") AS inventory,
           EXISTS (SELECT 1 FROM "PhotoCatalogItem") AS photo_catalog
  `;
  if (!state?.organization) throw new Error("organization_not_configured");
}

export async function readinessResponse(probe: (clientSlug: string) => Promise<unknown> = probeDatabase) {
  const headers = { "Cache-Control": "no-store" };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { CLIENT_SLUG } = env();
    await Promise.race([
      probe(CLIENT_SLUG),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("database_timeout")), 2000); }),
    ]);
    return Response.json({ status: "ready" }, { headers });
  } catch {
    return Response.json({ status: "unavailable" }, { headers, status: 503 });
  } finally {
    clearTimeout(timer);
  }
}

export async function operationalSnapshot(now = new Date()) {
  const from = new Date(now.getTime() - 86400000);
  const stale = new Date(now.getTime() - 5 * 60000);
  const [funnel, runs, attempts, devices, api] = await Promise.all([
    db.$queryRaw<{
      qrGenerated: number; qrDisplayed: number; humanReportOpens: number;
      activations: number; impressions: number; clicks: number; lateEvents: number;
    }[]>`
      SELECT (SELECT count(*)::int FROM "MobileReportToken" WHERE "createdAt" >= ${from}) AS "qrGenerated",
        count(DISTINCT "sessionId") FILTER (WHERE name = 'qr_displayed')::int AS "qrDisplayed",
        count(DISTINCT "sessionId") FILTER (WHERE name = 'mobile_report_opened')::int AS "humanReportOpens",
        count(DISTINCT "sessionId") FILTER (WHERE name = 'recommendation_requested')::int AS activations,
        count(*) FILTER (WHERE name = 'recommendation_impression')::int AS impressions,
        count(*) FILTER (WHERE name = 'recommended_product_clicked')::int AS clicks,
        count(*) FILTER (WHERE "createdAt" - "occurredAt" > interval '5 minutes')::int AS "lateEvents"
      FROM "InteractionEvent" WHERE "createdAt" >= ${from}`,
    db.$queryRaw<{ complete: number; interrupted: number; fallbacks: number; openRouterP95Ms: number | null }[]>`
      SELECT count(*) FILTER (WHERE status = 'COMPLETE')::int AS complete,
        count(*) FILTER (WHERE status = 'PENDING' AND "createdAt" < ${new Date(now.getTime() - 45000)})::int AS interrupted,
        count(*) FILTER (WHERE fallback)::int AS fallbacks,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY "latencyMs")
          FILTER (WHERE strategy = 'openrouter' AND status = 'COMPLETE')::float8 AS "openRouterP95Ms"
      FROM "RecommendationRun" WHERE "createdAt" >= ${from}`,
    db.$queryRaw<{ providerAttempts: number; reservedOrActualUsd: string; reportedUsd: string; unknownCost: number; missingActivation: number; labReservedOrActualUsd: string }[]>`
      SELECT count(*)::int AS "providerAttempts",
        coalesce(sum(coalesce(a."costUsd",a."reservedUsd")),0)::text AS "reservedOrActualUsd",
        coalesce(sum(a."costUsd"),0)::text AS "reportedUsd",
        count(*) FILTER (WHERE a."costUsd" IS NULL)::int AS "unknownCost",
        (SELECT coalesce(sum(coalesce("costUsd","reservedUsd")),0)::text FROM "EvaluationResult"
          WHERE "createdAt" >= ${from} AND "reservedUsd" IS NOT NULL) AS "labReservedOrActualUsd",
        count(*) FILTER (WHERE a."runId" IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM "InteractionEvent" e WHERE e."organizationId" = r."organizationId"
           AND e."sessionId" = r."sessionId" AND e."runId" = r.id AND e.name = 'recommendation_requested'
           AND e."createdAt" <= a."createdAt"
        ))::int AS "missingActivation"
      FROM "InferenceAttempt" a LEFT JOIN "RecommendationRun" r ON a."runId" = r.id
      WHERE a."createdAt" >= ${from}`,
    db.$queryRaw<{ activeKiosks: number; staleKiosks: number }[]>`
      SELECT count(*)::int AS "activeKiosks",
        count(*) FILTER (WHERE "lastSeenAt" IS NULL OR "lastSeenAt" < ${stale})::int AS "staleKiosks"
      FROM "Device" WHERE kind = 'KIOSK' AND "revokedAt" IS NULL AND "expiresAt" > ${now}`,
    db.$queryRaw<{ succeeded: number; failed: number; throttled: number; qrIssuanceErrors: number }[]>`
      SELECT coalesce(sum(count) FILTER (WHERE outcome = 'success'),0)::int AS succeeded,
        coalesce(sum(count) FILTER (WHERE outcome = 'failure'),0)::int AS failed,
        coalesce(sum(count) FILTER (WHERE outcome = 'throttled'),0)::int AS throttled,
        coalesce(sum(count) FILTER (WHERE operation = 'kiosk.report' AND outcome = 'failure'),0)::int AS "qrIssuanceErrors"
      FROM "OperationMinute" WHERE minute >= ${from}`,
  ]);
  const f = funnel[0], r = runs[0], a = attempts[0], d = devices[0], o = api[0];
  const checks = {
    preActivationInference: a.missingActivation > 0,
    latency: (r.openRouterP95Ms ?? 0) >= 5000,
    spending: Number(a.reservedOrActualUsd) + Number(a.labReservedOrActualUsd) >= env().MONITOR_DAILY_USD,
    qrIssuance: o.qrIssuanceErrors > 0,
    incompleteRecommendations: r.interrupted > 0,
    fallbackFrequency: r.complete >= 10 && r.fallbacks / r.complete >= 0.25,
    deviceConnectivity: d.staleKiosks > 0,
    eventDelivery: f.lateEvents >= 5,
    applicationErrors: o.failed >= 3,
  };
  return {
    from, through: now, ...f,
    productCtr: f.impressions ? f.clicks / f.impressions : null,
    ...r, ...a, ...d, ...o, checks,
  };
}
