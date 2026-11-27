"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { operationError, operationsRequest } from "@/lib/operations-client";
import type { operationalReport } from "@/domains/operations/report";

type Report = Awaited<ReturnType<typeof operationalReport>>;
type ImportResult = { row: number; externalRef?: string; outcome: string };
const seconds = (value: number | null) =>
  value === null ? "—" : Math.round(value) + " sec";
export function SalesTools({
  stores,
}: {
  stores: { id: string; name: string }[];
}) {
  const [storeId, setStore] = useState(stores[0].id);
  const [report, setReport] = useState<Report | null>(null);
  const [csv, setCsv] = useState("");
  const [outcomes, setOutcomes] = useState<ImportResult[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState("sale");
  const load = useCallback(
    async (expected: string[] = [], signal?: AbortSignal) => {
      try {
        const data = await operationsRequest<Report>(
          "/api/operations/reconciliation",
          { storeId, type: "report", expected },
          signal,
        );
        if (!signal?.aborted) setReport(data);
      } catch (error) {
        if (!signal?.aborted) setStatus(operationError(error));
      }
    },
    [storeId],
  );
  useEffect(() => {
    const controller = new AbortController();
    const initial = setTimeout(() => void load([], controller.signal), 0);
    return () => {
      clearTimeout(initial);
      controller.abort();
    };
  }, [load]);

  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setStatus("");
    try {
      await action();
    } catch (error) {
      setStatus(operationError(error));
    } finally {
      setBusy(false);
    }
  }
  function mock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const field = (name: string) => String(values.get(name) ?? "");
    const date = new Date().toISOString();
    const command =
      kind === "inventory"
        ? {
            type: kind,
            observedAt: date,
            items: [{ sku: field("sku"), onHand: Number(field("quantity")) }],
          }
        : kind === "sale"
          ? {
              type: kind,
              externalRef: field("externalRef"),
              soldAt: date,
              currency: "IDR",
              total: field("amount"),
              lines: [
                { sku: field("sku"), quantity: 1, unitPrice: field("amount") },
              ],
            }
          : {
              type: kind,
              externalRef: field("externalRef"),
              occurredAt: date,
              adjustmentRef: field("adjustmentRef"),
              amount: field("amount") || undefined,
            };
    void perform(async () => {
      await operationsRequest("/api/operations/pos", { storeId, command });
      setStatus("Mock record saved.");
      await load();
    });
  }
  function importCsv(commit: boolean) {
    void perform(async () => {
      const result = await operationsRequest<ImportResult[]>(
        "/api/operations/reconciliation",
        { storeId, type: "csv", csv, commit },
      );
      setOutcomes(result);
      if (commit) await load();
    });
  }
  return (
    <div className="sales-tools">
      <label>
        Active store
        <select
          value={storeId}
          disabled={busy}
          onChange={(event) => {
            setStore(event.target.value);
            setReport(null);
            setOutcomes([]);
            setStatus("");
          }}
        >
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>
      </label>
      {report && (
        <>
          <h3>Store operations · last 7 days</h3>
          <dl className="ops-metrics">
            {[
              ["Pending now", report.metrics.pending],
              [
                "Average acknowledgment",
                seconds(report.metrics.acknowledgedSeconds),
              ],
              [
                "Average fulfillment",
                seconds(report.metrics.fulfillmentSeconds),
              ],
              ["Completed try-ons", report.metrics.tryOns],
              ["Customer-confirmed try-ons", report.metrics.customerConfirmed],
              ["Cancelled requests", report.metrics.cancelled],
              [
                "Transaction linkage",
                report.sales.linked + " of " + report.sales.total,
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <details>
            <summary>Staff workload</summary>
            {report.workload.length ? (
              <ul>
                {report.workload.map((member) => (
                  <li key={member.staffId}>
                    Associate {member.staffId.slice(0, 8)} · {member.active}{" "}
                    active · {member.completed} completed
                  </li>
                ))}
              </ul>
            ) : (
              <p>No assigned requests.</p>
            )}
          </details>
          <details>
            <summary>Cashier sessions awaiting a match</summary>
            {report.unmatched.length ? (
              <ul>
                {report.unmatched.map((session) => (
                  <li key={session.id}>
                    <code>{session.id}</code>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No unmatched cashier sessions.</p>
            )}
          </details>
          <h3>Recent transactions</h3>
          <p>
            Attribution records the observed customer journey. Incremental
            impact requires a valid comparison.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Source</th>
                  <th>State</th>
                  <th>Attribution</th>
                  <th>Net (IDR)</th>
                  <th>Purchased SKUs</th>
                  <th>Duplicates</th>
                </tr>
              </thead>
              <tbody>
                {report.transactions.map((sale) => (
                  <tr key={sale.externalRef}>
                    <td>{sale.externalRef}</td>
                    <td>{sale.source}</td>
                    <td>{sale.status.replaceAll("_", " ")}</td>
                    <td>{sale.attribution.replaceAll("_", " ")}</td>
                    <td>{sale.net}</td>
                    <td>
                      {sale.items
                        .map(
                          (item) =>
                            item.sku +
                            " ×" +
                            item.quantity +
                            (sale.sessionId
                              ? item.recommended
                                ? " · recommended"
                                : " · non-recommended"
                              : ""),
                        )
                        .join(", ")}
                    </td>
                    <td>{sale.duplicates}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <details>
        <summary>Check for missing sales</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const refs = String(
              new FormData(event.currentTarget).get("references"),
            )
              .split(/\r?\n/)
              .map((value) => value.trim())
              .filter(Boolean);
            void perform(() => load(refs));
          }}
        >
          <label>
            Expected transaction references, one per line
            <textarea name="references" required rows={4} />
          </label>
          <Button type="submit" disabled={busy}>
            Compare references
          </Button>
          {report && (
            <p>
              {report.missing.length
                ? "Missing: " + report.missing.join(", ")
                : "No missing references in the latest check."}
            </p>
          )}
        </form>
      </details>
      <details>
        <summary>Import transactions from CSV</summary>
        <p>
          Columns: type, externalRef, occurredAt, currency, total, sku,
          quantity, unitPrice, checkoutCode, adjustmentRef, amount.
        </p>
        <label>
          CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) {
                if (file.size > 350000) {
                  setStatus("File exceeds the import limit.");
                  return;
                }
                setCsv(await file.text());
                setOutcomes([]);
              }
            }}
          />
        </label>
        <label>
          CSV data
          <textarea
            value={csv}
            onChange={(event) => {
              setCsv(event.target.value);
              setOutcomes([]);
            }}
            rows={5}
            maxLength={350000}
          />
        </label>
        <div className="controls">
          <Button disabled={busy || !csv} onClick={() => importCsv(false)}>
            Preview rows
          </Button>
          <Button
            disabled={busy || !outcomes.some((row) => row.outcome === "parsed")}
            onClick={() => importCsv(true)}
          >
            Import valid groups
          </Button>
        </div>
        {outcomes.length > 0 && (
          <ul>
            {outcomes.map((row) => (
              <li key={row.row}>
                Row {row.row} {row.externalRef || ""} ·{" "}
                {row.outcome.replaceAll("_", " ")}
              </li>
            ))}
          </ul>
        )}
      </details>
      <details>
        <summary>Record mock POS activity</summary>
        <form key={kind} onSubmit={mock}>
          <label>
            Record type
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="sale">Sale</option>
              <option value="refund">Refund</option>
              <option value="cancel">Cancellation</option>
              <option value="inventory">Inventory snapshot</option>
            </select>
          </label>
          {kind !== "inventory" && (
            <label>
              External transaction reference
              <input required name="externalRef" maxLength={100} />
            </label>
          )}
          {kind === "sale" || kind === "inventory" ? (
            <label>
              SKU
              <input required name="sku" maxLength={64} />
            </label>
          ) : (
            <label>
              Adjustment reference
              <input name="adjustmentRef" required maxLength={100} />
            </label>
          )}
          {kind === "inventory" ? (
            <label>
              Units on hand
              <input name="quantity" required type="number" min={0} />
            </label>
          ) : (
            kind !== "cancel" && (
              <label>
                Amount (IDR)
                <input name="amount" required inputMode="decimal" />
              </label>
            )
          )}
          <Button type="submit" disabled={busy}>
            Save mock record
          </Button>
        </form>
      </details>
      <details>
        <summary>Operations notifications</summary>
        <div className="controls">
          <Button
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                const response = await operationsRequest<{
                  configured: boolean;
                  delivered: number;
                  failed: number;
                }>("/api/operations/alerts", { storeId, action: "dispatch" });
                setStatus(
                  response.configured
                    ? response.delivered +
                        " delivered · " +
                        response.failed +
                        " failed"
                    : "Internal alerts are active. External delivery is unconfigured.",
                );
              })
            }
          >
            Dispatch queued alerts
          </Button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const reason = new FormData(event.currentTarget).get("reason");
            void perform(async () => {
              await operationsRequest("/api/operations/alerts", {
                storeId,
                action: "incident",
                reason,
              });
              setStatus("Incident recorded.");
            });
          }}
        >
          <label>
            Incident reason
            <select name="reason">
              <option value="device_unavailable">Device unavailable</option>
              <option value="stock_check">Stock check</option>
              <option value="service_interruption">Service interruption</option>
            </select>
          </label>
          <Button type="submit" disabled={busy}>
            Record incident
          </Button>
        </form>
      </details>
      <p role="status">{status}</p>
    </div>
  );
}
