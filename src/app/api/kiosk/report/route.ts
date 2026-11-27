import { bearer, endpoint, requireOrigin } from "@/lib/http";
import { boundedJson, networkQuota } from "@/lib/security";
import { issueReport, reportInput } from "@/domains/sessions/service";

export const POST = (req: Request) =>
  endpoint("kiosk.report", async () => {
    requireOrigin(req);
    await networkQuota(req, "report-issue", 300);
    return issueReport(bearer(req), reportInput.parse(await boundedJson(req, 2048)), req.headers.get("host"));
  }, 201);
