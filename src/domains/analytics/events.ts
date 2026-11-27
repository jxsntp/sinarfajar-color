import { Prisma, type Channel } from "@prisma/client";
import { z } from "zod";
import { HttpError } from "@/lib/http";

export type SessionScope = {
  id: string;
  organizationId: string;
  storeId: string;
  deviceId: string;
};
export const eventInput = z
  .object({
    id: z.uuid(),
    name: z.enum([
      "color_analysis_started",
      "color_result_viewed",
      "camera_capture_failed",
      "camera_retake",
      "camera_manual_fallback",
      "qr_displayed",
      "mobile_report_opened",
      "report_share_initiated",
      "results_saved",
      "social_link_clicked",
      "staff_session_reviewed",
      "pos_session_link_checked",
      "photo_recommendation_impression",
      "recommendation_impression",
      "recommended_product_clicked",
      "product_detail_viewed",
    ]),
    runId: z.uuid().optional(),
    sku: z.string().min(1).max(64).optional(),
    rank: z.number().int().min(1).max(5).optional(),
    occurredAt: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
  })
  .strict();
const permitted = {
  KIOSK: ["color_analysis_started", "color_result_viewed", "qr_displayed",
    "camera_capture_failed", "camera_retake", "camera_manual_fallback"],
  MOBILE: [
    "mobile_report_opened",
    "report_share_initiated",
    "results_saved",
    "social_link_clicked",
    "photo_recommendation_impression",
    "recommendation_impression",
    "recommended_product_clicked",
    "product_detail_viewed",
  ],
  STAFF: ["staff_session_reviewed"],
  POS: ["pos_session_link_checked"],
} satisfies Record<Channel, string[]>;
export function checkProducer(channel: Channel, name: string) {
  if (!permitted[channel].includes(name))
    throw new HttpError(403, "event_not_permitted");
}
type EventData = {
  id: string;
  name: string;
  occurredAt: Date;
  runId?: string;
  rank?: number;
  productId?: string;
};
export async function writeEvent(
  tx: Prisma.TransactionClient,
  session: SessionScope,
  channel: Channel,
  event: EventData,
) {
  const { organizationId, id: sessionId } = session;
  await tx.$queryRaw`SELECT id FROM "CustomerSession" WHERE id = ${sessionId}::uuid AND "organizationId" = ${organizationId}::uuid FOR NO KEY UPDATE`;
  if (
    [
      "qr_displayed",
      "color_result_viewed",
      "color_analysis_started",
      "photo_recommendation_impression",
      "recommended_product_clicked",
    ].includes(event.name)
  ) {
    const prior = await tx.interactionEvent.findFirst({
      where: {
        organizationId,
        sessionId,
        channel,
        name: event.name,
        runId: event.runId ?? null,
        productId: event.productId ?? null,
      },
      select: { id: true },
    });
    if (prior) return { recorded: false };
  }
  if (event.name === "mobile_report_opened") {
    const first = await tx.interactionEvent.findFirst({
      where: { organizationId, sessionId, name: event.name },
      select: { occurredAt: true },
    });
    if (
      first &&
      event.occurredAt.getTime() - first.occurredAt.getTime() >= 86400000
    ) {
      const since = new Date(event.occurredAt.getTime() - 86400000);
      const revisit = await tx.interactionEvent.findFirst({
        where: {
          organizationId,
          sessionId,
          name: "report_revisited",
          occurredAt: { gte: since },
        },
      });
      if (!revisit) event = { ...event, name: "report_revisited" };
      else return { recorded: false };
    }
  }
  const assignments = await tx.experimentAssignment.findMany({
    where: { organizationId, sessionId },
    select: {
      experimentId: true,
      variant: true,
      experiment: { select: { version: true } },
    },
  });
  const result = await tx.interactionEvent.createMany({
    data: {
      ...event,
      organizationId,
      sessionId,
      channel,
      experimentVersions: assignments,
    },
    skipDuplicates: true,
  });
  if (result.count) return { recorded: true };
  const existing = await tx.interactionEvent.findFirst({
    where: {
      organizationId,
      sessionId,
      id: event.id,
      name: event.name,
      channel,
      occurredAt: event.occurredAt,
      runId: event.runId ?? null,
      productId: event.productId ?? null,
      rank: event.rank ?? null,
    },
  });
  if (!existing) {
    // The first visible open has its own partial unique index.
    const firstOpen =
      event.name === "mobile_report_opened" &&
      (await tx.interactionEvent.findFirst({
        where: { organizationId, sessionId, channel, name: event.name },
      }));
    if (!firstOpen) throw new HttpError(409, "event_conflict");
  }
  return { recorded: false };
}
