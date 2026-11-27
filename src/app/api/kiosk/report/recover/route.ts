import { bearer, endpoint, requireOrigin } from "@/lib/http";
import { networkQuota } from "@/lib/security";
import { recoverReport } from "@/domains/sessions/service";
export const POST = (req: Request) => endpoint("kiosk.report.recover", async () => {
  requireOrigin(req);
  await networkQuota(req, "report-recover", 120);
  return recoverReport(bearer(req));
});
