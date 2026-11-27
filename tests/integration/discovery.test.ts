import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { identity } from "../support/identity";
import { registerDevice } from "@/domains/devices/service";
import {
  startSession,
  issueReport,
  resetSession,
} from "@/domains/sessions/service";
import { activate, readResult } from "@/domains/recommendations/discovery";
import {
  saveProduct,
  savePartner,
  archiveProduct,
  ProductCatalogService,
} from "@/domains/catalog/service";
import { importCatalog } from "@/domains/catalog/csv";
import { productInput } from "@/domains/catalog/input";
import type { StaffScope } from "@/domains/authentication/access";

let admin: StaffScope, storeId: string, device: string;
const sample = productInput.parse({
  sku: "TEST-A",
  name: "Synthetic ring",
  brand: "Pilot",
  manufacturer: "Forge",
  category: "ring",
  goldColor: "yellow",
  purity: "18K",
  price: "100.50",
  onHand: 3,
  styleTags: ["classic"],
  weightGrams: "2.500",
  gemstones: "Quartz",
  displayLocation: "A2",
});
beforeAll(async () => {
  const org = await db.organization.create({
    data: {
      slug: "ranking-" + randomUUID(),
      name: "Ranking fixture",
      rankingSettings: {
        strategy: "openrouter",
        model: "test/model",
        provider: "TestProvider",
      },
    },
  });
  const who = await identity(db, org.id);
  admin = {
    userId: who.userId,
    organizationId: org.id,
    role: "ORG_ADMIN",
    storeId: null,
  };
  storeId = (
    await db.store.create({
      data: { organizationId: org.id, name: "One", code: "ONE" },
    })
  ).id;
  device = (await registerDevice(admin, storeId, "Kiosk", "KIOSK")).credential;
  await db.$transaction((tx) =>
    saveProduct(tx, admin, storeId, sample, "create"),
  );
});
afterAll(() => db.$disconnect());
afterEach(() => vi.unstubAllEnvs());
function setupMock() {
  vi.stubEnv("ENABLE_MOBILE_EXPERIMENT", "false");
  vi.stubEnv("OPENROUTER_API_KEY", "synthetic-unit-key");
  vi.stubEnv("OPENROUTER_MODELS", "test/model");
  vi.stubEnv("OPENROUTER_PROVIDERS", "TestProvider");
}
async function report() {
  const session = await startSession(device);
  const handoff = await issueReport(session.credential, {
    profile: "warm",
    palette: ["#fefefe"],
  });
  await resetSession(session.credential);
  return { session, token: handoff.reportPath.split("/").pop()! };
}
function validReply(_url: RequestInfo | URL, init?: RequestInit) {
  const body = JSON.parse(String(init?.body));
  const input: { candidates: { sku: string; reasons: string[] }[] } =
    JSON.parse(body.messages[1].content);
  const recommendations = input.candidates
    .slice(0, 5)
    .map((p, i) => ({ sku: p.sku, rank: i + 1, reason: p.reasons[0] }));
  return Response.json({
    choices: [{ message: { content: JSON.stringify({ recommendations }) } }],
    usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.0004 },
  });
}
it("previews, imports, edits and archives with scoped audit history", async () => {
  const csv =
    "Code,name,brand,category,goldColor,purity,price,onHand\nCSV-1,Band,Seed,ring,white,18K,45.25,1";
  const source = { storeId, csv, mapping: { sku: "Code" }, commit: false };
  expect((await importCatalog(admin, source)).valid).toBe(true);
  expect(
    (await importCatalog(admin, { ...source, commit: true })).imported,
  ).toBe(1);
  const duplicate = await importCatalog(admin, {
    ...source,
    csv: csv + "\nCSV-2,Band,Seed,ring,white,18K,1,1",
    commit: true,
  });
  expect(duplicate.imported).toBe(0);
  expect(duplicate.rows[0].errors).toContain("SKU already in catalog");
  const patch = {
    ...sample,
    sku: "CSV-1",
    photoPath: admin.organizationId + "/synthetic.png",
  };
  await db.$transaction((tx) => saveProduct(tx, admin, storeId, patch, "edit"));
  const maker = await savePartner(admin, "manufacturer", "Fixture maker");
  await savePartner(admin, "manufacturer", "Renamed maker", maker.id);
  await archiveProduct(admin, "CSV-1");
  expect(
    await db.catalogAudit.count({
      where: { organizationId: admin.organizationId, subject: "CSV-1" },
    }),
  ).toBe(3);
  const service = new ProductCatalogService(),
    scope = { organizationId: admin.organizationId, storeId };
  expect(await service.eligible(scope, { maxBudget: "100.49" })).toEqual([]);
  expect(await service.eligible(scope, { requiredGold: "white" })).toEqual([]);
  expect(
    (
      await service.eligible(scope, {
        category: "ring",
        requiredBrand: "Pilot",
        requiredPurity: "18k",
        maxBudget: "100.50",
      })
    ).map((p) => p.sku),
  ).toEqual(["TEST-A"]);
  expect(
    await service.eligible({ ...scope, storeId: randomUUID() }, {}),
  ).toEqual([]);
});
it("coalesces concurrent paid requests, binds idempotency to input and rechecks live facts", async () => {
  setupMock();
  const { session, token } = await report();
  const transport = vi.fn(
    async (url: RequestInfo | URL, init?: RequestInit) => {
      await new Promise((r) => setTimeout(r, 120));
      return validReply(url, init);
    },
  );
  const key = randomUUID(),
    prefs = { style: "classic", maxBudget: "105.00" };
  await expect(
    activate(session.credential, key, prefs, transport),
  ).rejects.toMatchObject({ status: 401 });
  expect(transport).not.toHaveBeenCalled();
  const results = await Promise.all([
    activate(token, key, prefs, transport),
    activate(token, randomUUID(), prefs, transport),
  ]);
  expect(new Set(results.map((r) => r.runId)).size).toBe(1);
  const result = await activate(token, key, prefs, transport);
  expect(result.items[0].sku).toBe("TEST-A");
  expect(transport).toHaveBeenCalledTimes(1);
  const body = JSON.parse(String(transport.mock.calls[0][1]?.body));
  expect(body.provider.only).toEqual(["TestProvider"]);
  expect(JSON.stringify(body)).not.toContain(session.sessionId);
  expect(JSON.stringify(body)).not.toContain("displayLocation");
  expect(JSON.stringify(body)).not.toContain(token);
  await expect(
    activate(token, key, { style: "other" }, transport),
  ).rejects.toMatchObject({ status: 409 });
  const run = await db.recommendationRun.findUniqueOrThrow({
    where: { id: result.runId },
  });
  expect(run.schemaValid).toBe(true);
  expect(run.inputTokens).toBe(100);
  expect(Number(run.inferenceCost)).toBe(0.0004);
  await db.$transaction((tx) =>
    saveProduct(tx, admin, storeId, { ...sample, price: "103.00" }, "edit"),
  );
  expect((await readResult(token, result.runId)).items[0].price).toBe("103.00");
  await db.$transaction((tx) =>
    saveProduct(tx, admin, storeId, { ...sample, onHand: 0 }, "edit"),
  );
  expect((await activate(token, key, prefs, transport)).items).toEqual([]);
  const changed = await activate(token, randomUUID(), prefs, transport);
  expect(changed.runId).not.toBe(result.runId);
  expect(changed.items).toEqual([]);
  expect(transport).toHaveBeenCalledTimes(1);
  await db.$transaction((tx) =>
    saveProduct(tx, admin, storeId, sample, "edit"),
  );
});
it("rejects invalid rankings, accounts for their cost and reuses deterministic fallback", async () => {
  setupMock();
  const { token } = await report();
  const transport = vi.fn(async () =>
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              recommendations: [{ sku: "INVENTED", rank: 1, reason: "unsafe" }],
            }),
          },
        },
      ],
      usage: { prompt_tokens: 95, completion_tokens: 15, cost: 0.0003 },
    }),
  );
  const result = await activate(token, randomUUID(), {}, transport);
  expect(result.items.map((p) => p.sku)).toEqual(["TEST-A"]);
  const run = await db.recommendationRun.findUniqueOrThrow({
    where: { id: result.runId },
  });
  expect(run).toMatchObject({
    fallback: true,
    schemaValid: false,
    failureCategory: "invalid_output",
    strategy: "rules",
  });
  expect(Number(run.inferenceCost)).toBe(0.0003);
  await activate(token, randomUUID(), {}, transport);
  expect(transport).toHaveBeenCalledTimes(1);
});
it("bounds retries and reserves quota and cost before dispatch", async () => {
  setupMock();
  const first = await report();
  const transport = vi.fn(async () => new Response(null, { status: 429 }));
  const result = await activate(first.token, randomUUID(), {}, transport);
  expect(transport).toHaveBeenCalledTimes(2);
  expect(result.items.length).toBe(1);
  vi.stubEnv("AI_DAILY_REQUESTS", "1");
  const second = await report();
  const limited = await activate(second.token, randomUUID(), {}, transport);
  expect(
    (
      await db.recommendationRun.findUniqueOrThrow({
        where: { id: limited.runId },
      })
    ).failureCategory,
  ).toBe("quota");
  vi.stubEnv("AI_DAILY_REQUESTS", "100");
  vi.stubEnv("AI_RUN_USD", "0.000001");
  const third = await report();
  const capped = await activate(third.token, randomUUID(), {}, transport);
  expect(
    (
      await db.recommendationRun.findUniqueOrThrow({
        where: { id: capped.runId },
      })
    ).failureCategory,
  ).toBe("cost_limit");
  expect(transport).toHaveBeenCalledTimes(2);
});
it("keeps unknown charges unknown on timeout and never retries an ambiguous paid call", async () => {
  setupMock();
  const { token } = await report();
  const transport = vi.fn(async () => {
    throw new DOMException("Timed out", "TimeoutError");
  });
  const result = await activate(token, randomUUID(), {}, transport);
  const run = await db.recommendationRun.findUniqueOrThrow({
    where: { id: result.runId },
  });
  expect(run).toMatchObject({
    failureCategory: "timeout",
    inferenceCost: null,
    fallback: true,
  });
  expect(transport).toHaveBeenCalledTimes(1);
});

it("withholds a SKU that sells out during inference", async () => {
  setupMock();
  const { token } = await report();
  const transport = vi.fn(
    async (url: RequestInfo | URL, init?: RequestInit) => {
      await db.$transaction((tx) =>
        saveProduct(tx, admin, storeId, { ...sample, onHand: 0 }, "edit"),
      );
      return validReply(url, init);
    },
  );
  try {
    const result = await activate(token, randomUUID(), {}, transport);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(result.items).toEqual([]);
    expect(
      await db.recommendationItem.count({ where: { runId: result.runId } }),
    ).toBe(0);
    expect(
      await db.interactionEvent.count({
        where: { runId: result.runId, name: "recommendation_generated" },
      }),
    ).toBe(0);
    expect(
      await db.interactionEvent.count({
        where: { runId: result.runId, name: "recommendation_no_matches" },
      }),
    ).toBe(1);
  } finally {
    await db.$transaction((tx) =>
      saveProduct(tx, admin, storeId, sample, "edit"),
    );
  }
});

it("assigns an eligible activation once and keeps its arm across preference edits", async () => {
  setupMock();
  vi.stubEnv("ENABLE_MOBILE_EXPERIMENT", "true");
  const { token, session } = await report();
  const transport = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) =>
    validReply(url, init),
  );
  expect(
    await db.experimentAssignment.count({
      where: {
        sessionId: session.sessionId,
        experiment: { name: "mobile-ranking" },
      },
    }),
  ).toBe(0);
  const first = await activate(
    token,
    randomUUID(),
    { minBudget: "100.00", maxBudget: "101.00" },
    transport,
  );
  const second = await activate(
    token,
    randomUUID(),
    { minBudget: "100.00", maxBudget: "101.00", colorPreference: "skip" },
    transport,
  );
  const variants = await db.experimentAssignment.findMany({
    where: {
      sessionId: session.sessionId,
      experiment: { name: "mobile-ranking" },
    },
  });
  expect(variants).toHaveLength(1);
  const variant = variants[0].variant;
  expect(["rules", "openrouter"]).toContain(variant);
  const runs = await db.recommendationRun.findMany({
    where: { id: { in: [first.runId, second.runId] } },
  });
  expect(runs).toHaveLength(2);
  for (const run of runs)
    expect(run).toMatchObject({
      variant,
      assignedStrategy: variant,
      strategy: variant,
    });
  expect(transport).toHaveBeenCalledTimes(variant === "openrouter" ? 2 : 0);
});


it("excludes stale stock and excludes ungrounded preference text from provider data", async () => {
  setupMock();
  vi.stubEnv("INVENTORY_MAX_AGE_MINUTES", "5");
  const scope = { organizationId: admin.organizationId, storeId };
  await db.inventory.updateMany({ where: scope, data: { verifiedAt: new Date(0) } });
  try {
    expect(await new ProductCatalogService().eligible(scope, {})).toEqual([]);
  } finally {
    await db.$transaction((tx) => saveProduct(tx, admin, storeId, sample, "edit"));
  }
  const { token } = await report();
  const marker = "Fixture instruction-like text";
  const transport = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    expect(String(init?.body)).not.toContain(marker);
    return validReply(url, init);
  });
  expect((await activate(token, randomUUID(), { style: marker }, transport)).items.length).toBe(1);
  expect(transport).toHaveBeenCalledTimes(1);
});
