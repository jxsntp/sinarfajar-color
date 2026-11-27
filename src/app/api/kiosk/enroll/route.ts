import { cookies } from "next/headers";
import { bearer, endpoint, requireOrigin, HttpError } from "@/lib/http";
import { digest } from "@/lib/credentials";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { networkQuota } from "@/lib/security";
export const POST = (req: Request) =>
  endpoint("kiosk.enroll", async () => {
    requireOrigin(req);
    await networkQuota(req, "device-enroll", 45);
    const key = bearer(req);
    const device = await db.device.findFirst({
      where: {
        keyHash: digest(key, "device"),
        kind: "KIOSK",
        revokedAt: null,
        expiresAt: { gt: new Date() },
        organization: { slug: env().CLIENT_SLUG },
      },
      select: { expiresAt: true },
    });
    if (!device) throw new HttpError(401, "invalid_device");
    (await cookies()).set("inaura_device", key, {
      httpOnly: true,
      secure: env().APP_ENV !== "development",
      sameSite: "strict",
      path: "/",
      maxAge: Math.min(30 * 86400, Math.floor((device.expiresAt.getTime() - Date.now()) / 1000)),
    });
    return { connected: true };
  });
