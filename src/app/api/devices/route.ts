import { z } from "zod";
import { endpoint, requireOrigin } from "@/lib/http";
import { currentStaff } from "@/domains/authentication/staff";
import { registerDevice, revokeDevice } from "@/domains/devices/service";
export const POST = (req: Request) =>
  endpoint(
    "devices.register",
    async () => {
      requireOrigin(req);
      const scope = await currentStaff("admin");
      const input = z
        .object({
          storeId: z.uuid(),
          label: z.string().trim().min(1).max(80),
          kind: z.enum(["KIOSK", "POS"]).default("KIOSK"),
        })
        .strict()
        .parse(await req.json());
      return registerDevice(scope, input.storeId, input.label, input.kind);
    },
    201,
  );
export const DELETE = (req: Request) =>
  endpoint("devices.revoke", async () => {
    requireOrigin(req);
    const scope = await currentStaff("admin");
    const input = z
      .object({ id: z.uuid() })
      .strict()
      .parse(await req.json());
    return revokeDevice(scope, input.id);
  });
