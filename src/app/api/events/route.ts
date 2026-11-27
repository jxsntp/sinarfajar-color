import { boundedJson, networkQuota } from "@/lib/security";
import { z } from "zod";
import { bearer, endpoint, requireOrigin } from "@/lib/http";
import { ingest, ingestInput, readEvents } from "@/domains/analytics/ingest";
export const POST = (req: Request) =>
  endpoint("events.ingest", async () => {
    requireOrigin(req);
    const purpose = [
      req.headers.get("purpose"),
      req.headers.get("sec-purpose"),
      req.headers.get("user-agent"),
    ].join(" ");
    if (/prefetch|prerender|preview|crawler|bot/i.test(purpose))
      return { recorded: false };
    await networkQuota(req, "events", 900);
    return ingest(
      req.headers.has("authorization") ? bearer(req) : null,
      ingestInput.parse(await boundedJson(req)),
    );
  });
export const GET = (req: Request) =>
  endpoint("events.read", () =>
    readEvents(z.uuid().parse(new URL(req.url).searchParams.get("sessionId"))),
  );
