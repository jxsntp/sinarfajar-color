import { randomUUID } from "node:crypto";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import { cameraNotice, currentStation, localCameraTrial } from "@/domains/color-analysis/stations";
import { rankTrial } from "@/domains/color-analysis/trial-ranking";
import { readTrial } from "@/domains/color-analysis/result";
import { isRegistered, registerTrial, registrationInput } from "@/domains/sessions/registration";
import { customerPrivacy } from "@/domains/privacy/service";
import { db } from "@/lib/db";
import { issue, digest } from "@/lib/credentials";
import { issueReport, recoverReport, reportInput, reportScope, resetSession, revokeReport, startSession } from "@/domains/sessions/service";
import { paletteVersion, methodVersion, swatchFor } from "@/domains/color-analysis/swatches";
import { productInput } from "@/domains/catalog/input";
import { importCatalog } from "@/domains/catalog/csv";
import { saveProduct } from "@/domains/catalog/service";
import { activate, readResult } from "@/domains/recommendations/discovery";
import { identity } from "../support/identity";
import { addCatalogPhoto, analyzeCatalogPhoto, reviewCatalogPhoto } from "@/domains/catalog/photo-catalog";
import { photoTagInput } from "@/domains/catalog/photo-tags";

afterAll(() => db.$disconnect());
afterEach(() => vi.unstubAllEnvs());
async function fixture() {
  const org = await db.organization.create({ data: { slug: "color-" + randomUUID(), name: "Color test" } });
  const store = await db.store.create({ data: { organizationId: org.id, name: "Color test store", code: "TST" } });
  const key = issue("device");
  const device = await db.device.create({
    data: { organizationId: org.id, storeId: store.id, label: "Color fixture", keyHash: digest(key, "device") },
  });
  return { org, store, key, device };
}
it("imports a photo, stores AI suggestions for review, and chooses one published photo per category", async () => {
  const { org, store, key } = await fixture();
  const otherStore = await db.store.create({ data: { organizationId: org.id, name: "Other store", code: "OTHER" } });
  const { userId } = await identity(db, org.id);
  const admin = { role: "ORG_ADMIN" as const, userId, organizationId: org.id, storeId: null };
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKXkAAAAASUVORK5CYII=", "base64");
  const draft = await addCatalogPhoto(admin, store.id, new File([png], "Imported.png", { type: "image/png" }));
  const original = await fetch(draft.url);
  expect(Buffer.from(await original.arrayBuffer())).toEqual(png);
  vi.stubEnv("OPENROUTER_API_KEY", "fixture-only");
  vi.stubEnv("OPENROUTER_MODELS", "fixture/vision");
  vi.stubEnv("OPENROUTER_PROVIDERS", "Fixture");
  vi.stubEnv("OPENROUTER_VISION_MODEL", "fixture/vision");
  vi.stubEnv("OPENROUTER_VISION_PROVIDER", "Fixture");
  const modelResponse = (value: object) => Response.json({
    choices: [{ message: { content: JSON.stringify(value) } }],
    usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.0001 },
  });
  const vision = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (url === draft.url) return fetch(url, init);
    expect(String(url)).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(String(init?.body));
    expect(body.messages[1].content[1].image_url.url).toBe("data:image/png;base64," + png.toString("base64"));
    return modelResponse({ category: "ring", shape: "band", style: "minimal", metal: "white", accents: ["green"], needsReview: false });
  });
  const suggestion = await analyzeCatalogPhoto(admin, draft.id, vision);
  expect(suggestion).toMatchObject({ state: "DRAFT", tags: null, proposal: { category: "ring", accents: ["green"] } });
  await analyzeCatalogPhoto(admin, draft.id, vision);
  expect(vision).toHaveBeenCalledTimes(2);
  await expect(reviewCatalogPhoto({ ...admin, storeId: otherStore.id }, draft.id, null)).rejects.toMatchObject({ status: 404 });
  const session = await startSession(key);
  const consent = await db.consent.create({ data: {
    organizationId: org.id, sessionId: session.sessionId, granted: true, purpose: "local_camera", version: cameraNotice,
  } });
  const result = rankTrial([56, 18, 26], paletteVersion, {
    tones: ["pale", "dull"], quality: "stable",
  })!;
  const token = issue("report");
  await issueReport(session.credential, { result, reportCredential: token, cameraConsentId: consent.id }, "localhost:3000");
  await expect(activate(token, randomUUID(), {})).rejects.toMatchObject({ code: "registration_required" });
  await registerTrial(token, registrationInput.parse({ name: "Fixture", email: "fixture@example.test", phone: "+62 811 555 0123" }));
  const categories = ["earring", "necklace", "ring", "bracelet"] as const;
  const paletteFamily = swatchFor(paletteVersion, result.swatchIds[0])!.family;
  const makeTags = (category: typeof categories[number]) => photoTagInput.parse({
    category, shape: category === "earring" ? "hoop" : "other", style: "classic", metal: result.gold, accents: [paletteFamily],
  });
  const alternateIds: string[] = [];
  for (const category of categories) {
    const first = category === "ring" ? draft : await addCatalogPhoto(admin, store.id, new File([png], category + ".png"));
    await reviewCatalogPhoto(admin, first.id, { label: category, tags: makeTags(category) });
    const alt = await addCatalogPhoto(admin, store.id, new File([png], category + "-alt.png"));
    alternateIds.push(alt.id);
    await reviewCatalogPhoto(admin, alt.id, { label: category + " alternate", tags: makeTags(category) });
  }
  const hidden = await addCatalogPhoto(admin, otherStore.id, new File([png], "other.png"));
  await reviewCatalogPhoto(admin, hidden.id, { label: "Other store", tags: makeTags("necklace") });
  const unpublished = await addCatalogPhoto(admin, store.id, new File([png], "draft.png"));
  await db.organization.update({ where: { id: org.id }, data: {
    rankingSettings: { strategy: "openrouter", model: "fixture/vision", provider: "Fixture" },
  } });
  const ranking = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const payload = body.messages[1].content;
    const pool = JSON.parse(payload);
    expect(pool).toHaveLength(8);
    expect(payload).not.toContain(hidden.id);
    expect(payload).not.toContain(unpublished.id);
    expect(payload).not.toMatch(/Fixture|example\.test|data:image|priceIDR/i);
    return modelResponse({ picks: alternateIds.map((id) => ({ id, emphasis: "both" })) });
  });
  const request = randomUUID();
  const ranked = await activate(token, request, {}, ranking);
  expect(ranked).toMatchObject({ status: "complete", strategy: "openrouter", items: [] });
  if (ranked.status !== "complete") throw Error("Expected a completed photo run");
  expect(ranked.photoItems?.map(({ id }) => id)).toEqual(alternateIds);
  expect(ranked.photoItems?.every((value) => value.reason === "both")).toBe(true);
  expect(ranked.photoItems?.[0]).not.toHaveProperty("price");
  await activate(token, request, {}, ranking);
  expect(ranking).toHaveBeenCalledTimes(1);
  await reviewCatalogPhoto(admin, alternateIds[0], null);
  const archived = await readResult(token, ranked.runId);
  expect(archived.status === "complete" && archived.photoItems?.map(({ id }) => id)).toEqual(alternateIds.slice(1));
  const invalid = vi.fn(async () => modelResponse({ picks: [{ id: hidden.id, emphasis: "both" }] }));
  const fallback = await activate(token, randomUUID(), {}, invalid);
  expect(fallback).toMatchObject({ status: "complete", strategy: "rules", fallback: true, items: [] });
  expect(fallback.status === "complete" && fallback.photoItems?.map(({ category }) => category)).toEqual(categories);
  expect(await db.interactionEvent.count({ where: { sessionId: session.sessionId, name: "photo_recommendation_generated" } })).toBe(2);
  expect(await db.inventory.count({ where: { organizationId: org.id } })).toBe(0);
});

it("limits the experimental color estimate to localhost in development", () => {
  expect(localCameraTrial("localhost:3000", "development")).toMatchObject({
    mode: "trial", paletteVersion, calibration: { revision: "assumed-srgb-d65" },
  });
  expect(localCameraTrial("kiosk.example.test", "development")).toBeUndefined();
  expect(localCameraTrial("localhost:3000", "production")).toBeUndefined();
  expect(localCameraTrial("127.0.0.1:3000", "uat")).toBeUndefined();
});

it("uses a current manual station calibration for the trial and ignores a stale one", () => {
  const id = randomUUID();
  const calibration = { revision: "station-20261127-0800", white: [0.95047, 1, 1.08883], matrix: [
    0.41, 0.36, 0.18, 0, 0.21, 0.72, 0.07, 0, 0.02, 0.12, 0.95, 0] };
  const entry = { mode: "manual", checkedAt: new Date().toISOString(), camera: { exposureTime: 120 }, whiteReference: true, calibration };
  vi.stubEnv("COLOR_STATIONS", JSON.stringify({ [id]: entry }));
  expect(localCameraTrial("localhost:3000", "development", currentStation(id))).toMatchObject({
    mode: "trial", calibration: { revision: calibration.revision }, camera: { exposureTime: 120 }, reference: { mode: "required" },
  });
  vi.stubEnv("COLOR_STATIONS", JSON.stringify({ [id]: { ...entry, checkedAt: new Date(Date.now() - 2 * 86400000).toISOString() } }));
  expect(currentStation(id)).toBeUndefined();
  expect(localCameraTrial("localhost:3000", "development", currentStation(id))).toMatchObject({
    calibration: { revision: "assumed-srgb-d65" }, reference: { mode: "auto" },
  });
  vi.stubEnv("COLOR_STATIONS", JSON.stringify({ [id]: { ...entry, mode: "research" } }));
  expect(localCameraTrial("localhost:3000", "development", currentStation(id))?.calibration?.revision).toBe("assumed-srgb-d65");
});

it("gates automatic reports and persists immutable manual swatches with duplicate-safe QR recovery", async () => {
  const { org, key, device } = await fixture();
  const session = await startSession(key);
  expect(session.station.mode).toBe("manual");
  const input = { result: { kind: "manual" as const, paletteId: "drape-dull", paletteVersion }, reportCredential: issue("report") };
  await expect(issueReport(session.credential, { ...input, result: {
    kind: "automatic", tones: ["pale", "dull"], paletteVersion,
    quality: "stable", methodVersion, calibrationVersion: "test-rev",
  } })).rejects.toMatchObject({ status: 403 });
  await expect(issueReport(session.credential, { ...input, result: { ...input.result, paletteVersion: "old" }})).rejects.toMatchObject({ status: 400 });
  expect(reportInput.safeParse({ result: { ...input.result, rawContrast: 0.4 } }).success).toBe(false);
  const first = await issueReport(session.credential, input);
  expect(await issueReport(session.credential, input)).toEqual(first);
  const saved = await db.colorAnalysis.findFirstOrThrow({ where: { sessionId: session.sessionId } });
  expect(saved).toMatchObject({ profile: null, toneGroups: ["dull"], paletteVersion, uncertain: false, source: "MANUAL" });
  expect(saved.paletteSnapshot).toEqual(expect.arrayContaining([expect.objectContaining({ id: "steel-blue" })]));
  const recovered = await recoverReport(session.credential);
  expect(recovered.expiresAt).toEqual(first.expiresAt);
  expect(recovered.reportPath).not.toBe(first.reportPath);
  await expect(reportScope(input.reportCredential)).rejects.toMatchObject({ status: 401 });
  const token = recovered.reportPath.split("/").at(-1)!;
  expect((await reportScope(token)).id).toBe(session.sessionId);
  await expect(recoverReport(session.credential)).rejects.toMatchObject({ status: 409 });
  await resetSession(session.credential);
  expect((await reportScope(token)).id).toBe(session.sessionId);
  expect(await db.interactionEvent.count({ where: { sessionId: session.sessionId, name: "color_analysis_completed" } })).toBe(1);
  await revokeReport({ role: "ORG_ADMIN", organizationId: org.id, userId: device.id, storeId: null }, session.sessionId);
  await expect(reportScope(token)).rejects.toMatchObject({ status: 401 });
  const legacy = await startSession(key);
  await issueReport(legacy.credential, { profile: "warm", palette: ["#aa3311"] });
  expect(await db.colorAnalysis.findFirst({ where: { sessionId: legacy.sessionId } })).toMatchObject({
    profile: "warm", palette: ["#aa3311"], paletteVersion: null, toneGroups: [],
  });
});

it("stores the chosen color style and accepts only shades from that style", async () => {
  const { org, key } = await fixture();
  const session = await startSession(key);
  await issueReport(session.credential, {
    result: { kind: "manual", paletteId: "drape-dull", paletteVersion }, style: "masculine", reportCredential: issue("report"),
  });
  const saved = await db.colorAnalysis.findFirstOrThrow({ where: { sessionId: session.sessionId } });
  const ids = (saved.paletteSnapshot as { id: string }[]).map(({ id }) => id);
  expect(saved.colorStyle).toBe("masculine");
  expect(ids).toEqual(expect.arrayContaining(["steel-blue", "sage", "khaki", "slate", "charcoal", "navy-gray"]));
  expect(ids).not.toContain("dusty-rose");
  expect(reportInput.safeParse({ result: { kind: "uncertain", reason: "no_clear_match" }, style: "unisex" }).success).toBe(false);

  const trialSession = await startSession(key);
  const scope = { organizationId: org.id, sessionId: trialSession.sessionId };
  const consent = await db.consent.create({ data: { ...scope, granted: true, purpose: "local_camera", version: cameraNotice } });
  const station = localCameraTrial("localhost:3000", "development")!;
  expect(station.paletteVersion).toBe(paletteVersion);
  const feminine = {
    kind: "trial" as const, paletteVersion, tones: ["vivid" as const, "dark" as const], quality: "stable" as const,
    swatchIds: ["fuchsia", "coral-red", "plum-rose"], gold: "rose" as const,
  };
  const input = { result: feminine, reportCredential: issue("report"), cameraConsentId: consent.id };
  await expect(issueReport(trialSession.credential, { ...input, style: "masculine" }, "localhost:3000"))
    .rejects.toMatchObject({ code: "invalid_palette" });
  await issueReport(trialSession.credential, { ...input, style: "feminine" }, "localhost:3000");
  expect(await db.colorAnalysis.findUniqueOrThrow({ where: { organizationId_sessionId: scope } }))
    .toMatchObject({ colorStyle: "feminine" });
});

it("stores the comparison's metal and whether it confirmed the camera trial", async () => {
  const { org, key } = await fixture();
  const manual = await startSession(key);
  const result = { kind: "manual" as const, paletteId: "drape-pale", paletteVersion };
  await issueReport(manual.credential, { result, metal: "white", reportCredential: issue("report") });
  expect(await db.colorAnalysis.findFirstOrThrow({ where: { sessionId: manual.sessionId } }))
    .toMatchObject({ metal: "white", engineCheck: null, methodVersion: "manual-drape-v2" });
  expect(reportInput.safeParse({ result, metal: "rose" }).success).toBe(false);
  // A confirmation needs the local camera trial.
  const remote = await startSession(key);
  await expect(issueReport(remote.credential, { result, check: "overruled", reportCredential: issue("report") }, "kiosk.example.test"))
    .rejects.toMatchObject({ code: "invalid_engine_check" });
  const overruled = await startSession(key);
  await issueReport(overruled.credential, { result, check: "overruled", reportCredential: issue("report") }, "localhost:3000");
  expect(await db.colorAnalysis.findFirstOrThrow({ where: { sessionId: overruled.sessionId } }))
    .toMatchObject({ engineCheck: "overruled" });

  const trialSession = await startSession(key);
  const scope = { organizationId: org.id, sessionId: trialSession.sessionId };
  const consent = await db.consent.create({ data: { ...scope, granted: true, purpose: "local_camera", version: cameraNotice } });
  const trial = rankTrial([60, 16, 22], paletteVersion, { tones: ["vivid", "dark"], quality: "stable" })!;
  const input = { result: trial, reportCredential: issue("report"), cameraConsentId: consent.id };
  // A trial cannot be "overruled" (that ends in a comparison result) and carries its own metal.
  await expect(issueReport(trialSession.credential, { ...input, check: "overruled" }, "localhost:3000"))
    .rejects.toMatchObject({ code: "invalid_engine_check" });
  await expect(issueReport(trialSession.credential, { ...input, metal: "yellow" }, "localhost:3000"))
    .rejects.toMatchObject({ code: "invalid_metal" });
  await issueReport(trialSession.credential, { ...input, check: "confirmed" }, "localhost:3000");
  expect(await db.colorAnalysis.findUniqueOrThrow({ where: { organizationId_sessionId: scope } }))
    .toMatchObject({ engineCheck: "confirmed", metal: null });
});

it("hands off ranked camera colors and requires three-field registration before jewelry discovery", async () => {
  const { org, store, key } = await fixture();
  const session = await startSession(key);
  const scope = { organizationId: org.id, sessionId: session.sessionId };
  const consent = await db.consent.create({
    data: { ...scope, granted: true, purpose: "local_camera", version: cameraNotice },
  });
  const result = rankTrial([56, 18, 26], paletteVersion, {
    tones: ["pale", "dull"], quality: "stable",
  })!;
  const token = issue("report");
  const input = { result, reportCredential: token, cameraConsentId: consent.id };
  await expect(issueReport(session.credential, input, "kiosk.example.test"))
    .rejects.toMatchObject({ code: "trial_unavailable" });
  await issueReport(session.credential, input, "localhost:3000");
  const saved = await db.colorAnalysis.findUniqueOrThrow({ where: { organizationId_sessionId: scope } });
  expect(readTrial(saved.paletteSnapshot)?.swatches.map(({ id }) => id)).toEqual(result.swatchIds);
  expect(readTrial(saved.paletteSnapshot)?.gold).toBe(result.gold);
  const mobile = await reportScope(token);
  const requestId = randomUUID();
  await expect(activate(token, requestId, {})).rejects.toMatchObject({ code: "registration_required" });
  expect(await db.recommendationRun.count({ where: scope })).toBe(0);
  const registration = registrationInput.parse({
    name: "Demo Customer", email: "demo@example.test", phone: "+62 811 555 0123",
  });
  await registerTrial(token, registration);
  await registerTrial(token, registration);
  expect(await isRegistered(mobile)).toBe(true);
  const brand = await db.brand.create({ data: { organizationId: org.id, name: "Coverage test" } });
  const otherGold = result.gold === "yellow" ? "white" : "yellow";
  const products = await db.product.createManyAndReturn({ data: [
    { sku: "TEST-EARRING", category: "earrings", goldColor: otherGold },
    { sku: "TEST-NECKLACE", category: "necklace", goldColor: otherGold },
    { sku: "TEST-RING", category: "ring", goldColor: result.gold },
    { sku: "TEST-RING-ALT", category: "rings", goldColor: otherGold },
    { sku: "TEST-BRACELET", category: "gelang", goldColor: otherGold },
    { sku: "TEST-BROOCH", category: "brooch", goldColor: result.gold },
  ].map((product) => ({
    ...product, name: product.sku, organizationId: org.id, brandId: brand.id, purity: "18k",
  })) });
  await db.inventory.createMany({ data: products.map((product) => ({
    organizationId: org.id, storeId: store.id, productId: product.id, onHand: 2, price: "500",
  })) });
  const response = await activate(token, requestId, {});
  expect(response).toMatchObject({ status: "complete", preferences: { preferredGold: result.gold } });
  expect(response.items.map(({ sku }) => sku).sort()).toEqual(["TEST-BRACELET", "TEST-EARRING", "TEST-NECKLACE", "TEST-RING"]);
  const run = await db.recommendationRun.findFirstOrThrow({ where: scope });
  expect(run.colorContext).toMatchObject({
    source: "camera_trial",
    categoryCoverage: true,
    swatches: result.swatchIds.map((id) => ({ id, evidence: "curated_by_tone" })),
  });
  await db.inventory.updateMany({
    where: {
      organizationId: org.id, storeId: store.id,
      productId: { in: products.filter((product) => ["TEST-RING", "TEST-BRACELET"].includes(product.sku)).map(({ id }) => id) },
    },
    data: { onHand: 0 },
  });
  const refreshed = await activate(token, randomUUID(), {});
  expect(refreshed.runId).not.toBe(response.runId);
  expect(refreshed.items.map(({ sku }) => sku).sort()).toEqual(["TEST-EARRING", "TEST-NECKLACE", "TEST-RING-ALT"]);
  await customerPrivacy(token, { action: "erase", confirm: "delete" });
  expect(await isRegistered(mobile)).toBe(false);
});

it("scores the filtered catalog before bounding candidates and preserves explicit metal choices", async () => {
  const { org, store, key } = await fixture();
  const staff = { organizationId: org.id, storeId: null, role: "ORG_ADMIN" as const, userId: (await identity(db, org.id)).userId };
  const base = {
    name: "Fixture ring", brand: "Fixture", category: "ring", purity: "18k",
    goldColor: "white", price: "100", onHand: 1,
  };
  const blue = {
    role: "enamel", appearance: "chromatic", colorFamily: "blue", prominence: "dominant",
    reference: { version: paletteVersion, id: "steel-blue" },
    status: "verified", source: "store_check", sourceRef: "fixture-01",
  };
  const csvColor = JSON.stringify([blue]).replaceAll('"', '""');
  const csv = 'sku,name,brand,category,goldColor,purity,price,onHand,visibleColors\nZ-MATCH,Blue fixture,Fixture,ring,white,18k,100,1,"' + csvColor + '"';
  const imported = await importCatalog(staff, { storeId: store.id, csv, mapping: {}, commit: true });
  expect(imported.imported).toBe(1);
  const brand = await db.brand.findFirstOrThrow({ where: { organizationId: org.id } });
  const fillers = await db.product.createManyAndReturn({
    data: Array.from({ length: 26 }, (_, index) => ({
      organizationId: org.id, brandId: brand.id, category: "ring", purity: "18k",
      sku: "A-" + index.toString().padStart(2, "0"), name: "Bare ring", goldColor: "white",
    })),
  });
  await db.inventory.createMany({
    data: fillers.map(({ id }) => ({ organizationId: org.id, storeId: store.id, productId: id, price: "100", onHand: 1, verifiedAt: new Date() })),
  });
  await db.$transaction((tx) => saveProduct(tx, staff, store.id, productInput.parse({
    ...base, sku: "Y-GOLD", goldColor: "yellow", styleTags: ["classic"],
  }), "create"));
  const session = await startSession(key);
  const token = issue("report");
  await issueReport(session.credential, { result: { kind: "mixed", tones: ["pale", "dull"], paletteVersion }, reportCredential: token });
  const prefs = { selectedSwatchIds: ["steel-blue"], selectedSwatchVersion: paletteVersion, maxBudget: "110.00" };
  const match = await activate(token, randomUUID(), prefs);
  expect(match.items[0]).toMatchObject({ sku: "Z-MATCH", reason: expect.stringContaining("steel blue") });
  expect(match.items[0]).not.toHaveProperty("visibleColors");
  const overridden = await activate(token, randomUUID(), { ...prefs, preferredGold: "yellow", style: "classic" });
  expect(overridden.items[0].sku).toBe("Y-GOLD");
  expect(overridden.items[0].reason).not.toContain("steel blue");
  const hard = await activate(token, randomUUID(), { ...prefs, requiredGold: "yellow" });
  expect(hard.items.map((item) => item.sku)).toEqual(["Y-GOLD"]);
  const noColor = await activate(token, randomUUID(), { useColorProfile: false });
  expect(noColor.items.some((item) => item.sku === "Z-MATCH")).toBe(false);
  const sku = await db.product.findFirstOrThrow({ where: { organizationId: org.id, sku: "Z-MATCH" } });
  await db.inventory.updateMany({ where: { productId: sku.id, storeId: store.id }, data: { onHand: 0 } });
  const refreshed = await readResult(token, match.runId);
  expect(refreshed.items.map((item) => item.sku)).not.toContain(sku.sku);
});
