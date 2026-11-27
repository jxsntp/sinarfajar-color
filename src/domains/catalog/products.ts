import { db } from "@/lib/db";
export function catalogCount(organizationId: string) {
  return db.product.count({ where: { organizationId, archived: false } });
}
