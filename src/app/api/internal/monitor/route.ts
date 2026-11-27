import { bearer, endpoint, HttpError } from "@/lib/http";
import { env } from "@/lib/env";
import { consumeQuota, secureEqual } from "@/lib/security";
import { operationalSnapshot } from "@/domains/operations/monitor";

export const GET = (req: Request) => endpoint("monitor.snapshot", async () => {
  const key = env().MONITOR_TOKEN;
  if (!key || !secureEqual(bearer(req), key)) throw new HttpError(401, "monitor_denied");
  await consumeQuota("monitor", "collector", 30, 60);
  return operationalSnapshot();
});
