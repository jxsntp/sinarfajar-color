import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { readTrial } from "../color-analysis/result";
import { isRegistered } from "../sessions/registration";
import { reportScope } from "../sessions/service";
import { ProductCatalogService, snapshot, type Tx } from "../catalog/service";
import { preferenceInput, type Preferences } from "../catalog/input";
import { writeEvent, type SessionScope } from "../analytics/events";
import {
  evidence,
  groundedReason,
  rulesEngine,
  selectCandidates,
  type Ranking,
  type Usage,
} from "./engines";
import {
  aiLimits,
  approvedModels,
  providerEnabled,
  settingsSchema,
  type RankingSettings,
} from "./settings";
import {
  instruction,
  openRouterEngine,
  promptLabel,
  ProviderFailure,
  reservation,
} from "./openrouter";
import { reserveAttempt } from "./budget";
import { resolvePaletteContext, storedPalette } from "./palette-evidence";
import { loadPhotoCandidates, photoInstruction, photoPromptLabel, photoRankingRequest, photoShortlist, readPhotoPicks, rulePhotoPicks } from "./photo-picks";
import {
  assignExperiment,
  experimentPlan,
  mobileAssignment,
} from "../experiments/assign";



const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const discoveryWriteOptions = { timeout: 15_000 };
async function event(
  tx: Tx,
  session: SessionScope,
  name: string,
  runId: string,
) {
  return writeEvent(tx, session, "MOBILE", {
    id: randomUUID(),
    occurredAt: new Date(),
    name,
    runId,
  });
}
async function prepare(token: string, key: string, requested: Preferences) {
  return db.$transaction(async (tx) => {
    const session = await reportScope(token, tx);
    const organizationId = session.organizationId,
      sessionId = session.id;
    const scope = { organizationId, sessionId };
    await tx.$queryRaw`SELECT id FROM "CustomerSession" WHERE id = ${sessionId}::uuid AND "organizationId" = ${organizationId}::uuid FOR UPDATE`;
    // Hold a shared revision lock only while selecting the bounded pool, never through inference.
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId}::uuid FOR SHARE`;
    const org = await tx.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    const analysis = await tx.colorAnalysis.findUnique({
      where: { organizationId_sessionId: scope },
    });
    const trial = readTrial(analysis?.paletteSnapshot);
    if (trial && !(await isRegistered(session, tx))) throw new HttpError(403, "registration_required");
    const prefs: Preferences = trial ? { preferredGold: trial.gold } : requested;
    const preferenceHash = hash(prefs);
    const palette = resolvePaletteContext(prefs, analysis);
    const photoCandidates = trial ? await photoShortlist(tx, session, prefs, palette) : [];
    const photoMode = photoCandidates.length > 0;
    const plan = photoMode ? null : await experimentPlan(tx, organizationId, "mobile-ranking");
    let assignment = photoMode ? null : await mobileAssignment(tx, session);
    const settings = settingsSchema.parse(
      assignment?.experiment.rankingSnapshot ?? plan?.rankingSnapshot ?? org.rankingSettings,
    );
    const candidates = photoMode ? [] : await selectCandidates(
      new ProductCatalogService(tx).eligiblePages(session, prefs),
      { preferences: prefs, palette, color: null, weights: settings.weights },
      settings.candidateLimit ?? 24,
    );
    const approved = approvedModels();
    if (
      !assignment &&
      candidates.length &&
      (plan?.state === "RUNNING" ||
        (!plan && settings.strategy === "openrouter")) &&
      providerEnabled() &&
      approved.models.includes(settings.model) &&
      approved.providers.includes(settings.provider) &&
      process.env.ENABLE_MOBILE_EXPERIMENT !== "false"
    ) {
      assignment = await assignExperiment(tx, session, "mobile-ranking", [
        "rules",
        "openrouter",
      ]);
    }
    if (assignment?.variant === "C") settings.strategy = "openrouter";
    else if (
      ["B", "rules"].includes(assignment?.variant ?? "") ||
      (plan && !assignment)
    )
      settings.strategy = "rules";
    const chosenPrompt = !photoMode && settings.promptId
      ? await tx.promptVersion.findFirstOrThrow({
          where: { organizationId, id: settings.promptId },
        })
      : null;
    const selectedPromptLabel = photoMode ? photoPromptLabel
      : chosenPrompt ? chosenPrompt.name + "-v" + chosenPrompt.version : promptLabel;
    const fingerprint = hash([
      prefs,
      palette,
      settings,
      org.catalogVersion,
      selectedPromptLabel,
      assignment?.id,
      ...(palette?.categoryCoverage ? [candidates.map(({ sku }) => sku)] : []),
      ...(photoMode ? [photoCandidates] : []),
    ]);
    const existingKey = await tx.activationRequest.findUnique({
      where: { organizationId_sessionId_key: { ...scope, key } },
      include: { run: true },
    });
    if (existingKey && existingKey.preferenceHash !== preferenceHash)
      throw new HttpError(409, "idempotency_key_reused");
    let run =
      existingKey?.run ??
      (await tx.recommendationRun.findUnique({
        where: {
          organizationId_sessionId_fingerprint: { ...scope, fingerprint },
        },
      }));
    const owner = !run;
    if (!run) {
      if (
        (await tx.recommendationRun.count({
          where: { ...scope, fingerprint: { not: null } },
        })) >= 8
      )
        throw new HttpError(429, "alternatives_limit");
      const promptKey = photoMode
        ? { organizationId, name: "photo-catalog", version: 1 }
        : { organizationId, name: "catalog-ranking", version: 2 };
      const prompt =
        chosenPrompt ??
        (await tx.promptVersion.upsert({
          where: { organizationId_name_version: promptKey },
          create: { ...promptKey, template: photoMode ? photoInstruction : instruction },
          update: {},
        }));
      const modelKey = {
        organizationId,
        provider: settings.provider,
        model: settings.model,
      };
      const model =
        settings.strategy === "openrouter"
          ? await tx.aIModelConfig.upsert({
              where: { organizationId_provider_model: modelKey },
              create: { ...modelKey, enabled: true },
              update: {},
            })
          : null;
      run = await tx.recommendationRun.create({
        data: {
          ...scope,
          status: "PENDING",
          fingerprint,
          preferences: snapshot(prefs),
          ...(palette ? { colorContext: snapshot(palette) } : {}),
          strategy: settings.strategy,
          assignedStrategy: settings.strategy,
          candidateSkus: candidates.map((c) => c.sku),
          photoCandidateIds: photoCandidates.map(({ id }) => id),
          catalogVersion: org.catalogVersion,
          modelConfigId: model?.id,
          modelIdentifier: model?.model,
          providerName: model?.provider,
          promptVersionId: prompt.id,
          promptLabel: selectedPromptLabel,
          variant: assignment?.variant,
        },
      });
      const fields = {
        style: prefs.style ?? null,
        occasion: prefs.occasion ?? null,
        category: prefs.category ?? null,
        maxBudget: prefs.maxBudget ?? null,
      };
      await tx.customerPreference.upsert({
        where: { organizationId_sessionId: scope },
        create: { ...scope, ...fields },
        update: fields,
      });
      if (photoMode) await event(tx, session, "photo_recommendation_requested", run.id);
      else {
        await event(tx, session, "mobile_preferences_completed", run.id);
        await event(tx, session, "recommendation_requested", run.id);
      }
    }
    if (!existingKey)
      await tx.activationRequest.create({
        data: { ...scope, key, preferenceHash, runId: run.id },
      });
    return {
      session,
      run,
      owner,
      settings,
      prefs,
      palette: storedPalette(run.colorContext),
      template: chosenPrompt?.template,
    };
  }, discoveryWriteOptions);
}
async function paidRank<T>(
  organizationId: string,
  runId: string,
  settings: RankingSettings,
  estimate: number,
  rank: () => Promise<{ items: T; usage?: Usage }>,
) {
  const limits = aiLimits();
  if (!providerEnabled())
    throw new ProviderFailure("provider_unconfigured");
  for (let n = 1; n <= limits.AI_MAX_ATTEMPTS; n++) {
    const attempt = await reserveAttempt(
      organizationId,
      runId,
      estimate,
      settings.runLimitUsd,
    );
    let result;
    try {
      result = await rank();
    } catch (err) {
      const failure =
        err instanceof ProviderFailure
          ? err
          : new ProviderFailure("provider_error");
      const u = failure.usage;
      await db.inferenceAttempt.update({
        where: { id: attempt.id, organizationId },
        data: {
          outcome: failure.category,
          inputTokens: u?.input,
          outputTokens: u?.output,
          costUsd:
            u?.cost ??
            (failure.category === "rate_limited" ||
            failure.category === "routing_denied"
              ? 0
              : null),
        },
      });
      if (failure.category === "rate_limited" && n < limits.AI_MAX_ATTEMPTS)
        continue;
      throw failure;
    }
    await db.inferenceAttempt.update({
      where: { id: attempt.id, organizationId },
      data: {
        outcome: "ok",
        inputTokens: result.usage?.input,
        outputTokens: result.usage?.output,
        costUsd: result.usage?.cost,
      },
    });
    return result.items;
  }
  throw new ProviderFailure("retry_limit");
}
export async function readResult(token: string, runId: string) {
  const session = await reportScope(token);
  const run = await db.recommendationRun.findFirst({
    where: {
      id: runId,
      organizationId: session.organizationId,
      sessionId: session.id,
    },
    include: {
      items: {
        orderBy: { rank: "asc" },
        include: { product: { select: { sku: true } } },
      },
    },
  });
  if (!run) throw new HttpError(404, "unknown_run");
  if (run.status !== "COMPLETE")
    return { status: "processing" as const, runId, items: [] };
  const prefs = preferenceInput.parse(run.preferences);
  const inventory = await new ProductCatalogService().eligible(
    session,
    prefs,
    run.items.map((i) => i.product.sku),
  );
  const palette = storedPalette(run.colorContext);
  const input = {
    preferences: prefs,
    candidates: inventory,
    color: null,
    palette,
    weights: settingsSchema.parse({}).weights,
  };
  const items = run.items.flatMap((item) => {
    const p = inventory.find((c) => c.sku === item.product.sku);
    if (!p) return [];
    const reasons = evidence(p, input).reasons;
    const { visibleColors: internalColors, ...publicProduct } = p;
    void internalColors;
    return [
      {
        ...publicProduct,
        rank: item.rank,
        reason: groundedReason(item.reason, reasons) ? item.reason : reasons[0],
      },
    ];
  });
  return {
    status: "complete" as const,
    runId,
    items,
    strategy: run.strategy,
    fallback: run.fallback,
    preferences: prefs,
    ...(run.photoCandidateIds.length ? { photoItems: await readPhotoPicks(db, session, run.photoPicks, prefs, palette) } : {}),
  };
}
export async function activate(
  token: string,
  key: string,
  requested: Preferences,
  transport: typeof fetch = fetch,
) {
  const { session, run, owner, settings, palette, template, prefs } = await prepare(token, key, requested);
  const age = Date.now() - run.createdAt.getTime();
  if (run.status === "COMPLETE" || (!owner && age < 45000))
    return readResult(token, run.id);
  const photoMode = run.photoCandidateIds.length > 0;
  const photos = await loadPhotoCandidates(db, session, run.photoCandidateIds, prefs, palette);
  const candidates = photoMode ? [] : await new ProductCatalogService().eligible(
    session,
    prefs,
    run.candidateSkus,
  );
  const input = {
    candidates,
    preferences: prefs,
    weights: settings.weights,
    color: null,
    palette,
  };
  let strategy = "rules",
    failure: string | null = null;
  let ranked: Ranking = [];
  let photoPicks = photoMode ? rulePhotoPicks(photos) : [];
  if (owner && run.assignedStrategy === "openrouter" && (candidates.length || photos.length)) {
    try {
      if (photoMode) {
        const request = photoRankingRequest(photos, settings);
        photoPicks = await paidRank(session.organizationId, run.id, settings, request.estimate, () => request.rank(transport));
      } else {
        const engine = openRouterEngine(settings, transport, template);
        ranked = await paidRank(session.organizationId, run.id, settings,
          reservation(input, settings, template), () => engine.rank(input));
      }
      strategy = "openrouter";
    } catch (err) {
      if (!(err instanceof ProviderFailure)) throw err;
      failure = err.category;
    }
  } else if (!owner) failure = "interrupted";
  if (!photoMode && strategy === "rules") ranked = (await rulesEngine.rank(input)).items;
  await db.$transaction(async (tx) => {
    const [state] = await tx.$queryRaw<
      { status: string }[]
    >`SELECT status FROM "RecommendationRun" WHERE id = ${run.id}::uuid AND "organizationId" = ${session.organizationId}::uuid FOR NO KEY UPDATE`;
    if (!state) throw new HttpError(401, "invalid_report");
    if (state.status === "COMPLETE") return;
    const current = photoMode ? [] : await new ProductCatalogService(tx).eligible(
      session,
      prefs,
      ranked.map((r) => r.sku),
    );
    const items = ranked.flatMap((r) => {
      const product = current.find((p) => p.sku === r.sku);
      return product
        ? [
            {
              organizationId: session.organizationId,
              runId: run.id,
              productId: product.id,
              rank: r.rank,
              reason: groundedReason(r.reason, evidence(product, input).reasons)
                ? r.reason : evidence(product, input).reasons[0],
            },
          ]
        : [];
    });
    if (items.length) await tx.recommendationItem.createMany({ data: items });
    const published = photoMode ? await readPhotoPicks(tx, session, photoPicks, prefs, palette) : [];
    const publishedIds = new Set(published.map(({ id }) => id));
    const attempts = await tx.inferenceAttempt.findMany({
      where: { organizationId: session.organizationId, runId: run.id },
    });
    const sum = (field: "inputTokens" | "outputTokens") =>
      attempts.reduce((a, v) => a + (v[field] ?? 0), 0);
    const cost = attempts.some((a) => a.costUsd === null)
      ? null
      : attempts.reduce((a, v) => a + Number(v.costUsd), 0);
    await tx.recommendationRun.update({
      where: { id: run.id, organizationId: session.organizationId },
      data: {
        status: "COMPLETE",
        strategy,
        fallback: !!failure,
        failureCategory: failure,
        returnedRanking: snapshot(ranked),
        ...(photoMode ? { photoPicks: snapshot(photoPicks.filter(({ id }) => publishedIds.has(id))) } : {}),
        schemaValid:
          strategy === "openrouter"
            ? true
            : failure === "invalid_output"
              ? false
              : null,
        latencyMs: Date.now() - run.createdAt.getTime(),
        inputTokens: sum("inputTokens"),
        outputTokens: sum("outputTokens"),
        inferenceCost: cost,
      },
    });
    if (failure) await event(tx, session, photoMode ? "photo_recommendation_fallback" : "recommendation_fallback", run.id);
    const outcome = photoMode
      ? published.length ? "photo_recommendation_generated" : "photo_recommendation_no_matches"
      : items.length ? "recommendation_generated" : "recommendation_no_matches";
    await event(tx, session, outcome, run.id);
  }, discoveryWriteOptions);
  return readResult(token, run.id);
}
