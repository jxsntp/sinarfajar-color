import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { allow, type StaffScope } from "../authentication/access";
import {
  audit,
  lockCatalog,
  ownedStore,
  ProductCatalogService,
  snapshot,
} from "../catalog/service";
import { preferenceInput } from "../catalog/input";
import {
  aiLimits,
  checkSettings,
  providerEnabled,
  settingsSchema,
  type RankingSettings,
} from "./settings";
import { ProviderFailure, openRouterEngine, reservation } from "./openrouter";
import {
  rulesEngine,
  type RankingInput,
  type Ranking,
  type Usage,
} from "./engines";

const variant = z
  .object({
    model: z.string().min(1).max(120),
    provider: z.string().min(1).max(80),
    promptId: z.uuid().optional(),
  })
  .strict();
export const labCommand = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("prompt"),
      name: z.string().regex(/^[a-z0-9-]{3,60}$/),
      template: z.string().trim().min(12).max(2000),
    })
    .strict(),
  z
    .object({
      action: z.literal("case"),
      storeId: z.uuid(),
      name: z.string().trim().min(3).max(100),
      preferences: preferenceInput,
      color: z.enum(["warm", "cool", "neutral"]).nullable().default(null),
      expectedSkus: z
        .array(z.string().regex(/^[A-Za-z0-9._-]{1,64}$/))
        .min(1)
        .max(24),
    })
    .strict(),
  z
    .object({
      action: z.literal("compare"),
      caseId: z.uuid(),
      batchId: z.uuid(),
      variants: z.array(variant).max(3),
    })
    .strict(),
]);
const profile = z.object({
  preferences: preferenceInput,
  color: z.enum(["warm", "cool", "neutral"]).nullable(),
});
export async function evaluationHistory(scope: StaffScope) {
  allow(scope, "lab");
  const organizationId = scope.organizationId;
  const rows = await db.evaluationResult.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      label: true,
      batchId: true,
      model: true,
      provider: true,
      status: true,
      schemaValid: true,
      invalidSkus: true,
      returnedSkus: true,
      relevantCount: true,
      outputCount: true,
      durationMs: true,
      inputTokens: true,
      outputTokens: true,
      costUsd: true,
      fallback: true,
      prompt: { select: { name: true, version: true } },
      evaluationCase: { select: { name: true } },
    },
  });
  return rows.map((r) => ({ ...r, costUsd: r.costUsd?.toFixed(8) ?? null }));
}
export async function labOperation(
  scope: StaffScope,
  input: z.output<typeof labCommand>,
  transport: typeof fetch = fetch,
) {
  allow(scope, "lab");
  const organizationId = scope.organizationId;
  if (input.action === "prompt")
    return db.$transaction(async (tx) => {
      await lockCatalog(tx, organizationId);
      const previous = await tx.promptVersion.findFirst({
        where: { organizationId, name: input.name },
        orderBy: { version: "desc" },
      });
      const row = await tx.promptVersion.create({
        data: {
          organizationId,
          name: input.name,
          version: (previous?.version ?? 0) + 1,
          template: input.template,
        },
      });
      await audit(tx, scope, "prompt", "publish", null, {
        id: row.id,
        name: row.name,
        version: row.version,
      });
      return { id: row.id };
    });
  if (input.action === "case") {
    const store = await ownedStore(db, scope, input.storeId);
    const expectedSkus = [...new Set(input.expectedSkus)];
    const available = await new ProductCatalogService().eligible(
      store,
      input.preferences,
      expectedSkus,
    );
    if (available.length !== expectedSkus.length)
      throw new HttpError(400, "expected_sku_not_eligible");
    return db.evaluationCase.create({
      data: {
        organizationId,
        storeId: store.storeId,
        name: input.name,
        profile: snapshot({
          preferences: input.preferences,
          color: input.color,
        }),
        expectedSkus,
        reviewerId: scope.userId,
      },
      select: { id: true },
    });
  }
  const testCase = await db.evaluationCase.findFirst({
    where: { organizationId, id: input.caseId },
  });
  if (!testCase) throw new HttpError(404, "evaluation_case_unavailable");
  const store = await ownedStore(db, scope, testCase.storeId);
  const org = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { rankingSettings: true },
  });
  const settings = settingsSchema.parse(org.rankingSettings);
  const { preferences, color } = profile.parse(testCase.profile);
  const candidates = await new ProductCatalogService().eligible(
    store,
    preferences,
    undefined,
    settings.candidateLimit,
  );
  if (!candidates.length)
    throw new HttpError(409, "evaluation_candidates_unavailable");
  const rankingInput = {
    preferences,
    color,
    candidates,
    weights: settings.weights,
  };
  const results = await db.$transaction(async (tx) => {
    await lockCatalog(tx, organizationId);
    const prior = await tx.evaluationResult.findFirst({
      where: { organizationId, batchId: input.batchId },
    });
    if (prior) {
      if (prior.caseId !== input.caseId)
        throw new HttpError(409, "evaluation_batch_conflict");
      return [];
    }
    const configurations = [null, ...input.variants];
    const records = [];
    for (const [index, variant] of configurations.entries()) {
      const selection: RankingSettings = {
        ...settings,
        ...(variant ?? {}),
        strategy: variant ? "openrouter" : "rules",
      };
      if (variant) checkSettings(selection);
      const promptId =
        variant?.promptId ?? (variant ? settings.promptId : null);
      const prompt = promptId
        ? await tx.promptVersion.findFirst({
            where: { organizationId, id: promptId },
          })
        : null;
      if (promptId && !prompt) throw new HttpError(404, "prompt_unavailable");
      const result = await tx.evaluationResult.create({
        data: {
          organizationId,
          caseId: testCase.id,
          batchId: input.batchId,
          promptId: prompt?.id,
          label: variant ? "Model " + index : "Rules",
          model: variant?.model,
          provider: variant?.provider,
          candidates: candidates.map((e) => e.sku),
          configuration: snapshot(selection),
        },
      });
      records.push({ id: result.id, selection, template: prompt?.template });
    }
    return records;
  });
  for (const result of results)
    await finishEvaluation(
      organizationId,
      result,
      rankingInput,
      testCase.expectedSkus,
      transport,
    );
  return {
    batchId: input.batchId,
    results: (await evaluationHistory(scope)).filter(
      (r) => r.batchId === input.batchId,
    ),
  };
}

async function finishEvaluation(
  organizationId: string,
  record: { id: string; selection: RankingSettings; template?: string },
  input: RankingInput,
  expected: string[],
  transport: typeof fetch,
) {
  const start = Date.now();
  const paid = record.selection.strategy === "openrouter";
  let items: Ranking,
    usage: Usage | undefined,
    failure: ProviderFailure | undefined,
    schemaValid: boolean | undefined,
    invalidSkus: number | undefined,
    returnedSkus: number | undefined;
  try {
    if (paid) {
      if (!providerEnabled()) throw new ProviderFailure("provider_unconfigured");
      if (!aiLimits().OPENROUTER_API_KEY)
        throw new ProviderFailure("provider_unconfigured");
      await reserveLab(
        organizationId,
        record.id,
        reservation(input, record.selection, record.template),
        record.selection.runLimitUsd,
      );
      const result = await openRouterEngine(
        record.selection,
        transport,
        record.template,
      ).rank(input);
      items = result.items;
      usage = result.usage;
      schemaValid = true;
      invalidSkus = 0;
      returnedSkus = items.length;
    } else items = (await rulesEngine.rank(input)).items;
  } catch (error) {
    if (!(error instanceof ProviderFailure)) throw error;
    failure = error;
    usage = error.usage;
    schemaValid = error.validation?.schemaValid;
    invalidSkus = error.validation?.invalidSkus;
    returnedSkus = error.validation?.returnedSkus;
    items = (await rulesEngine.rank(input)).items;
  }
  const usableExpected = expected.some((sku) =>
    input.candidates.some((p) => p.sku === sku),
  );
  await db.evaluationResult.update({
    where: { id: record.id, organizationId },
    data: {
      status: failure?.category ?? "complete",
      schemaValid,
      invalidSkus,
      returnedSkus,
      fallback: !!failure,
      ranking: snapshot(items),
      relevantCount: usableExpected
        ? items.filter((r) => expected.includes(r.sku)).length
        : null,
      outputCount: items.length,
      durationMs: Date.now() - start,
      inputTokens: usage?.input,
      outputTokens: usage?.output,
      costUsd: usage?.cost ?? (!paid ? 0 : undefined),
    },
  });
}
async function reserveLab(
  organizationId: string,
  id: string,
  estimate: number,
  runLimit?: number,
) {
  const c = aiLimits();
  await db.$transaction(async (tx) => {
    await lockCatalog(tx, organizationId);
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    const [row] = await tx.$queryRaw<{ calls: number; spend: number }[]>`
      SELECT count(*)::int AS calls, coalesce(sum(amount),0)::float8 AS spend FROM (
        SELECT coalesce("costUsd","reservedUsd") AS amount FROM "InferenceAttempt" WHERE "organizationId"=${organizationId}::uuid AND "createdAt">=${day}
        UNION ALL SELECT coalesce("costUsd","reservedUsd") FROM "EvaluationResult" WHERE "organizationId"=${organizationId}::uuid AND "reservedUsd" IS NOT NULL AND "createdAt">=${day}
      ) charges`;
    if (row.calls >= c.AI_DAILY_REQUESTS) throw new ProviderFailure("quota");
    if (
      row.spend + estimate > c.AI_DAILY_USD ||
      estimate > Math.min(c.AI_RUN_USD, runLimit ?? Infinity)
    )
      throw new ProviderFailure("cost_limit");
    await tx.evaluationResult.update({
      where: { id, organizationId },
      data: { reservedUsd: estimate },
    });
  });
}
