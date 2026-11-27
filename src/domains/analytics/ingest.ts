import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { currentStaff } from "../authentication/staff";
import { storeFilter } from "../authentication/access";
import { kioskScope, reportScope } from "../sessions/service";
import { posStore } from "../integrations/pos";
import { checkProducer, eventInput, writeEvent } from "./events";

export const ingestInput = z
  .object({ sessionId: z.uuid().optional(), event: eventInput })
  .strict();
export async function ingest(
  token: string | null,
  input: z.infer<typeof ingestInput>,
) {
  const age = Date.now() - input.event.occurredAt.getTime();
  if (age < -120000 || age > 86400000 + 120000)
    throw new HttpError(400, "invalid_event_time");
  const staff = token === null ? await currentStaff("staff") : null;
  return db.$transaction(async (tx) => {
    if (token?.startsWith("kiosk_") || token?.startsWith("report_")) {
      const kiosk = token.startsWith("kiosk_");
      const session = kiosk
        ? await kioskScope(tx, token)
        : await reportScope(token, tx);
      if (input.sessionId && input.sessionId !== session.id)
        throw new HttpError(403, "scope_mismatch");
      const channel = kiosk ? "KIOSK" : "MOBILE";
      checkProducer(channel, input.event.name);
      const { sku, runId, rank, ...base } = input.event;
      if (base.name === "photo_recommendation_impression") {
        if (!runId || sku || rank) throw new HttpError(400, "invalid_recommendation_reference");
        const run = await tx.recommendationRun.findFirst({
          where: { id: runId, organizationId: session.organizationId, sessionId: session.id, status: "COMPLETE" },
          select: { photoPicks: true },
        });
        if (!Array.isArray(run?.photoPicks) || !run.photoPicks.length)
          throw new HttpError(400, "invalid_recommendation_reference");
        return writeEvent(tx, session, channel, { ...base, runId });
      }
      if (
        [
          "recommendation_impression",
          "recommended_product_clicked",
          "product_detail_viewed",
        ].includes(base.name)
      ) {
        if (!sku || !runId || !rank)
          throw new HttpError(400, "recommendation_reference_required");
        const item = await tx.recommendationItem.findFirst({
          where: {
            organizationId: session.organizationId,
            runId,
            rank,
            product: { sku },
            run: { sessionId: session.id },
          },
        });
        if (!item) throw new HttpError(400, "invalid_recommendation_reference");
        return writeEvent(tx, session, channel, {
          ...base,
          runId,
          rank,
          productId: item.productId,
        });
      }
      if (sku || runId || rank)
        throw new HttpError(400, "unexpected_reference");
      return writeEvent(tx, session, channel, base);
    }
    const channel = staff ? "STAFF" : "POS";
    const scope = staff ? storeFilter(staff) : await posStore(tx, token ?? "");
    checkProducer(channel, input.event.name);
    if (input.event.runId || input.event.sku || input.event.rank)
      throw new HttpError(400, "unexpected_reference");
    if (!input.sessionId) throw new HttpError(400, "session_required");
    const session = await tx.customerSession.findFirst({
      where: { id: input.sessionId, ...scope },
    });
    if (!session) throw new HttpError(404, "unknown_session");
    return writeEvent(tx, session, channel, input.event);
  });
}
export async function readEvents(sessionId: string) {
  const staff = await currentStaff("dashboard");
  const session = await db.customerSession.findFirst({
    where: { id: sessionId, ...storeFilter(staff) },
  });
  if (!session) throw new HttpError(404, "unknown_session");
  return db.interactionEvent.findMany({
    where: { organizationId: staff.organizationId, sessionId },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: 100,
    select: {
      id: true,
      sessionId: true,
      name: true,
      channel: true,
      occurredAt: true,
      runId: true,
      productId: true,
      rank: true,
      experimentVersions: true,
      session: { select: { deviceId: true, storeId: true, assisted: true } },
    },
  });
}
