"use client";

import type { ReactNode } from "react";
import { inventoryUnavailable, useCurrentInventory, type InventoryResult } from "@/lib/use-current-inventory";

export function InventoryGuard({ token, baseline, sku, price, currency, locale, children }: {
  token: string; baseline: InventoryResult; sku: string; price: string; currency: string; locale: string; children: ReactNode;
}) {
  const current = useCurrentInventory(token, baseline)?.items.find((item) => item.sku === sku);
  if (!current) return <p role="status">{inventoryUnavailable(locale)}</p>;
  if (current.price !== price || current.currency !== currency) {
    return <p role="status">{locale.startsWith("id") ? "Harga berubah. Muat ulang halaman untuk melihat harga terbaru." : "The price changed. Reload the page to see the current price."}</p>;
  }
  return children;
}
