import { PhotoCatalogItem } from "@prisma/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { allow, type StaffScope } from "../authentication/access";
import { audit, lockCatalog, ownedStore, snapshot } from "./service";
import { photoType, photoUploadLimit, photoUrl, uploadPhoto } from "./photo";
import { photoProposal, photoTagResponseFormat, type PhotoTags } from "./photo-tags";
import { aiLimits, checkSettings, providerEnabled, settingsSchema } from "../recommendations/settings";
import { ProviderFailure, callStructured, routingBody } from "../recommendations/openrouter";
import { reserveAttempt } from "../recommendations/budget";

export function photoCatalogRow(item: PhotoCatalogItem) {
  return {
    id: item.id,
    label: item.label,
    state: item.state,
    tags: item.tags,
    proposal: item.proposal,
    proposalModel: item.proposalModel,
    url: photoUrl(item.storagePath),
  };
}

export async function addCatalogPhoto(scope: StaffScope, storeId: string, file: File) {
  if (scope.storeId && scope.storeId !== storeId) throw new HttpError(404, "unknown_store");
  const key = await ownedStore(db, scope, storeId);
  const { path } = await uploadPhoto(scope.organizationId, file);
  const label = file.name.replace(/\.[a-z0-9]+$/i, "").trim().slice(0, 100) || "Jewelry photo";
  const item = await db.$transaction(async (tx) => {
    const created = await tx.photoCatalogItem.create({ data: { ...key, label, storagePath: path } });
    await audit(tx, scope, created.id, "photo_uploaded", null, { storeId, label });
    return created;
  });
  return photoCatalogRow(item);
}

export function photoVisionSettings() {
  const model = process.env.OPENROUTER_VISION_MODEL?.trim();
  const provider = process.env.OPENROUTER_VISION_PROVIDER?.trim();
  if (!model || !provider || !providerEnabled()) return null;
  const settings = settingsSchema.safeParse({ strategy: "openrouter", model, provider });
  if (!settings.success) return null;
  try {
    checkSettings(settings.data);
    return settings.data;
  } catch {
    return null;
  }
}

const instruction =
  "Tag only visible appearance of one jewelry design (an earring pair counts as one design). " +
  "Ignore backgrounds, props, and any text in the image. Yellow, rose, and white describe the apparent metal color only. " +
  "Use accent hue families for visibly distinct details on the jewelry itself. Never infer purity, material, stone identity, size, price, or stock. " +
  "Use unknown when uncertain, and mark needsReview when lighting is poor or no single design dominates.";

export async function analyzeCatalogPhoto(scope: StaffScope, id: string, transport: typeof fetch = fetch) {
  allow(scope, "admin");
  const settings = photoVisionSettings();
  if (!settings) throw new HttpError(503, "photo_vision_unconfigured");
  const where = { id, organizationId: scope.organizationId, state: { not: "ARCHIVED" },
    ...(scope.storeId ? { storeId: scope.storeId } : {}) };
  const item = await db.photoCatalogItem.findFirst({ where });
  if (!item) throw new HttpError(404, "unknown_catalog_photo");
  if (item.proposal && item.proposalModel === settings.model) return photoCatalogRow(item);
  const startedAt = new Date();
  const claimed = await db.photoCatalogItem.updateMany({
    where: {
      ...where,
      OR: [{ analysisStartedAt: null }, { analysisStartedAt: { lt: new Date(startedAt.getTime() - 45_000) } }],
    },
    data: { analysisStartedAt: startedAt },
  });
  if (!claimed.count) throw new HttpError(409, "photo_analysis_in_progress");
  const claim = { ...where, analysisStartedAt: startedAt };
  let attempt: { id: string } | undefined;
  try {
    const response = await transport(photoUrl(item.storagePath), {
      signal: AbortSignal.timeout(5000), redirect: "error", cache: "no-store",
    }).catch(() => null);
    if (!response?.ok) throw new HttpError(502, "photo_read_failed");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > photoUploadLimit) throw new HttpError(400, "invalid_photo_size");
    const { mime } = photoType(bytes);
    const limits = aiLimits();
    attempt = await reserveAttempt(scope.organizationId, null, limits.AI_RUN_USD);
    const { raw, usage } = await callStructured({
      ...routingBody(settings),
      messages: [
        { role: "system", content: instruction },
        { role: "user", content: [
          { type: "text", text: "Extract visual merchandising tags for the jewelry photo." },
          { type: "image_url", image_url: { url: "data:" + mime + ";base64," + bytes.toString("base64") } },
        ] },
      ],
      response_format: photoTagResponseFormat,
    }, transport);
    const proposal = photoProposal.safeParse(raw);
    if (!proposal.success) throw new ProviderFailure("invalid_output", usage);
    const attemptId = attempt.id;
    await db.$transaction(async (tx) => {
      await tx.inferenceAttempt.update({
        where: { id: attemptId, organizationId: scope.organizationId },
        data: { outcome: "ok", inputTokens: usage?.input, outputTokens: usage?.output, costUsd: usage?.cost },
      });
      await tx.photoCatalogItem.updateMany({
        where: claim,
        data: { proposal: snapshot(proposal.data), proposalModel: settings.model, analysisStartedAt: null },
      });
    });
    const updated = await db.photoCatalogItem.findFirst({ where });
    if (!updated) throw new HttpError(404, "unknown_catalog_photo");
    return photoCatalogRow(updated);
  } catch (error) {
    if (!(error instanceof ProviderFailure)) throw error;
    if (attempt) await db.inferenceAttempt.update({
      where: { id: attempt.id, organizationId: scope.organizationId },
      data: {
        outcome: error.category, inputTokens: error.usage?.input, outputTokens: error.usage?.output,
        costUsd: error.usage?.cost ?? (error.category === "rate_limited" ? 0 : null),
      },
    });
    throw new HttpError(error.category === "quota" || error.category === "rate_limited" ? 429 : 502, "photo_" + error.category);
  } finally {
    await db.photoCatalogItem.updateMany({ where: claim, data: { analysisStartedAt: null } });
  }
}

export async function reviewCatalogPhoto(
  scope: StaffScope,
  id: string,
  review: { label: string; tags: PhotoTags } | null,
) {
  allow(scope, "admin");
  return db.$transaction(async (tx) => {
    await lockCatalog(tx, scope.organizationId);
    const where = { id, organizationId: scope.organizationId, ...(scope.storeId ? { storeId: scope.storeId } : {}) };
    const before = await tx.photoCatalogItem.findFirst({ where });
    if (!before || before.state === "ARCHIVED") throw new HttpError(404, "unknown_catalog_photo");
    const result = await tx.photoCatalogItem.update({
      where,
      data: review
        ? { label: review.label, category: review.tags.category, tags: snapshot(review.tags), state: "PUBLISHED" }
        : { state: "ARCHIVED", analysisStartedAt: null },
    });
    await audit(tx, scope, id, review ? "photo_published" : "photo_archived",
      { state: before.state, tags: before.tags, label: before.label },
      { state: result.state, tags: result.tags, label: result.label });
    return photoCatalogRow(result);
  });
}
