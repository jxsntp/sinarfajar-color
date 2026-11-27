"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { operationsRequest } from "@/lib/operations-client";
import { Button } from "@/components/ui/button";
import type { financeReport } from "@/domains/analytics/inputs";

type Finance = Awaited<ReturnType<typeof financeReport>>;
export function InputForms({
  stores,
  campaigns,
}: {
  stores: { id: string; name: string }[];
  campaigns: { id: string; label: string; storeId: string }[];
}) {
  const router = useRouter();
  const [storeId, setStore] = useState(stores[0].id);
  const [finance, setFinance] = useState<Finance>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void operationsRequest<Finance>(
        "/api/analytics/inputs?storeId=" + storeId,
        undefined,
        controller.signal,
      ).then(
        (data) => {
          if (!controller.signal.aborted) setFinance(data);
        },
        () => {
          if (!controller.signal.aborted)
            setStatus("Financial periods are unavailable.");
        },
      );
    }, 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [storeId]);
  async function save(
    event: FormEvent<HTMLFormElement>,
    action: "campaign" | "daily" | "financial",
  ) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const value = (key: string) => String(fields.get(key) ?? "").trim();
    const optionalCount = (key: string) =>
      value(key) === "" ? null : Number(value(key));
    const data =
      action === "campaign"
        ? {
            label: value("label"),
            startsAt: value("startsAt") + ":00+07:00",
            endsAt: value("endsAt") + ":00+07:00",
          }
        : action === "daily"
          ? {
              day: value("day"),
              campaignId: value("campaignId") || undefined,
              visitors: optionalCount("visitors"),
              verifiedContent: optionalCount("verifiedContent"),
              sourceRef: value("sourceRef"),
            }
          : {
              month: value("month"),
              initialInvestment: value("initialInvestment"),
              softwareCost: value("softwareCost"),
              inferenceCost: value("inferenceCost"),
              operationsCost: value("operationsCost"),
              grossProfit: value("grossProfit"),
              controlGrossProfit: value("controlGrossProfit") || null,
              sourceRef: value("sourceRef"),
              controlRef: value("controlRef") || undefined,
            };
    setStatus("");
    setBusy(true);
    try {
      await operationsRequest("/api/analytics/inputs", {
        action,
        storeId,
        ...data,
      });
      setStatus("Approved input saved.");
      if (action === "financial")
        setFinance(
          await operationsRequest<Finance>(
            "/api/analytics/inputs?storeId=" + storeId,
          ),
        );
      if (action === "campaign") router.refresh();
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message.replaceAll("_", " ")
          : "Input could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="sales-tools">
      <label>
        Store
        <select
          value={storeId}
          disabled={busy}
          onChange={(e) => {
            setStore(e.target.value);
            setFinance([]);
            setStatus("");
          }}
        >
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <details>
        <summary>Grand opening campaign</summary>
        <form
          className="form-grid"
          onSubmit={(event) => void save(event, "campaign")}
        >
          <label>
            Campaign name
            <input name="label" required maxLength={80} />
          </label>
          <label>
            Start (Jakarta)
            <input name="startsAt" type="datetime-local" required />
          </label>
          <label>
            End (Jakarta)
            <input name="endsAt" type="datetime-local" required />
          </label>
          <Button type="submit" disabled={busy}>
            Save campaign
          </Button>
        </form>
      </details>
      <details>
        <summary>Store footfall and verified campaign content</summary>
        <form
          className="form-grid"
          onSubmit={(event) => void save(event, "daily")}
        >
          <label>
            Store date
            <input name="day" type="date" required />
          </label>
          <label>
            Campaign
            <select name="campaignId">
              <option value="">Ongoing operations</option>
              {campaigns
                .filter((c) => c.storeId === storeId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Eligible visitors
            <input name="visitors" type="number" min={0} />
          </label>
          <label>
            Independently verified content count
            <input name="verifiedContent" type="number" min={0} />
          </label>
          <label>
            Approved source reference
            <input name="sourceRef" minLength={4} required />
          </label>
          <Button type="submit" disabled={busy}>
            Save daily counts
          </Button>
        </form>
      </details>
      <details>
        <summary>Financial comparison</summary>
        <form
          className="form-grid"
          onSubmit={(event) => void save(event, "financial")}
        >
          <label>
            Reporting month
            <input type="month" required name="month" />
          </label>
          {(
            [
              ["initialInvestment", "Initial investment"],
              ["softwareCost", "Software cost"],
              ["inferenceCost", "AI inference cost"],
              ["operationsCost", "Additional operations cost"],
              ["grossProfit", "Observed gross profit"],
              ["controlGrossProfit", "Comparable control gross profit"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label} (IDR)
              <input
                name={key}
                required={key !== "controlGrossProfit"}
                inputMode="decimal"
              />
            </label>
          ))}
          <label>
            Approved financial source reference
            <input name="sourceRef" minLength={4} required />
          </label>
          <label>
            Comparable baseline or control reference
            <input name="controlRef" minLength={4} />
          </label>
          <Button type="submit" disabled={busy}>
            Save financial period
          </Button>
        </form>
      </details>
      <h3>Financial evaluation by month</h3>
      <p>
        Payback and first-year ROI project this month’s contribution at a
        constant rate. Incremental fields require an approved comparable
        baseline or control.
      </p>
      {!finance.length ? (
        <p>No approved financial input is available.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Gross profit</th>
                <th>Investment</th>
                <th>Software / AI / operations costs</th>
                <th>Incremental contribution</th>
                <th>Payback (months)</th>
                <th>First-year ROI</th>
                <th>Source / control</th>
              </tr>
            </thead>
            <tbody>
              {finance.map((row) => (
                <tr key={row.month}>
                  <td>{row.month}</td>
                  <td>{row.grossProfit}</td>
                  <td>{row.investment}</td>
                  <td>
                    {row.software} / {row.inference} / {row.operations}
                  </td>
                  <td>{row.contribution ?? "Unavailable"}</td>
                  <td>{row.payback ?? "Unavailable"}</td>
                  <td>
                    {row.annualizedRoi === null
                      ? "Unavailable"
                      : (100 * row.annualizedRoi).toFixed(1) + "%"}
                  </td>
                  <td>
                    {row.source} / {row.control ?? "Unavailable"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p role="status">{status}</p>
    </div>
  );
}
