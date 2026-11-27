import { z } from "zod";
import { db } from "@/lib/db";
import { bearer, endpoint, requireOrigin } from "@/lib/http";
import { boundedJson } from "@/lib/security";
import { cameraNotice } from "@/domains/color-analysis/stations";
import { kioskScope } from "@/domains/sessions/service";

export const POST = (req: Request) =>
  endpoint("kiosk.consent", async () => {
    requireOrigin(req);
    const token = bearer(req);
    const { assisted, camera, version } = z
      .object({ assisted: z.boolean(), camera: z.boolean(), version: z.literal(cameraNotice).optional() })
      .strict()
      .parse(await boundedJson(req, 1024));
    return db.$transaction(async (tx) => {
      const session = await kioskScope(tx, token);
      await tx.customerSession.update({
        where: { id: session.id, organizationId: session.organizationId },
        data: { assisted },
      });
      const { id } = await tx.consent.create({
        data: {
          organizationId: session.organizationId,
          sessionId: session.id,
          purpose: "local_camera",
          version: version ?? "studio-v1",
          granted: camera,
        },
      });
      return { consentId: id };
    });
  });
