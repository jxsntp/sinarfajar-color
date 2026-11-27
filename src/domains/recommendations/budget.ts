import { db } from "@/lib/db";
import { lockCatalog } from "../catalog/service";
import { aiLimits } from "./settings";
import { ProviderFailure } from "./openrouter";
export async function reserveAttempt(
  organizationId: string,
  runId: string | null,
  estimate: number,
  runLimit?: number,
) {
  const c = aiLimits();
  return db.$transaction(async (tx) => {
    await lockCatalog(tx, organizationId);
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const [usage] = await tx.$queryRaw<
      { calls: number; daily: number; run: number }[]
    >`
      SELECT count(*) FILTER (WHERE "createdAt" >= ${start})::int AS calls,
        coalesce(sum(coalesce("costUsd","reservedUsd")) FILTER (WHERE "createdAt" >= ${start}),0)::float8 AS daily,
        coalesce(sum(coalesce("costUsd","reservedUsd")) FILTER (WHERE "runId" = ${runId}::uuid),0)::float8 AS run
      FROM "InferenceAttempt" WHERE "organizationId" = ${organizationId}::uuid AND ("createdAt" >= ${start} OR "runId" = ${runId}::uuid)`;
    const [lab] = await tx.$queryRaw<
      { calls: number; spend: number }[]
    >`SELECT count(*)::int AS calls, coalesce(sum(coalesce("costUsd","reservedUsd")),0)::float8 AS spend FROM "EvaluationResult" WHERE "organizationId"=${organizationId}::uuid AND "reservedUsd" IS NOT NULL AND "createdAt">=${start}`;
    if (usage.calls + lab.calls >= c.AI_DAILY_REQUESTS)
      throw new ProviderFailure("quota");
    if (
      usage.daily + lab.spend + estimate > c.AI_DAILY_USD ||
      usage.run + estimate > Math.min(c.AI_RUN_USD, runLimit ?? Infinity)
    )
      throw new ProviderFailure("cost_limit");
    return tx.inferenceAttempt.create({
      data: { runId, organizationId, reservedUsd: estimate },
      select: { id: true },
    });
  });
}
