import Link from "next/link";
import { pageStaff } from "@/components/operations";
import { stockedLines } from "@/domains/inventory/stock";
import { saleCount } from "@/domains/transactions/sales";
import {
  analyticsChoices,
  analyticsReport,
  canSeeFinance,
  defaultFilters,
  filters,
} from "@/domains/analytics/report";
import type { Metric } from "@/domains/analytics/metrics";
import { HttpError } from "@/lib/http";
import { TrendChart } from "./charts";
import { ProductTable } from "./products";

const percentage = (n: number | null) =>
  n === null
    ? "Unavailable"
    : new Intl.NumberFormat("en", {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(n);
const number = (n: number) =>
  new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(n);
function display(m: Metric) {
  if (m.value === null) return "Unavailable";
  if (m.unit === "rate") return percentage(m.value);
  if (m.unit === "USD")
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 6,
    }).format(m.value);
  return (
    (m.unit === "IDR" ? "IDR " : "") +
    number(m.value) +
    (m.unit === "score" ? " / 5" : "")
  );
}
const reports = ["kpis", "product", "ranked", "quality", "experiments"];
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await pageStaff("dashboard");
  const query = Object.fromEntries(
    Object.entries(await searchParams).filter(([, value]) => value !== ""),
  );
  const inputs = defaultFilters();
  const parsed = filters.safeParse({ ...inputs, ...query });
  const [choices, stock, sales] = await Promise.all([
    analyticsChoices(staff),
    stockedLines(staff),
    saleCount(staff),
  ]);
  let report: Awaited<ReturnType<typeof analyticsReport>> | undefined;
  let message = parsed.success
    ? ""
    : "Choose a valid date range of up to 92 days.";
  if (parsed.success) {
    try {
      report = await analyticsReport(staff, parsed.data);
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      message =
        error.code === "analytics_window_too_large"
          ? "Narrow the date or store selection to load this cohort."
          : "This store or campaign is unavailable for your account.";
    }
  }
  const current = parsed.success ? parsed.data : inputs;
  const value = (key: string) =>
    typeof query[key] === "string" ? String(query[key]) : "";
  const download = new URLSearchParams(
    Object.entries(current).filter(
      (pair): pair is [string, string] => typeof pair[1] === "string",
    ),
  );
  const highlights = [
    "QR handoff",
    "Mobile product CTR",
    "Mobile inquiry rate",
    "Attributed purchase sessions",
  ];
  return (
    <>
      <nav className="controls" aria-label="Management sections">
        {canSeeFinance(staff) && (
          <>
            <Link href="/staff/sales">Store operations and reconciliation</Link>
            <Link href="/dashboard/inputs">
              Approved data and financial evaluation
            </Link>
          </>
        )}
      </nav>
      <form
        className="form-grid insight-filters"
        aria-label="Analytics filters"
      >
        <label>
          From
          <input name="from" type="date" defaultValue={current.from} required />
        </label>
        <label>
          To
          <input name="to" type="date" defaultValue={current.to} required />
        </label>
        <label>
          Store
          <select name="store" defaultValue={value("store")}>
            <option value="">All authorized stores</option>
            {choices.stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Campaign
          <select name="campaign" defaultValue={value("campaign")}>
            <option value="">All cohorts</option>
            <option value="opening">Grand opening campaigns</option>
            <option value="ongoing">Ongoing operations</option>
            {choices.campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Brand
          <select name="brand" defaultValue={value("brand")}>
            <option value="">All brands</option>
            {choices.brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Category
          <select name="category" defaultValue={value("category")}>
            <option value="">All categories</option>
            {choices.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Assistance
          <select name="assisted" defaultValue={value("assisted")}>
            <option value="">All sessions</option>
            <option value="assisted">Staff-assisted</option>
            <option value="self">Self-service</option>
          </select>
        </label>
        <label>
          Assigned variant
          <select name="variant" defaultValue={value("variant")}>
            <option value="">All arms</option>
            {[
              "B",
              "C",
              "rules",
              "openrouter",
              "palette-first",
              "metals-first",
            ].map((arm) => (
              <option key={arm}>{arm}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="action insight-button">
          Apply filters
        </button>
      </form>
      <p className="privacy-note">
        Store dates use Jakarta time. Brand and category apply to product-linked
        outcomes. Store-level funnel stages retain the full eligible cohort.
      </p>
      {message && <p role="alert">{message}</p>}
      {report && (
        <>
          <dl className="ops-metrics">
            {report.metrics
              .filter((m) => highlights.includes(m.label))
              .map((m) => (
                <div key={m.label}>
                  <dt>{m.label}</dt>
                  <dd>{display(m)}</dd>
                  {m.denominator !== undefined && (
                    <p>
                      {m.numerator} of {m.denominator} sessions
                    </p>
                  )}
                </div>
              ))}
          </dl>
          <p>
            Grand opening sessions <strong>{report.cohort.opening}</strong> ·
            Ongoing sessions <strong>{report.cohort.ongoing}</strong>
          </p>
          <TrendChart data={report.trend} />
          <details>
            <summary>Daily counts in table form</summary>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Kiosk starts</th>
                  <th>Mobile opens</th>
                </tr>
              </thead>
              <tbody>
                {report.trend.map((d) => (
                  <tr key={d.day}>
                    <td>{d.day}</td>
                    <td>{d.kiosk}</td>
                    <td>{d.open}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <h2>Customer funnel and marketing</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Value</th>
                  <th>Coverage</th>
                </tr>
              </thead>
              <tbody>
                {report.metrics.map((m) => (
                  <tr key={m.label}>
                    <th scope="row">{m.label}</th>
                    <td>{display(m)}</td>
                    <td>
                      {m.value === null
                        ? m.missing
                        : m.denominator !== undefined
                          ? m.numerator + " / " + m.denominator
                          : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="privacy-note">
            A share records initiation. A social click records the outbound
            action. Verified content comes from approved independent records.
          </p>
          <ProductTable data={report.products} />
          <h2>Controlled experiments</h2>
          <p>
            Comparisons use original assignment and completed observation
            windows. Intervals show uncertainty and do not establish a winner
            automatically.
          </p>
          {report.experiments.length ? (
            report.experiments.map((plan) => (
              <details key={plan.id} open={plan.state === "RUNNING"}>
                <summary>
                  {plan.name} · v{plan.version} · {plan.state.toLowerCase()}
                </summary>
                <p>
                  {plan.minimumPerArm === null
                    ? "Legacy assignment has no approved sample target."
                    : plan.sampleReady
                      ? "Prespecified sample size reached."
                      : "Prespecified sample size has not been reached."}{" "}
                  Window {plan.observationDays ?? 7} days.
                </p>
                <ul>
                  {plan.groups.map((g) => (
                    <li key={g.arm}>
                      {g.arm} · {g.assigned} assigned · {g.mature} mature ·{" "}
                      {g.fallback} fallbacks · {g.actualRules} rules and{" "}
                      {g.actualOpenRouter} model sessions
                    </li>
                  ))}
                </ul>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Outcome</th>
                        <th>{plan.groups[0].arm}</th>
                        <th>{plan.groups[1].arm}</th>
                        <th>Difference (pp)</th>
                        <th>Relative uplift</th>
                        <th>95% difference interval (pp)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.outcomes.map((row) => (
                        <tr key={row.key}>
                          <th scope="row">
                            {row.key.replaceAll("_", " ")}
                            {row.primary
                              ? " · primary"
                              : row.diagnostic
                                ? " · diagnostic"
                                : ""}
                          </th>
                          <td>
                            {row.baseline.total
                              ? row.baseline.successes +
                                " / " +
                                row.baseline.total +
                                " (" +
                                percentage(
                                  row.baseline.successes / row.baseline.total,
                                ) +
                                ")"
                              : "Unavailable"}
                          </td>
                          <td>
                            {row.treatment.total
                              ? row.treatment.successes +
                                " / " +
                                row.treatment.total +
                                " (" +
                                percentage(
                                  row.treatment.successes / row.treatment.total,
                                ) +
                                ")"
                              : "Unavailable"}
                          </td>
                          <td>
                            {row.absolute === null
                              ? "Unavailable"
                              : number(row.absolute * 100)}
                          </td>
                          <td>{percentage(row.uplift)}</td>
                          <td>
                            {row.interval
                              ? row.interval
                                  .map((x) => number(x * 100))
                                  .join(" to ")
                              : "Unavailable"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))
          ) : (
            <p>No experiment assignments are available.</p>
          )}
          <h2>Data quality</h2>
          <dl className="ops-metrics">
            {Object.entries(report.diagnostics).map(([key, value]) => (
              <div key={key}>
                <dt>{key.replace(/([A-Z])/g, " $1").toLowerCase()}</dt>
                <dd>
                  {typeof value === "boolean" ? (value ? "Yes" : "No") : value}
                </dd>
              </div>
            ))}
          </dl>
          <nav aria-label="CSV exports">
            {reports.map((section) => (
              <a
                key={section}
                href={
                  "/api/analytics/export?" +
                  download.toString() +
                  "&section=" +
                  section
                }
              >
                Export {section} CSV
              </a>
            ))}
          </nav>
        </>
      )}
      <dl className="ops-metrics">
        <div>
          <dt>In-stock product lines</dt>
          <dd>{stock}</dd>
        </div>
        <div>
          <dt>Recorded sales</dt>
          <dd>{sales}</dd>
        </div>
      </dl>
    </>
  );
}
