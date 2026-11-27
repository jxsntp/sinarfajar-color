import { z } from "zod";
import { currentStaff } from "@/domains/authentication/staff";
import { analyticsReport, filters } from "@/domains/analytics/report";
import { csvRow } from "@/domains/analytics/csv";
import { endpoint } from "@/lib/http";

export async function GET(req: Request) {
  const response = await endpoint("analytics.export", async () => {
    const query = Object.fromEntries(new URL(req.url).searchParams);
    const section = z
      .enum(["kpis", "product", "ranked", "quality", "experiments"])
      .parse(query.section ?? "kpis");
    delete query.section;
    const report = await analyticsReport(
      await currentStaff("dashboard"),
      filters.parse(query),
    );
    if (section === "product")
      return [
        csvRow([
          "SKU",
          "Name",
          "Brand",
          "Category",
          "Recommended",
          "Viewed",
          "Impressions",
          "Clicks",
          "Inquiries",
          "Try-ons",
          "Recommended purchases",
          "CTR",
        ]),
        ...report.products.products.map((p) =>
          csvRow([
            p.sku,
            p.name,
            p.brand,
            p.category,
            p.recommended,
            p.viewed,
            p.impressions,
            p.clicks,
            p.inquiries,
            p.tryOns,
            p.purchased,
            p.ctr,
          ]),
        ),
      ].join("\r\n");
    if (section === "ranked")
      return [
        csvRow(["Run", "SKU", "Rank", "Strategy", "Impressions", "Clicks"]),
        ...report.products.ranked.map((row) =>
          csvRow([
            row.runId,
            row.sku,
            row.rank,
            row.strategy,
            row.impressions,
            row.clicks,
          ]),
        ),
      ].join("\r\n");
    if (section === "quality")
      return [
        csvRow(["Check", "Value"]),
        ...Object.entries(report.diagnostics).map(([key, value]) =>
          csvRow([key, String(value)]),
        ),
      ].join("\r\n");
    if (section === "experiments")
      return [
        csvRow([
          "Experiment",
          "Version",
          "Outcome",
          "Baseline success",
          "Baseline n",
          "Treatment success",
          "Treatment n",
          "Absolute difference",
          "Relative uplift",
          "95% lower",
          "95% upper",
        ]),
        ...report.experiments.flatMap((e) =>
          e.outcomes.map((o) =>
            csvRow([
              e.name,
              e.version,
              o.key,
              o.baseline.successes,
              o.baseline.total,
              o.treatment.successes,
              o.treatment.total,
              o.absolute,
              o.uplift,
              o.interval?.[0],
              o.interval?.[1],
            ]),
          ),
        ),
      ].join("\r\n");
    return [
      csvRow([
        "Metric",
        "Value",
        "Unit",
        "Numerator",
        "Denominator",
        "Missing data",
      ]),
      ...report.metrics.map((m) =>
        csvRow([
          m.label,
          m.value,
          m.unit,
          m.numerator,
          m.denominator,
          m.missing,
        ]),
      ),
    ].join("\r\n");
  });
  if (!response.ok) return response;
  const { data } = await response.json();
  return new Response(data, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="inaura-analytics.csv"',
      "Cache-Control": "no-store",
    },
  });
}
