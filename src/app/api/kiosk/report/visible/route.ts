import { z } from "zod";
import { db } from "@/lib/db";
import { bearer, endpoint, requireOrigin, HttpError } from "@/lib/http";
import { boundedJson, networkQuota } from "@/lib/security";
import { kioskScope, markHandoff } from "@/domains/sessions/service";

const input = z.object({ token: z.string().regex(/^report_[A-Za-z0-9_-]{43}$/) }).strict();
export const POST = (req: Request) => endpoint("kiosk.report.visible", async () => {
  requireOrigin(req);
  await networkQuota(req, "report-visible", 300);
  const kioskToken = bearer(req);
  const { token } = input.parse(await boundedJson(req, 256));
  return db.$transaction(async (tx) => {
    const scope = await kioskScope(tx, kioskToken);
    if (!(await markHandoff(tx, scope, token))) throw new HttpError(409, "report_visibility_unavailable");
    return { acknowledged: true };
  });
});
