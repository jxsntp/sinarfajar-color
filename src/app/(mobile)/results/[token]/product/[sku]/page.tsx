import { notFound } from "next/navigation";
import { mobileSession } from "@/domains/sessions/report";
import { db } from "@/lib/db";
import { readResult } from "@/domains/recommendations/discovery";
import { photoUrl } from "@/domains/catalog/photo";
import { ProductVisibility } from "../../discover/discovery-form";
import Image from "next/image";
import { z } from "zod";
import Link from "next/link";
import { brandFor } from "@/domains/organizations/branding";
import { stylingReason } from "@/domains/recommendations/reason-copy";
import { mobileText } from "@/domains/sessions/mobile-copy";
import { InventoryGuard } from "./inventory-guard";
import { Inquiry } from "./inquiry";
export default async function Product({
  params,
  searchParams,
}: {
  params: Promise<{ token: string; sku: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const { token, sku } = await params;
  const scope = await mobileSession(token);
  const runId = (await searchParams).run;
  if (runId && !z.uuid().safeParse(runId).success) notFound();
  const run = await db.recommendationRun.findFirst({
    where: {
      id: runId,
      organizationId: scope.organizationId,
      sessionId: scope.id,
      items: { some: { product: { sku } } },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!run) notFound();
  const result = await readResult(token, run.id);
  const p = result.items.find((item) => item.sku === sku);
  if (!p) notFound();
  const brand = await brandFor(scope.organizationId);
  const text = mobileText(brand.locale);
  return (
    <InventoryGuard token={token} baseline={result} sku={sku} price={p.price} currency={p.currency} locale={brand.locale}>
      <ProductVisibility token={token} item={p} runId={run.id} detail />
      <Link
        prefetch={false}
        className="text-button"
        href={"/results/" + token + "/discover"}
      >
        {text.title}
      </Link>
      <h1>{p.name}</h1>
      {p.photoPath && (
        <Image
          unoptimized
          src={photoUrl(p.photoPath)}
          alt={p.name}
          width={540}
          height={540}
        />
      )}
      <p>
        {p.brand} · {p.sku} · {p.purity}
      </p>
      <p>
        {p.goldColor} {p.weightGrams && " · " + p.weightGrams + " g"}
      </p>
      <p>{p.gemstones}</p>
      <p>{text.available}</p>
      <p>{stylingReason(p.reason, brand.locale)}</p>
      <Inquiry token={token} sku={p.sku} runId={run.id} locale={brand.locale} />
      <p>
        {p.currency} {p.price}
      </p>
    </InventoryGuard>
  );
}
