import { db } from "@/lib/db";
import { storeFilter, type StaffScope } from "../authentication/access";
export function saleCount(scope: StaffScope) {
  return db.transaction.count({ where: storeFilter(scope) });
}
