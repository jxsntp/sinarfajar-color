import { db } from "@/lib/db";
import { digest } from "@/lib/credentials";
import { endpoint, HttpError } from "@/lib/http";
import { deviceKey } from "@/lib/kiosk-http";
import { networkQuota } from "@/lib/security";

export const POST = (req: Request) =>
  endpoint("kiosk.heartbeat", async () => {
    await networkQuota(req, "kiosk-heartbeat", 600);
    const now = new Date();
    const where = { keyHash: digest(await deviceKey(req), "device"), kind: "KIOSK" as const, revokedAt: null, expiresAt: { gt: now } };
    if (!(await db.device.findFirst({ where, select: { id: true } }))) {
      throw new HttpError(401, "invalid_device");
    }
    await db.device.updateMany({
      where: { ...where, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: new Date(now.getTime() - 45000) } }] },
      data: { lastSeenAt: now },
    });
    return { connected: true };
  });
