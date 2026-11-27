import { z } from "zod";
import { endpoint, requireOrigin } from "@/lib/http";
import { currentStaff } from "@/domains/authentication/staff";
import { db } from "@/lib/db";
export const PATCH = (req: Request) =>
  endpoint("organization.update", async () => {
    requireOrigin(req);
    const scope = await currentStaff("admin");
    const data = z
      .object({
        name: z.string().trim().min(1).max(100),
        locale: z.enum(["id-ID", "en-US"]),
        accent: z.string().regex(/^#[a-f0-9]{6}$/i),
      })
      .strict()
      .parse(await req.json());
    return db.organization.update({
      where: { id: scope.organizationId },
      data,
      select: { name: true, locale: true, accent: true },
    });
  });
