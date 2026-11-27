import type { Prisma } from "@prisma/client";
import { digest } from "@/lib/credentials";
import { HttpError } from "@/lib/http";
export async function posStore(tx: Prisma.TransactionClient, token: string) {
  const device = await tx.device.findFirst({
    where: { keyHash: digest(token, "pos"), kind: "POS", revokedAt: null, expiresAt: { gt: new Date() } },
    select: { organizationId: true, storeId: true },
  });
  if (!device) throw new HttpError(401, "invalid_pos");
  return device;
}
