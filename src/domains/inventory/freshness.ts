import type { Prisma } from "@prisma/client";
import { env } from "@/lib/env";

export function verifiedInventory(now = Date.now()): Prisma.InventoryWhereInput {
  const minutes = env().INVENTORY_MAX_AGE_MINUTES;
  if (minutes === undefined || minutes === "off") return {};
  const gte = new Date(now - minutes * 60000);
  const lte = new Date(now);
  return {
    OR: [
      { posSyncedAt: { gte, lte } },
      { verifiedAt: { gte, lte } },
    ],
  };
}
