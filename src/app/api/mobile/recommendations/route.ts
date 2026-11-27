import { bearer, endpoint, requireOrigin, HttpError } from "@/lib/http";
import { z } from "zod";
import { reportScope } from "@/domains/sessions/service";
import { activate } from "@/domains/recommendations/discovery";
import { preferenceInput } from "@/domains/catalog/input";
import { boundedJson, consumeQuota, networkQuota } from "@/lib/security";
export const POST = (req: Request) =>
  endpoint("mobile.activate", async () => {
    requireOrigin(req);
    if ([req.headers.get("purpose"), req.headers.get("sec-purpose")].some((value) => /prefetch|prerender|preview/i.test(value ?? ""))) throw new HttpError(403, "activation_required");
    const token = bearer(req);
    await networkQuota(req, "activation", 150);
    const session = await reportScope(token);
    await consumeQuota("activation:report", session.id, 16, 60);
    const key = z.uuid().parse(req.headers.get("idempotency-key"));
    const { preferences } = z
      .object({ preferences: preferenceInput })
      .strict()
      .parse(await boundedJson(req));
    return activate(token, key, preferences);
  });
