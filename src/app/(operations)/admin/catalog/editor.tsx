"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ColorFields } from "./color-fields";
import type { VisibleColor } from "@/domains/catalog/visible-colors";
const fields = {
  sku: "SKU",
  barcode: "Barcode",
  name: "Product name",
  brand: "Brand",
  manufacturer: "Manufacturer",
  category: "Category",
  goldColor: "Gold color",
  purity: "Purity",
  weightGrams: "Weight (grams)",
  gemstones: "Gemstone specifications",
  styleTags: "Style tags (| separated)",
  occasionTags: "Occasion tags (| separated)",
  price: "Store price (IDR)",
  onHand: "Units available",
  displayLocation: "Display location",
  photoPath: "Storage photo path",
};
type Row = Record<keyof typeof fields, string> & { archived: boolean; visibleColors: VisibleColor[] };
type Partner = { id: string; name: string };
export function CatalogEditor({
  rows,
  storeId,
  brands,
  makers,
}: {
  rows: Row[];
  storeId: string;
  brands: Partner[];
  makers: Partner[];
}) {
  const router = useRouter();
  const [selected, select] = useState("");
  const [kind, setKind] = useState<"brand" | "manufacturer">("brand");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const current = rows.find((r) => r.sku === selected);
  async function send(payload: unknown) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/admin/catalog", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error.code);
      setMessage("Saved");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <label>
        Catalog record
        <select
          value={selected}
          onChange={(e) => {
            select(e.target.value);
            setPhoto(null);
          }}
        >
          <option value="">New product</option>
          {rows.map((r) => (
            <option key={r.sku} value={r.sku}>
              {r.sku} · {r.name}
              {r.archived ? " (archived)" : ""}
            </option>
          ))}
        </select>
      </label>
      <form
        key={selected}
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const product = Object.fromEntries(
            Object.keys(fields).map((key) => {
              const v = String(form.get(key) ?? "").trim();
              if (key === "styleTags" || key === "occasionTags")
                return [
                  key,
                  v
                    .split("|")
                    .map((s) => s.trim())
                    .filter(Boolean),
                ];
              return [key, key === "onHand" ? Number(v) : v || undefined];
            }),
          );
          product.visibleColors = JSON.parse(String(form.get("visibleColors") ?? "[]"));
          void send({ action: current ? "edit" : "create", storeId, product });
        }}
      >
        <div className="form-grid">
          {(Object.entries(fields) as [keyof typeof fields, string][]).map(
            ([k, label]) => (
              <label key={k}>
                {label}
                {k === "photoPath" ? (
                  <input
                    name={k}
                    value={photo ?? current?.photoPath ?? ""}
                    onChange={(e) => setPhoto(e.target.value)}
                  />
                ) : (
                  <input
                    name={k}
                    readOnly={k === "sku" && !!current}
                    required={[
                      "sku",
                      "name",
                      "brand",
                      "category",
                      "goldColor",
                      "purity",
                      "price",
                      "onHand",
                    ].includes(k)}
                    defaultValue={current?.[k] ?? ""}
                  />
                )}
              </label>
            ),
          )}
          <label>
            Upload product photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const data = new FormData();
                data.set("file", file);
                setBusy(true);
                try {
                  const r = await fetch("/api/admin/catalog/photo", {
                    method: "POST",
                    body: data,
                  });
                  const result = await r.json();
                  if (!r.ok) throw new Error(result.error.code);
                  setPhoto(result.data.path);
                } catch (err) {
                  setMessage(
                    err instanceof Error ? err.message : "Upload failed",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
        </div>
        <ColorFields initial={current?.visibleColors ?? []} />
        <div className="controls">
          <Button type="submit" disabled={busy}>
            {current ? "Save changes" : "Create product"}
          </Button>
          {current && !current.archived && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => send({ action: "archive", sku: selected })}
            >
              Archive product
            </button>
          )}
        </div>
      </form>
      <details>
        <summary>Manage brands and manufacturers</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            void send({
              action: "partner",
              kind,
              id: form.get("id") || undefined,
              name: form.get("name"),
            });
          }}
        >
          <label>
            Partner type
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="brand">Brand</option>
              <option value="manufacturer">Manufacturer</option>
            </select>
          </label>
          <label>
            Partner
            <select key={kind} name="id">
              <option value="">New partner</option>
              {(kind === "brand" ? brands : makers).map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Partner name
            <input name="name" required maxLength={90} />
          </label>
          <Button type="submit" disabled={busy}>
            Save partner
          </Button>
        </form>
      </details>
      <p role="status">{message}</p>
    </>
  );
}
