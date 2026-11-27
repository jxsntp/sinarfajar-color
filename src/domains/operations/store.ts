import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { allow, type StaffScope } from "../authentication/access";

export async function operationStore(
  scope: StaffScope,
  storeId: string,
  manager = false,
) {
  allow(scope, "staff");
  if (manager && scope.role === "SALES_ASSOCIATE")
    throw new HttpError(403, "manager_required");
  if (scope.storeId && scope.storeId !== storeId)
    throw new HttpError(404, "store_unavailable");
  const store = await db.store.findFirst({
    where: { id: storeId, organizationId: scope.organizationId },
    select: { id: true, organizationId: true, timeZone: true },
  });
  if (!store) throw new HttpError(404, "store_unavailable");
  return { storeId: store.id, organizationId: store.organizationId };
}
