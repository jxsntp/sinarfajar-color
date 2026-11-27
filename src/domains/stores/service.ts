import { db } from "@/lib/db";
import { type StaffScope, allow } from "../authentication/access";
export function listStores(scope: StaffScope) {
  return db.store.findMany({
    where: {
      organizationId: scope.organizationId,
      ...(scope.storeId ? { id: scope.storeId } : {}),
    },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });
}
export function createStore(scope: StaffScope, code: string, name: string) {
  allow(scope, "admin");
  return db.store.create({
    data: { organizationId: scope.organizationId, code, name },
    select: { id: true, code: true, name: true },
  });
}
