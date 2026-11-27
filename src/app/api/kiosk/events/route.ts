import { boundedJson, networkQuota } from "@/lib/security";
import { db } from "@/lib/db";
import { digest } from "@/lib/credentials";
import { endpoint, HttpError } from "@/lib/http";
import { deviceKey } from "@/lib/kiosk-http";
import { ingestInput } from "@/domains/analytics/ingest";
import { checkProducer, writeEvent } from "@/domains/analytics/events";

export const POST = (req: Request) =>
  endpoint("kiosk.events", async () => {
    await networkQuota(req, "kiosk-events", 900);
    const keyHash = digest(await deviceKey(req), "device");
    const {
      sessionId,
      event: { sku, runId, rank, ...event },
    } = ingestInput.parse(await boundedJson(req));
    if (!sessionId || sku || runId || rank)
      throw new HttpError(400, "invalid_kiosk_event");
    checkProducer("KIOSK", event.name);
    return db.$transaction(async (tx) => {
      const session = await tx.customerSession.findFirst({
        where: {
          id: sessionId,
          device: { kind: "KIOSK", keyHash, revokedAt: null, expiresAt: { gt: new Date() } },
        },
      });
      const now = Date.now(),
        stamp = event.occurredAt.getTime();
      const initial = session?.createdAt.getTime();
      const cutoff = Math.min(
        now,
        session?.expiresAt.getTime() ?? 0,
        session?.endedAt?.getTime() ?? now,
      );
      if (
        initial === undefined ||
        stamp < initial - 120000 ||
        stamp > cutoff + 120000 ||
        now - stamp > 86400000
      ) {
        throw new HttpError(403, "invalid_event_scope");
      }
      return writeEvent(tx, session!, "KIOSK", event);
    });
  });
