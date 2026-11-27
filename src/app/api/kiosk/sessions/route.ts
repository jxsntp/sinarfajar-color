import { networkQuota } from "@/lib/security";
import { endpoint } from "@/lib/http";
import { deviceKey } from "@/lib/kiosk-http";
import { startSession } from "@/domains/sessions/service";
export const POST = (req: Request) =>
  endpoint("kiosk.start", async () => {
    await networkQuota(req, "kiosk-start", 180);
    return startSession(await deviceKey(req), req.headers.get("host"));
  }, 201);
