import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  summarize,
  productIntelligence,
  type SessionFact,
  type EventFact,
} from "@/domains/analytics/metrics";
import { csvRow } from "@/domains/analytics/csv";
import { compareExperiments, wilson } from "@/domains/experiments/statistics";
import { financialResult } from "@/domains/analytics/inputs";

const event = (
  name: string,
  at = 1,
  extra: Partial<EventFact> = {},
): EventFact => ({
  name,
  at,
  channel: "MOBILE",
  productId: null,
  runId: null,
  rank: null,
  ...extra,
});
const session = (id: string, events: EventFact[]): SessionFact => ({
  id,
  events,
  storeId: "store",
  day: "2026-11-01",
  start: 0,
  campaignId: null,
  assisted: false,
  runs: [],
  sales: [],
  feedback: [],
  assignments: [],
});
const context = { visitors: 10, verifiedContent: null, salesAvailable: false };
describe("known analytics data", () => {
  it("counts unique sessions and uses denominator intersections", () => {
    const rows = [
      session("one", [
        event("color_analysis_started"),
        event("color_result_viewed"),
        event("qr_displayed"),
        event("mobile_report_opened"),
        event("mobile_report_opened"),
        event("recommendation_impression", 2, {
          runId: "run",
          productId: "one",
          rank: 1,
        }),
        event("recommended_product_clicked", 3, {
          runId: "run",
          productId: "one",
          rank: 1,
        }),
        event("recommended_product_clicked", 4, {
          runId: "run",
          productId: "one",
          rank: 1,
        }),
      ]),
      session("two", [
        event("color_analysis_started"),
        event("color_analysis_completed"),
        event("recommended_product_clicked", 3, {
          runId: "other",
          productId: "one",
          rank: 1,
        }),
      ]),
      session("three", []),
    ];
    const result = summarize(rows, context);
    const read = (label: string) =>
      result.metrics.find((m) => m.label === label);
    expect(read("Kiosk adoption")?.value).toBe(0.3);
    expect(read("QR handoff")).toMatchObject({
      value: 0.5,
      numerator: 1,
      denominator: 2,
    });
    expect(read("Unique mobile report opens")?.value).toBe(1);
    expect(read("Mobile product CTR")).toMatchObject({
      value: 1,
      numerator: 1,
      denominator: 1,
    });
    expect(read("Attributed net revenue")?.value).toBeNull();
    expect(result.diagnostics.clickWithoutImpression).toBe(1);
  });
  it("deduplicates brand activity across SKUs and uses a matching run impression", () => {
    const run = {
      id: "run",
      strategy: "rules",
      assigned: "rules",
      status: "COMPLETE",
      fallback: false,
      latency: 9,
      prompt: null,
      candidates: [],
      attempts: [],
    };
    const row = {
      ...session("s", [
        event("product_detail_viewed", 1, { productId: "p1" }),
        event("product_detail_viewed", 1, { productId: "p2" }),
        event("recommendation_impression", 2, {
          productId: "p1",
          runId: "run",
          rank: 1,
        }),
        event("recommended_product_clicked", 3, {
          productId: "p1",
          runId: "run",
          rank: 1,
        }),
      ]),
      runs: [run],
    };
    const data = productIntelligence(
      [row],
      [
        { id: "p1", sku: "A", name: "A", brand: "Brand", category: "ring" },
        { id: "p2", sku: "B", name: "B", brand: "Brand", category: "ring" },
      ],
      false,
    );
    expect(data.brands[0].views).toBe(1);
    expect(data.ranked[0]).toMatchObject({
      rank: 1,
      clicks: 1,
      impressions: 1,
      strategy: "rules",
    });
    expect(data.products.find((p) => p.sku === "A")?.purchased).toBeNull();
  });
  it("compares original assignments with mature denominators and Wilson-Newcombe intervals", () => {
    const assign = (
      id: string,
      variant: string,
      events: EventFact[],
      at = 0,
    ) => ({
      ...session(id, events),
      assignments: [{ experimentId: "e", variant, at }],
    });
    const rows = [
      assign("a", "B", []),
      assign("b", "B", [event("product_inquiry_requested")]),
      assign("c", "C", [
        event("product_inquiry_requested"),
        event("recommendation_fallback"),
      ]),
      assign("d", "C", [event("product_inquiry_requested")]),
      assign("e", "C", [], 86400000),
    ];
    const [result] = compareExperiments(
      rows,
      [
        {
          id: "e",
          name: "mobile-ranking",
          version: 2,
          state: "RUNNING",
          primaryOutcome: "inquiry",
          observationDays: 1,
          minimumPerArm: 10,
        },
      ],
      86400001,
      false,
    );
    expect(result.groups[1]).toMatchObject({
      assigned: 3,
      mature: 2,
      fallback: 1,
    });
    expect(result.sampleReady).toBe(false);
    const inquiry = result.outcomes.find(
      (outcome) => outcome.key === "inquiry",
    )!;
    expect(inquiry).toMatchObject({ absolute: 0.5, uplift: 1, primary: true });
    expect(inquiry.interval![0]).toBeLessThan(0);
    expect(wilson(0, 0)).toBeNull();
  });
  it("requires a comparable control for incremental contribution and quotes CSV formula-like cells", () => {
    const d = (value: number) => new Prisma.Decimal(value);
    const row = {
      initialInvestment: d(1000),
      softwareCost: d(100),
      inferenceCost: d(20),
      operationsCost: d(30),
      grossProfit: d(900),
      controlGrossProfit: d(500),
      controlRef: "Approved",
    };
    expect(financialResult(row)).toMatchObject({
      operatingCost: "150.00",
      contribution: "250.00",
      payback: 4,
      annualizedRoi: 2,
    });
    expect(
      financialResult({ ...row, controlRef: null }).contribution,
    ).toBeNull();
    expect(csvRow(["=WEBSERVICE()", 'two"words', -5])).toBe(
      '"\'=WEBSERVICE()","two""words","-5"',
    );
  });
});
