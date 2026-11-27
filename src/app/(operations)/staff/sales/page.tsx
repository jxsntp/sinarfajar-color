import { notFound } from "next/navigation";
import Link from "next/link";
import { pageStaff } from "@/components/operations";
import { listStores } from "@/domains/stores/service";
import { SalesTools } from "./sales-tools";

export default async function StoreSales() {
  const scope = await pageStaff("staff");
  if (scope.role === "SALES_ASSOCIATE") notFound();
  const stores = await listStores(scope);
  return (
    <>
      <Link className="text-button" href="/staff">
        Staff queue
      </Link>
      <h2>Sales reconciliation and metrics</h2>
      {stores.length ? (
        <SalesTools stores={stores} />
      ) : (
        <p>No stores are assigned.</p>
      )}
    </>
  );
}
