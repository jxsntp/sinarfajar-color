import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { boundedJson } from "@/lib/security";
import { z } from "zod";
import { db } from "@/lib/db";
import { bearer, endpoint, HttpError, requireOrigin } from "@/lib/http";
import { currentStaff } from "@/domains/authentication/staff";
import { operationStore } from "@/domains/operations/store";
import {
  dispatchAlerts,
  raiseAlert,
  refreshWaitAlerts,
} from "@/domains/operations/alerts";

const hash = (value: string) => createHash("sha256").update(value).digest();
export const POST = (req: Request) =>
  endpoint("operations.notifications", async () => {
    const input = z
      .object({
        storeId: z.uuid(),
        action: z.enum(["dispatch", "incident"]),
        reason: z
          .enum(["device_unavailable", "stock_check", "service_interruption"])
          .optional(),
      })
      .strict()
      .parse(await boundedJson(req));
    if (req.headers.has("authorization")) {
      const secret = process.env.OPS_JOB_TOKEN;
      if (
        env().APP_ENV !== "development" ||
        input.action !== "dispatch" ||
        !secret ||
        !timingSafeEqual(hash(bearer(req)), hash(secret))
      )
        throw new HttpError(401, "invalid_task_credential");
      const store = await db.store.findUnique({
        where: { id: input.storeId },
        select: { id: true, organizationId: true },
      });
      if (!store) throw new HttpError(404, "store_unavailable");
      const scope = { organizationId: store.organizationId, storeId: store.id };
      await refreshWaitAlerts(scope);
      return dispatchAlerts(scope);
    }
    requireOrigin(req);
    const staff = await currentStaff("staff");
    const scope = await operationStore(staff, input.storeId, true);
    if (input.action === "incident") {
      if (!input.reason) throw new HttpError(400, "incident_reason_required");
      await db.$transaction((tx) =>
        raiseAlert(tx, scope, "INCIDENT", randomUUID(), input.reason!),
      );
      return { recorded: true };
    }
    await refreshWaitAlerts(scope);
    return dispatchAlerts(scope);
  });
