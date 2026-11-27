import { db } from "@/lib/db";
import { storeFilter, type StaffScope } from "../authentication/access";
export function stockedLines(scope: StaffScope) {
  return db.inventory.count({
    where: {
      ...storeFilter(scope),
      onHand: { gt: 0 },
      product: { archived: false },
    },
  });
}
