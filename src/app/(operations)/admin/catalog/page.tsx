import Link from "next/link";
import { pageStaff } from "@/components/operations";
import { listStores } from "@/domains/stores/service";
import { db } from "@/lib/db";
import { CatalogEditor } from "./editor";
import { ImportForm } from "./import-form";
import { visibleColors } from "@/domains/catalog/visible-colors";
export default async function Catalog({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; q?: string; page?: string }>;
}) {
  const scope = await pageStaff("admin");
  const stores = await listStores(scope);
  const filter = await searchParams,
    storeId = stores.find((s) => s.id === filter.store)?.id ?? stores[0]?.id;
  if (!storeId) return <p>Create a store before adding inventory.</p>;
  const page = Math.max(
    1,
    Math.min(10000, Number.parseInt(filter.page ?? "1") || 1),
  );
  const q = (filter.q ?? "").slice(0, 90);
  const organizationId = scope.organizationId;
  const [products, brands, makers, history] = await Promise.all([
    db.product.findMany({
      where: {
        organizationId,
        OR: [
          { sku: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
        ],
      },
      include: {
        brand: true,
        manufacturer: true,
        images: { orderBy: { createdAt: "asc" } },
        stock: { where: { organizationId, storeId } },
      },
      orderBy: { sku: "asc" },
      skip: (page - 1) * 30,
      take: 31,
    }),
    db.brand.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
    db.manufacturer.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
    }),
    db.catalogAudit.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ]);
  const rows = products
    .slice(0, 30)
    .map((p) => ({
      sku: p.sku,
      barcode: p.barcode ?? "",
      name: p.name,
      archived: p.archived,
      brand: p.brand.name,
      manufacturer: p.manufacturer?.name ?? "",
      category: p.category,
      goldColor: p.goldColor,
      purity: p.purity,
      weightGrams: p.weightGrams?.toString() ?? "",
      gemstones: p.gemstones ?? "",
      visibleColors: visibleColors(p.visibleColors),
      styleTags: p.styleTags.join("|"),
      occasionTags: p.occasionTags.join("|"),
      price: p.stock[0]?.price.toFixed(2) ?? "",
      onHand: String(p.stock[0]?.onHand ?? 0),
      displayLocation: p.stock[0]?.displayLocation ?? "",
      photoPath: p.images[0]?.storagePath ?? "",
    }));
  const link = (n: number) =>
    "?" + new URLSearchParams({ store: storeId, q, page: String(n) });
  return (
    <>
      <h2>Product catalog</h2>
      <Link href={"/admin/catalog/photos?" + new URLSearchParams({ store: storeId })}>Manage photo catalog</Link>
      <form className="controls">
        <label>
          Store
          <select name="store" defaultValue={storeId}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          SKU or product name
          <input name="q" defaultValue={q} />
        </label>
        <button className="text-button">Filter</button>
      </form>
      <CatalogEditor
        key={storeId + q + page}
        rows={rows}
        storeId={storeId}
        brands={brands.map(({ id, name }) => ({ id, name }))}
        makers={makers.map(({ id, name }) => ({ id, name }))}
      />
      <nav>
        {page > 1 && <Link href={link(page - 1)}>Previous page</Link>}
        {products.length > 30 && <Link href={link(page + 1)}>Next page</Link>}
      </nav>
      <ImportForm storeId={storeId} />
      <h2>Recent changes</h2>
      {history.length ? (
        <ul>
          {history.map((h) => (
            <li key={h.id}>
              {h.action} · {h.subject} ·{" "}
              <time>{h.createdAt.toISOString()}</time>
            </li>
          ))}
        </ul>
      ) : (
        <p>No catalog changes recorded.</p>
      )}
    </>
  );
}
