import Link from "next/link";
import { pageStaff } from "@/components/operations";
import { listStores } from "@/domains/stores/service";
import { photoCatalogRow, photoVisionSettings } from "@/domains/catalog/photo-catalog";
import { db } from "@/lib/db";
import { PhotoCatalogEditor } from "./photo-catalog-editor";

export default async function CatalogPhotos({ searchParams }: {
  searchParams: Promise<{ store?: string; page?: string }>;
}) {
  const scope = await pageStaff("admin");
  const stores = await listStores(scope);
  const filter = await searchParams;
  const storeId = stores.find((store) => store.id === filter.store)?.id ?? stores[0]?.id;
  const page = Math.max(1, Math.min(10000, Number.parseInt(filter.page ?? "1", 10) || 1));
  const limit = 24;
  const rows = storeId ? await db.photoCatalogItem.findMany({
    where: { organizationId: scope.organizationId, storeId, state: { not: "ARCHIVED" } },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: (page - 1) * limit,
    take: limit + 1,
  }) : [];
  const link = (value: number) =>
    "?" + new URLSearchParams({ store: storeId ?? "", page: String(value) });
  return (
    <>
      <Link href="/admin/catalog">Product catalog</Link>
      <h2>Photo catalog</h2>
      <p>Review visual tags before publishing a piece to the mobile color trial.</p>
      {storeId ? <>
        <form className="controls">
          <label>
            Store
            <select name="store" defaultValue={storeId}>
              {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select>
          </label>
          <button className="text-button">Show photos</button>
        </form>
        <PhotoCatalogEditor key={storeId + page} storeId={storeId}
          rows={rows.slice(0, limit).map(photoCatalogRow)} vision={Boolean(photoVisionSettings())} />
        <nav aria-label="Photo catalog pages">
          {page > 1 && <Link href={link(page - 1)}>Previous page</Link>}
          {rows.length > limit && <Link href={link(page + 1)}>Next page</Link>}
        </nav>
      </> : <p>Create a store before uploading catalog photos.</p>}
    </>
  );
}
