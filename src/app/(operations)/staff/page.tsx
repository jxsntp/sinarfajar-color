import Link from "next/link";
import { pageStaff } from "@/components/operations";
import { listStores } from "@/domains/stores/service";
import { StaffQueue } from "./staff-queue";

export default async function Staff() {
  const scope = await pageStaff("staff");
  const stores = await listStores(scope);
  return (
    <>
      {scope.role !== "SALES_ASSOCIATE" && (
        <p>
          <Link className="text-button" href="/staff/sales">
            Sales reconciliation and metrics
          </Link>
        </p>
      )}
      {stores.length ? (
        <StaffQueue stores={stores} />
      ) : (
        <p>No stores are assigned.</p>
      )}
    </>
  );
}
