import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { endpoint, HttpError } from "@/lib/http";
import { networkQuota, verifySignedJob } from "@/lib/security";
import { enforceRetention } from "@/domains/privacy/service";
import { dispatchAlerts, refreshWaitAlerts } from "@/domains/operations/alerts";

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("retention") }).strict(),
  z.object({ action: z.literal("dispatch"), storeId: z.uuid() }).strict(),
]);
export const POST = (req: Request) => endpoint("jobs.execute", async () => {
  await networkQuota(req, "internal-jobs", 180);
  const job = input.parse(await verifySignedJob(req, env().INBOUND_JOB_SECRET));
  if (job.action === "retention") return enforceRetention();
  const store = await db.store.findUnique({
    where: { id: job.storeId }, select: { id: true, organizationId: true },
  });
  if (!store) throw new HttpError(404, "store_unavailable");
  const scope = { organizationId: store.organizationId, storeId: store.id };
  await refreshWaitAlerts(scope);
  return dispatchAlerts(scope);
});
