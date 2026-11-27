import { Prisma } from "@prisma/client";
import { verifiedInventory } from "../inventory/freshness";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { allow, type StaffScope } from "../authentication/access";
import type { Preferences, ProductInput } from "./input";
import { visibleColors, type VisibleColor } from "./visible-colors";
export type Tx = Prisma.TransactionClient;
export type StoreScope = { organizationId: string; storeId: string };
const details = {
  brand: true,
  manufacturer: true,
  images: { orderBy: { createdAt: "asc" as const } },
};
export async function ownedStore(tx: Tx, scope: StaffScope, storeId: string) {
  allow(scope, "admin");
  const store = await tx.store.findFirst({
    where: { id: storeId, organizationId: scope.organizationId },
  });
  if (!store) throw new HttpError(404, "unknown_store");
  return { organizationId: scope.organizationId, storeId };
}
export const snapshot = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value));
export async function audit(
  tx: Tx,
  scope: StaffScope,
  subject: string,
  action: string,
  before: unknown,
  after: unknown,
) {
  await tx.catalogAudit.create({
    data: {
      organizationId: scope.organizationId,
      actorId: scope.userId,
      subject,
      action,
      before: before == null ? Prisma.JsonNull : snapshot(before),
      after: after == null ? Prisma.JsonNull : snapshot(after),
    },
  });
}
export async function lockCatalog(tx: Tx, organizationId: string) {
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId}::uuid FOR UPDATE`;
}
export async function saveProduct(
  tx: Tx,
  scope: StaffScope,
  storeId: string,
  input: ProductInput,
  mode: "create" | "edit",
) {
  const scopeKey = await ownedStore(tx, scope, storeId);
  const { organizationId } = scopeKey;
  await lockCatalog(tx, organizationId);
  const key = { organizationId, sku: input.sku };
  const include = { ...details, stock: { where: scopeKey } };
  const before = await tx.product.findUnique({
    where: { organizationId_sku: key },
    include,
  });
  if (mode === "create" && before) throw new HttpError(409, "duplicate_sku");
  if (mode === "edit" && !before) throw new HttpError(404, "unknown_product");
  const brandKey = { organizationId, name: input.brand };
  const brand = await tx.brand.upsert({
    where: { organizationId_name: brandKey },
    create: brandKey,
    update: {},
  });
  const makerKey = { organizationId, name: input.manufacturer ?? "" };
  const maker = input.manufacturer
    ? await tx.manufacturer.upsert({
        where: { organizationId_name: makerKey },
        create: makerKey,
        update: {},
      })
    : null;
  if (
    input.photoPath &&
    (!input.photoPath.startsWith(organizationId + "/") ||
      input.photoPath.includes("..") ||
      input.photoPath.includes("//"))
  )
    throw new HttpError(400, "invalid_photo_path");
  const fields = {
    name: input.name,
    barcode: input.barcode ?? null,
    brandId: brand.id,
    manufacturerId: maker?.id ?? null,
    category: input.category,
    goldColor: input.goldColor,
    purity: input.purity,
    weightGrams: input.weightGrams ?? null,
    gemstones: input.gemstones ?? null,
    ...(input.visibleColors === undefined ? {} : { visibleColors: snapshot(input.visibleColors) }),
    styleTags: input.styleTags,
    occasionTags: input.occasionTags,
  };
  const product = await tx.product.upsert({
    where: { organizationId_sku: key },
    create: { ...key, ...fields },
    update: fields,
  });
  const inventoryKey = { ...scopeKey, productId: product.id };
  const stock = {
    price: input.price,
    onHand: input.onHand,
    verifiedAt: new Date(),
    displayLocation: input.displayLocation ?? null,
  };
  await tx.inventory.upsert({
    where: { organizationId_storeId_productId: inventoryKey },
    create: { ...inventoryKey, ...stock },
    update: stock,
  });
  if (input.photoPath !== before?.images[0]?.storagePath) {
    await tx.productImage.deleteMany({
      where: { organizationId, productId: product.id },
    });
    if (input.photoPath)
      await tx.productImage.create({
        data: {
          organizationId,
          productId: product.id,
          storagePath: input.photoPath,
          alt: input.name,
        },
      });
  }
  const after = await tx.product.findUniqueOrThrow({
    where: { organizationId_sku: key },
    include,
  });
  await audit(tx, scope, input.sku, mode, before, after);
  return { sku: input.sku };
}
export async function archiveProduct(scope: StaffScope, sku: string) {
  allow(scope, "admin");
  return db.$transaction(async (tx) => {
    await lockCatalog(tx, scope.organizationId);
    const where = {
      organizationId_sku: { organizationId: scope.organizationId, sku },
    };
    const before = await tx.product.findUnique({ where });
    if (!before) throw new HttpError(404, "unknown_product");
    if (!before.archived) {
      await tx.product.update({ where, data: { archived: true } });
      await audit(
        tx,
        scope,
        sku,
        "archive",
        { archived: false },
        { archived: true },
      );
    }
    return { archived: true };
  });
}
export async function savePartner(
  scope: StaffScope,
  kind: "brand" | "manufacturer",
  name: string,
  id?: string,
) {
  allow(scope, "admin");
  return db.$transaction(async (tx) => {
    const { organizationId } = scope;
    await lockCatalog(tx, organizationId);
    const where = { organizationId_id: { organizationId, id: id ?? "" } };
    const before = id
      ? kind === "brand"
        ? await tx.brand.findUnique({ where })
        : await tx.manufacturer.findUnique({ where })
      : null;
    if (id && !before) throw new HttpError(404, "unknown_partner");
    const data = { name, organizationId };
    const after =
      kind === "brand"
        ? id
          ? await tx.brand.update({ where, data: { name } })
          : await tx.brand.create({ data })
        : id
          ? await tx.manufacturer.update({ where, data: { name } })
          : await tx.manufacturer.create({ data });
    await audit(tx, scope, after.id, kind, before, after);
    return after;
  });
}
export class ProductCatalogService {
  constructor(private readonly connection: Tx = db) {}
  async eligible(
    scope: StoreScope,
    prefs: Preferences,
    skus?: string[],
    candidateLimit = 24,
    afterSku?: string,
  ) {
    const matches = (value: string) => ({
      equals: value,
      mode: "insensitive" as const,
    });
    const rows = await this.connection.inventory.findMany({
      where: {
        organizationId: scope.organizationId,
        storeId: scope.storeId,
        currency: "IDR",
        onHand: { gt: 0 },
        ...verifiedInventory(),
        price: { gte: prefs.minBudget, lte: prefs.maxBudget },
        product: {
          organizationId: scope.organizationId,
          archived: false,
          sku: { in: skus, gt: afterSku },
          category: prefs.category ? matches(prefs.category) : undefined,
          goldColor: prefs.requiredGold
            ? matches(prefs.requiredGold)
            : undefined,
          purity: prefs.requiredPurity
            ? matches(prefs.requiredPurity)
            : undefined,
          brand: prefs.requiredBrand
            ? { name: matches(prefs.requiredBrand) }
            : undefined,
        },
      },
      include: { product: { include: details } },
      orderBy: { product: { sku: "asc" } },
      take: candidateLimit,
    });
    return rows.map(({ price, currency, product: p }) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      category: p.category,
      brand: p.brand.name,
      goldColor: p.goldColor.toLowerCase(),
      purity: p.purity,
      price: price.toFixed(2),
      currency,
      weightGrams: p.weightGrams?.toString() ?? null,
      gemstones: p.gemstones,
      visibleColors: visibleColors(p.visibleColors),
      styleTags: p.styleTags,
      occasionTags: p.occasionTags,
      photoPath: p.images.at(0)?.storagePath ?? null,
    }));
  }
  async *eligiblePages(scope: StoreScope, prefs: Preferences) {
    let afterSku: string | undefined;
    for (;;) {
      const page = await this.eligible(scope, prefs, undefined, 100, afterSku);
      if (page.length) yield page;
      if (page.length < 100) return;
      afterSku = page[page.length - 1].sku;
    }
  }
}
type CatalogCandidate = Awaited<ReturnType<ProductCatalogService["eligible"]>>[number];
export type Candidate = Omit<CatalogCandidate, "visibleColors"> & { visibleColors?: VisibleColor[] };
