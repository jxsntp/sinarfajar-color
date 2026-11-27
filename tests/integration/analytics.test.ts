import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { identity } from "../support/identity";
import { issue } from "@/lib/credentials";
import { registerDevice } from "@/domains/devices/service";
import { issueReport, startSession } from "@/domains/sessions/service";
import { configureExperiment } from "@/domains/experiments/configure";
import {
  analyticsReport,
  defaultFilters,
  dayStart,
} from "@/domains/analytics/report";
import { saveAnalyticsInput, financeReport } from "@/domains/analytics/inputs";
import {
  labOperation,
  evaluationHistory,
} from "@/domains/recommendations/evaluation";
import { activate } from "@/domains/recommendations/discovery";
import type { StaffScope } from "@/domains/authentication/access";

let staff: StaffScope, storeId: string, kiosk: string;
const sku = "REVIEW-01";
beforeAll(async () => {
  const org = await db.organization.create({
    data: { name: "Analytics test", slug: "analytics-" + randomUUID() },
  });
  const user = await identity(db, org.id);
  staff = {
    organizationId: org.id,
    userId: user.userId,
    storeId: null,
    role: "ORG_ADMIN",
  };
  storeId = (
    await db.store.create({
      data: { name: "Analytics fixture", organizationId: org.id, code: "QA" },
    })
  ).id;
  const brand = await db.brand.create({
    data: { organizationId: org.id, name: "Analytics brand" },
  });
  const product = await db.product.create({
    data: {
      organizationId: org.id,
      brandId: brand.id,
      sku,
      name: "Ring",
      category: "ring",
      goldColor: "yellow",
      purity: "18K",
    },
  });
  await db.inventory.create({
    data: {
      organizationId: org.id,
      storeId,
      productId: product.id,
      price: "1000.00",
      onHand: 5,
    },
  });
  kiosk = (await registerDevice(staff, storeId, "Analytics kiosk", "KIOSK"))
    .credential;
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => db.$disconnect());
it("starts, pauses, stops and preserves assigned kiosk sessions in the named opening cohort", async () => {
  const date = defaultFilters().to;
  const day = dayStart(date);
  const campaign = await saveAnalyticsInput(staff, {
    action: "campaign",
    storeId,
    label: "Opening verification",
    startsAt: day,
    endsAt: new Date(day.getTime() + 86400000),
  });
  await saveAnalyticsInput(staff, {
    action: "daily",
    storeId,
    day: date,
    campaignId: campaign.id,
    visitors: 10,
    verifiedContent: 2,
    sourceRef: "Approved count",
  });
  const plan = await configureExperiment(staff, {
    action: "create",
    name: "kiosk-reveal",
    primaryOutcome: "handoff",
    minimumPerArm: 10,
    observationDays: 1,
    protocol: "Comparable store staffing and placement.",
  });
  await configureExperiment(staff, { action: "start", id: plan.id });
  const first = await startSession(kiosk);
  await configureExperiment(staff, { action: "pause", id: plan.id });
  const second = await startSession(kiosk);
  await configureExperiment(staff, { action: "stop", id: plan.id });
  expect(
    await db.experimentAssignment.count({
      where: { experimentId: plan.id, sessionId: first.sessionId },
    }),
  ).toBe(1);
  expect(
    await db.experimentAssignment.count({
      where: { experimentId: plan.id, sessionId: second.sessionId },
    }),
  ).toBe(0);
  await db.interactionEvent.createMany({
    data: [
      "color_analysis_started",
      "color_result_viewed",
      "mobile_report_opened",
      "qr_displayed",
    ].map((name) => ({
      organizationId: staff.organizationId,
      sessionId: first.sessionId,
      name,
      channel: name === "mobile_report_opened" ? "MOBILE" : "KIOSK",
      occurredAt: new Date(),
    })),
  });
  const filter = {
    from: date,
    to: date,
    campaign: campaign.id,
    store: storeId,
  };
  const result = await analyticsReport(
    staff,
    filter,
    new Date(Date.now() + 2 * 86400000),
  );
  expect(result.cohort).toEqual({ opening: 2, ongoing: 0 });
  expect(result.metrics.find((m) => m.label === "Kiosk adoption")?.value).toBe(
    0.2,
  );
  expect(result.metrics.find((m) => m.label === "QR handoff")?.value).toBe(1);
  expect(
    result.experiments
      .find((e) => e.id === plan.id)
      ?.groups.reduce((sum, g) => sum + g.mature, 0),
  ).toBe(1);
  const marketing = { ...staff, role: "MARKETING_ANALYST" as const };
  expect(
    (await analyticsReport(marketing, filter)).metrics.some(
      (m) => m.unit === "USD" || m.unit === "IDR",
    ),
  ).toBe(false);
  await expect(financeReport(marketing, storeId)).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    analyticsReport(
      { ...staff, storeId, role: "STORE_MANAGER" },
      { ...filter, store: randomUUID() },
    ),
  ).rejects.toMatchObject({ status: 404 });
});
it("persists protocol B/C assignment after an explicit eligible activation", async () => {
  vi.stubEnv("OPENROUTER_MODELS", "test/model");
  vi.stubEnv("OPENROUTER_PROVIDERS", "TestProvider");
  vi.stubEnv("OPENROUTER_API_KEY", "fixture");
  await db.organization.update({
    where: { id: staff.organizationId },
    data: {
      rankingSettings: {
        strategy: "rules",
        model: "test/model",
        provider: "TestProvider",
      },
    },
  });
  const plan = await configureExperiment(staff, {
    action: "create",
    name: "mobile-ranking",
    primaryOutcome: "inquiry",
    minimumPerArm: 10,
    observationDays: 1,
    protocol: "Same inventory, UI and promotions for both arms.",
  });
  await configureExperiment(staff, { action: "start", id: plan.id });
  const session = await startSession(kiosk);
  const token = issue("report");
  await issueReport(session.credential, {
    profile: "neutral",
    palette: ["#eee000"],
    reportCredential: token,
  });
  expect(
    await db.experimentAssignment.count({
      where: { experimentId: plan.id, sessionId: session.sessionId },
    }),
  ).toBe(0);
  const mock = vi.fn(async () => new Response(null, { status: 503 }));
  const first = await activate(token, randomUUID(), { category: "ring" }, mock);
  const arm = await db.experimentAssignment.findFirstOrThrow({
    where: { experimentId: plan.id, sessionId: session.sessionId },
  });
  expect(["B", "C"]).toContain(arm.variant);
  await configureExperiment(staff, { action: "pause", id: plan.id });
  const again = await activate(
    token,
    randomUUID(),
    { category: "ring", preferredGold: "yellow" },
    mock,
  );
  expect(
    await db.experimentAssignment.count({
      where: { experimentId: plan.id, sessionId: session.sessionId },
    }),
  ).toBe(1);
  const runs = await db.recommendationRun.findMany({
    where: { id: { in: [first.runId, again.runId] } },
  });
  for (const run of runs)
    expect(run).toMatchObject({
      variant: arm.variant,
      assignedStrategy: arm.variant === "B" ? "rules" : "openrouter",
      strategy: "rules",
      fallback: arm.variant === "C",
    });
});
it("retains immutable prompts and compares reviewed cases with safe diagnostics", async () => {
  const reviewer = await labOperation(staff, {
    action: "case",
    storeId,
    name: "Reviewed ring",
    preferences: { category: "ring" },
    color: null,
    expectedSkus: [sku],
  });
  const prompt = await labOperation(staff, {
    action: "prompt",
    name: "fixture-guide",
    template: "Prioritize the supplied verified style evidence.",
  });
  if (!("id" in reviewer) || !("id" in prompt))
    throw new Error("Missing test records");
  await expect(
    db.promptVersion.update({
      where: { id: prompt.id },
      data: { template: "Unexpected modification" },
    }),
  ).rejects.toThrow();
  vi.stubEnv("OPENROUTER_MODELS", "test/model");
  vi.stubEnv("OPENROUTER_PROVIDERS", "TestProvider");
  vi.stubEnv("OPENROUTER_API_KEY", "fixture");
  const command = {
    action: "compare" as const,
    caseId: reviewer.id,
    batchId: randomUUID(),
    variants: [
      { model: "test/model", provider: "TestProvider", promptId: prompt.id },
    ],
  };
  const response = vi.fn(async () =>
    Response.json({
      usage: { prompt_tokens: 30, completion_tokens: 12, cost: 0.0002 },
      choices: [
        {
          message: {
            content: JSON.stringify({
              recommendations: [
                { sku: "UNKNOWN", rank: 1, reason: "A reason" },
              ],
            }),
          },
        },
      ],
    }),
  );
  await labOperation(staff, command, response);
  await labOperation(staff, command, response);
  expect(response).toHaveBeenCalledTimes(1);
  const rows = (await evaluationHistory(staff)).filter(
    (r) => r.batchId === command.batchId,
  );
  expect(rows.find((r) => r.label === "Rules")).toMatchObject({
    relevantCount: 1,
    outputCount: 1,
  });
  expect(rows.find((r) => r.label === "Model 1")).toMatchObject({
    schemaValid: true,
    invalidSkus: 1,
    returnedSkus: 1,
    status: "invalid_output",
    fallback: true,
    inputTokens: 30,
  });
  await expect(
    evaluationHistory({ ...staff, role: "STORE_MANAGER", storeId }),
  ).rejects.toMatchObject({ status: 403 });
});
