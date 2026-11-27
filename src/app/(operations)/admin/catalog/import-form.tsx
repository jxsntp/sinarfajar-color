"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { productInput } from "@/domains/catalog/input";
type Preview = {
  headers: string[];
  rows: {
    row: number;
    sku: string;
    errors: string[];
    data: { name: string; price: string; onHand: number } | null;
  }[];
  valid: boolean;
  imported: number;
};
export function ImportForm({ storeId }: { storeId: string }) {
  const [csv, setCsv] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  function source(value: string) {
    setCsv(value);
    setPreview(null);
    setHeaders([]);
    setMapping({});
    setNotice("");
  }
  async function run(commit: boolean) {
    setBusy(true);
    setNotice("");
    try {
      const r = await fetch("/api/admin/catalog/import", {
        method: "POST",
        body: JSON.stringify({ storeId, csv, mapping, commit }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error.code);
      const result: Preview = j.data;
      setHeaders(result.headers);
      setPreview(result);
      if (result.imported) {
        setNotice("Imported " + result.imported + " products");
        router.refresh();
      }
    } catch (e) {
      setPreview(null);
      setNotice(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2>Import catalog</h2>
      <label>
        CSV file
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) source(await file.text());
          }}
        />
      </label>
      <label>
        CSV content
        <textarea
          value={csv}
          rows={4}
          onChange={(e) => source(e.target.value)}
        />
      </label>
      {headers.length > 0 && (
        <details>
          <summary>Map columns</summary>
          <div className="form-grid">
            {Object.keys(productInput.shape).map((k) => (
              <label key={k}>
                {k}
                <select
                  aria-label={"Source column for " + k}
                  value={mapping[k] ?? (headers.includes(k) ? k : "")}
                  onChange={(e) => {
                    const next = { ...mapping };
                    if (e.target.value) next[k] = e.target.value;
                    else delete next[k];
                    setMapping(next);
                    setPreview(null);
                  }}
                >
                  <option value="">Default mapping</option>
                  {headers.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </details>
      )}
      <div className="controls">
        <Button disabled={!csv || busy} onClick={() => run(false)}>
          Preview CSV
        </Button>
        {preview?.valid && !preview.imported && (
          <Button disabled={busy} onClick={() => run(true)}>
            Import products
          </Button>
        )}
      </div>
      {preview && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Row</th>
                <th>SKU</th>
                <th>Product</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Validation</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((r) => (
                <tr key={r.row}>
                  <td>{r.row}</td>
                  <td>{r.sku}</td>
                  <td>{r.data?.name}</td>
                  <td>{r.data?.price}</td>
                  <td>{r.data?.onHand}</td>
                  <td>{r.errors.join(", ") || "Ready"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p role="status">{notice}</p>
    </section>
  );
}
