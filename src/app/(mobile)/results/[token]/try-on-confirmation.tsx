"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
type TryOn = {
  id: string;
  customerConfirmedAt: string | null;
  product: { name: string };
};
export function TryOnConfirmation({
  token,
  locale,
}: {
  token: string;
  locale: string;
}) {
  const en = locale === "en-US";
  const [rows, setRows] = useState<TryOn[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function action(id?: string) {
    setBusy(true);
    setError("");
    const headers = {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    };
    try {
      if (id) {
        const result = await fetch("/api/mobile/try-ons", {
          method: "POST",
          headers,
          body: JSON.stringify({ id }),
        });
        if (!result.ok) throw new Error();
      }
      const result = await fetch("/api/mobile/try-ons", {
        headers,
        cache: "no-store",
      });
      if (!result.ok) throw new Error();
      setRows((await result.json()).data);
    } catch {
      setError(
        en
          ? "Try-on confirmation is unavailable."
          : "Konfirmasi coba perhiasan belum tersedia.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary>
        {en ? "Confirm a store try-on" : "Konfirmasi coba perhiasan di toko"}
      </summary>
      <Button disabled={busy} onClick={() => void action()}>
        {en ? "Check recorded try-ons" : "Periksa catatan coba perhiasan"}
      </Button>
      {rows?.length === 0 && (
        <p>
          {en
            ? "No in-store try-ons have been recorded."
            : "Belum ada catatan coba perhiasan di toko."}
        </p>
      )}
      {rows?.map((row) => (
        <div className="controls" key={row.id}>
          <span>{row.product.name}</span>
          {row.customerConfirmedAt ? (
            <span>{en ? "Confirmed" : "Dikonfirmasi"}</span>
          ) : (
            <Button disabled={busy} onClick={() => void action(row.id)}>
              {en ? "I tried this piece" : "Saya mencoba perhiasan ini"}
            </Button>
          )}
        </div>
      ))}
      {error && <p role="status">{error}</p>}
    </details>
  );
}
