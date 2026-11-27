import { z } from "zod";
import { endpoint, requireOrigin } from "@/lib/http";
import { currentStaff } from "@/domains/authentication/staff";
import { revokeReport } from "@/domains/sessions/service";
export const POST = (req: Request) =>
  endpoint("reports.revoke", async () => {
    requireOrigin(req);
    const scope = await currentStaff("admin");
    const { sessionId } = z
      .object({ sessionId: z.uuid() })
      .strict()
      .parse(await req.json());
    return revokeReport(scope, sessionId);
  });
