"use client";
import { useState } from "react";
import type { productIntelligence } from "@/domains/analytics/metrics";
const format = (n: number | null) =>
  n === null ? "Unavailable" : (n * 100).toFixed(1) + "%";
type Data = ReturnType<typeof productIntelligence>;
export function ProductTable({ data }: { data: Data }) {
  const [sort, setSort] = useState<
    "recommended" | "viewed" | "inquiries" | "tryOns" | "purchased" | "ctr"
  >("recommended");
  const rows = [...data.products].sort(
    (a, b) => (b[sort] ?? -1) - (a[sort] ?? -1) || a.sku.localeCompare(b.sku),
  );
  return (
    <section>
      <h2>Product intelligence</h2>
      <label>
        Sort products
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as typeof sort)}
        >
          <option value="recommended">Most recommended</option>
          <option value="viewed">Most viewed</option>
          <option value="inquiries">Most requested</option>
          <option value="tryOns">Most tried on</option>
          <option value="purchased">Most purchased recommendations</option>
          <option value="ctr">Product CTR</option>
        </select>
      </label>
      {!rows.length && <p>No product activity in this selection.</p>}
      {rows.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Recommended</th>
                <th>Viewed</th>
                <th>CTR</th>
                <th>Inquiries</th>
                <th>Try-ons</th>
                <th>Recommended purchases</th>
                <th>Recommendation to inquiry</th>
                <th>Inquiry to try-on</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((p) => (
                <tr key={p.id}>
                  <th scope="row">
                    {p.sku} · {p.name}
                    <br />
                    {p.brand} · {p.category}
                    {p.lowConversion && (
                      <>
                        <br />
                        High interest, low observed purchasing
                      </>
                    )}
                  </th>
                  <td>{p.recommended}</td>
                  <td>{p.viewed}</td>
                  <td>
                    {format(p.ctr)} ({p.clicks}/{p.impressions})
                  </td>
                  <td>{p.inquiries}</td>
                  <td>{p.tryOns}</td>
                  <td>{p.purchased ?? "Unavailable"}</td>
                  <td>{format(p.recommendationToInquiry)}</td>
                  <td>{format(p.inquiryToTryOn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <details>
        <summary>CTR by recommendation run, SKU, rank and strategy</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Run</th>
                <th>SKU</th>
                <th>Rank</th>
                <th>Actual strategy</th>
                <th>Clicks / impressions</th>
              </tr>
            </thead>
            <tbody>
              {data.ranked.slice(0, 150).map((r) => (
                <tr key={r.runId + "/" + r.productId + "/" + r.rank}>
                  <td>{r.runId}</td>
                  <td>{r.sku}</td>
                  <td>{r.rank}</td>
                  <td>{r.strategy}</td>
                  <td>
                    {r.clicks} / {r.impressions}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {(
        [
          ["Brand", data.brands],
          ["Category", data.categories],
        ] as const
      ).map(([label, groups]) => (
        <details key={label}>
          <summary>{label} performance</summary>
          <table>
            <thead>
              <tr>
                <th>{label}</th>
                <th>Recommendations</th>
                <th>Views</th>
                <th>Inquiries</th>
                <th>Try-ons</th>
                <th>Recommended purchases</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.label}>
                  <td>{g.label}</td>
                  <td>{g.recommended}</td>
                  <td>{g.views}</td>
                  <td>{g.inquiries}</td>
                  <td>{g.tryOns}</td>
                  <td>{g.purchases ?? "Unavailable"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
      <div className="insight-split">
        <section>
          <h3>Preferred gold colors</h3>
          {data.gold.length ? (
            <ul>
              {data.gold.map((g) => (
                <li key={g.label}>
                  {g.label} · {g.count} sessions
                </li>
              ))}
            </ul>
          ) : (
            <p>No gold color preferences recorded.</p>
          )}
        </section>
        <section>
          <h3>Customer budget distribution</h3>
          <ul>
            {data.budgets.map((b) => (
              <li key={b.band}>
                {b.band} · {b.count} sessions
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
