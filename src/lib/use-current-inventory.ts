"use client";

import { useEffect, useState } from "react";
import type { readResult } from "@/domains/recommendations/discovery";

export type InventoryResult = Awaited<ReturnType<typeof readResult>>;

export function useCurrentInventory(token: string, baseline: InventoryResult | null) {
  const runId = baseline?.runId;
  const [check, setCheck] = useState<{ baseline: InventoryResult; result: InventoryResult | null }>();
  useEffect(() => {
    if (!baseline || !runId) return;
    let request: AbortController | undefined;
    const unavailable = () => {
      request?.abort();
      setCheck({ baseline, result: null });
    };
    const refresh = async () => {
      if (!navigator.onLine) return unavailable();
      if (document.visibilityState !== "visible") return;
      request?.abort();
      const controller = new AbortController();
      request = controller;
      try {
        const response = await fetch("/api/mobile/discovery?runId=" + encodeURIComponent(runId), {
          cache: "no-store",
          headers: { Authorization: "Bearer " + token },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
        });
        if (!response.ok) throw new Error("inventory_unavailable");
        const { data } = await response.json() as { data: InventoryResult };
        if (controller.signal.aborted) return;
        setCheck({ baseline, result: data.status === "complete" ? data : null });
      } catch {
        if (!controller.signal.aborted) setCheck({ baseline, result: null });
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("offline", unavailable);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      request?.abort();
      window.clearInterval(timer);
      window.removeEventListener("offline", unavailable);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [baseline, runId, token]);

  return check && check.baseline === baseline ? check.result : baseline;
}

export function inventoryUnavailable(locale: string) {
  return locale.startsWith("id")
    ? "Harga dan stok belum dapat diverifikasi. Sambungkan kembali untuk memperbarui."
    : "Prices and availability cannot be verified. Reconnect to refresh.";
}
