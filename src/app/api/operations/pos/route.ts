import { boundedJson, networkQuota } from "@/lib/security";
import { z } from "zod";
import { db } from "@/lib/db";
import { bearer, endpoint, requireOrigin } from "@/lib/http";
import { currentStaff } from "@/domains/authentication/staff";
import { posStore } from "@/domains/integrations/pos";
import { operationStore } from "@/domains/operations/store";
import {
  mockPOSAdapter,
  runPOS,
  posCommand,
} from "@/domains/transactions/adapter";
export const POST = (req: Request) =>
  endpoint("pos.operation", async () => {
    await networkQuota(req, "pos-operation", 300);
    if (req.headers.has("authorization")) {
      const scope = await posStore(db, bearer(req));
      return runPOS(mockPOSAdapter, scope, posCommand.parse(await boundedJson(req, 131072)));
    }
    requireOrigin(req);
    const staff = await currentStaff("staff");
    const { storeId, command } = z
      .object({ storeId: z.uuid(), command: posCommand })
      .strict()
      .parse(await boundedJson(req, 131072));
    const scope = await operationStore(staff, storeId, command.type !== "link");
    return runPOS(mockPOSAdapter, scope, command);
  });
