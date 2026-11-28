import { pageStaff } from "@/components/operations";
import Link from "next/link";
import { listStores } from "@/domains/stores/service";
import { catalogCount } from "@/domains/catalog/products";
import { DeviceForm } from "./device-form";
export default async function Admin() {
  const scope = await pageStaff("admin");
  const [stores, count] = await Promise.all([
    listStores(scope),
    catalogCount(scope.organizationId),
  ]);
  return (
    <>
      <Link className="text-button" href="/admin/catalog">
        Manage product catalog
      </Link>
      <Link className="text-button" href="/admin/calibration">
        Calibrate a station camera
      </Link>
      <dl>
        <dt>Active catalog products</dt>
        <dd>{count}</dd>
      </dl>
      <DeviceForm stores={stores} />
    </>
  );
}
