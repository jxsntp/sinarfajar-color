export type EventFact = {
  name: string;
  channel: string;
  at: number;
  productId: string | null;
  runId: string | null;
  rank: number | null;
};
export type RunFact = {
  id: string;
  at?: number;
  strategy: string;
  assigned: string;
  status: string;
  fallback: boolean;
  latency: number | null;
  prompt: string | null;
  candidates: { productId: string; rank: number }[];
  attempts: {
    at?: number;
    cost: number | null;
    outcome: string;
    input: number | null;
    output: number | null;
  }[];
  gold?: string;
  budget?: number;
};
export type SaleFact = {
  net: number;
  at: number;
  items: { productId: string; recommended: boolean }[];
};
export type AssignmentFact = {
  experimentId: string;
  variant: string;
  at: number;
};
export type SessionFact = {
  id: string;
  storeId: string;
  day: string;
  start: number;
  campaignId: string | null;
  assisted: boolean;
  events: EventFact[];
  runs: RunFact[];
  sales: SaleFact[];
  feedback: { subject: string; rating: number }[];
  assignments: AssignmentFact[];
};

export type Metric = {
  label: string;
  value: number | null;
  numerator?: number;
  denominator?: number;
  unit?: string;
  missing?: string;
};
const count = (
  label: string,
  value: number | null,
  missing?: string,
  unit?: string,
): Metric => ({
  label,
  value,
  missing: value === null ? missing : undefined,
  unit,
});
export const rate = (
  label: string,
  numerator: number,
  denominator: number,
  missing = "No eligible denominator",
): Metric => ({
  label,
  value: denominator ? numerator / denominator : null,
  numerator,
  denominator,
  unit: "rate",
  ...(denominator ? {} : { missing }),
});

export const eventNames = {
  started: ["kiosk_session_started"],
  analysis: ["color_analysis_started"],
  complete: ["color_analysis_completed", "color_result_viewed"],
  qr: ["qr_displayed"],
  open: ["mobile_report_opened"],
  preferences: ["mobile_preferences_completed"],
  activation: ["recommendation_requested"],
  generated: ["recommendation_generated"],
  impression: ["recommendation_impression"],
  click: ["recommended_product_clicked"],
  detail: ["product_detail_viewed"],
  inquiry: ["product_inquiry_requested"],
  tryOn: ["tryon_confirmed"],
  return: ["report_revisited"],
  save: ["results_saved"],
  share: ["report_share_initiated"],
  social: ["social_link_clicked"],
  optIn: ["marketing_opt_in"],
} as const;
type EventKind = keyof typeof eventNames;
const productEvents = new Set<EventKind>([
  "impression",
  "click",
  "detail",
  "inquiry",
  "tryOn",
]);
function matchesEvent(
  session: SessionFact,
  event: EventFact,
  kind: EventKind,
  productIds?: ReadonlySet<string>,
) {
  if (!(eventNames[kind] as readonly string[]).includes(event.name))
    return false;
  if (
    kind === "tryOn"
      ? event.channel !== "STAFF"
      : productEvents.has(kind) && event.channel !== "MOBILE"
  )
    return false;
  if (kind === "generated" || kind === "activation") {
    return (
      event.channel === "MOBILE" &&
      session.runs.some(
        (run) =>
          run.id === event.runId &&
          (kind === "activation" || run.status === "COMPLETE"),
      )
    );
  }
  return (
    !productIds ||
    !productEvents.has(kind) ||
    (!!event.productId && productIds.has(event.productId))
  );
}

export function has(
  session: SessionFact,
  kind: EventKind,
  productIds?: ReadonlySet<string>,
) {
  return session.events.some((event) =>
    matchesEvent(session, event, kind, productIds),
  );
}
export function hasClickWithImpression(
  session: SessionFact,
  productIds?: ReadonlySet<string>,
) {
  const impressions = new Set(
    session.events
      .filter(
        (event) =>
          event.channel === "MOBILE" &&
          event.name === "recommendation_impression" &&
          (!productIds ||
            (!!event.productId && productIds.has(event.productId))),
      )
      .map((event) => event.runId + "/" + event.productId),
  );
  return session.events.some(
    (event) =>
      event.channel === "MOBILE" &&
      event.name === "recommended_product_clicked" &&
      impressions.has(event.runId + "/" + event.productId),
  );
}
const mean = (values: number[]) =>
  values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;
const matchingCount = (rows: SessionFact[], ...kinds: EventKind[]) =>
  rows.filter((session) => kinds.every((kind) => has(session, kind))).length;
export function summarize(
  rows: SessionFact[],
  context: {
    visitors: number | null;
    verifiedContent: number | null;
    salesAvailable: boolean;
  },
  productIds?: ReadonlySet<string>,
) {
  const started = rows.length;
  const completed = matchingCount(rows, "complete");
  const qr = matchingCount(rows, "qr");
  const opens = matchingCount(rows, "open");
  const analysis = matchingCount(rows, "analysis");
  const impressions = rows.filter((s) =>
    has(s, "impression", productIds),
  ).length;
  const clicked = rows.filter((s) =>
    hasClickWithImpression(s, productIds),
  ).length;
  const inquiry = rows.filter((s) => has(s, "inquiry", productIds)).length;
  const tryOns = rows.filter((s) => has(s, "tryOn", productIds)).length;
  const qualifyingSale = (s: SessionFact) =>
    s.sales.some(
      (sale) =>
        sale.net > 0 &&
        (!productIds ||
          sale.items.some((item) => productIds.has(item.productId))),
    );
  const sales = rows.flatMap((s) => s.sales.filter((sale) => sale.net > 0));
  const revenues = sales.reduce((total, sale) => total + sale.net, 0);
  const attempts = rows.flatMap((s) => s.runs.flatMap((run) => run.attempts));
  const unknownCosts = attempts.filter(
    (attempt) => attempt.cost === null,
  ).length;
  const csats = rows.flatMap((s) =>
    s.feedback
      .filter((f) => f.subject === "discovery")
      .slice(0, 1)
      .map((f) => f.rating),
  );
  const relevance = rows.flatMap((s) =>
    s.feedback
      .filter((f) => f.subject === "relevance")
      .slice(0, 1)
      .map((f) => f.rating),
  );
  const opensWith = (kind: EventKind) => matchingCount(rows, "open", kind);
  const financeMissing = "Verified sales feed unavailable for this cohort";
  const productRevenueMissing =
    "Receipt totals are store-level under product filters";
  const occurredAfter = (
    session: SessionFact,
    first: EventKind,
    second: EventKind,
  ) => {
    const firstAt = new Map<string | null, number>();
    for (const event of session.events) {
      if (!event.productId || !matchesEvent(session, event, first, productIds))
        continue;
      firstAt.set(
        event.productId,
        Math.min(firstAt.get(event.productId) ?? Infinity, event.at),
      );
    }
    return session.events.some(
      (event) =>
        !!event.productId &&
        event.at >= (firstAt.get(event.productId) ?? Infinity) &&
        matchesEvent(session, event, second, productIds),
    );
  };
  const events = [
    count(
      "Store visitors",
      context.visitors,
      "Approved footfall coverage is incomplete",
    ),
    count("Kiosk starts", started),
    context.visitors === null
      ? count(
          "Kiosk adoption",
          null,
          "Footfall unavailable for this selection",
          "rate",
        )
      : rate("Kiosk adoption", started, context.visitors),
    count("Analyses started", analysis),
    count("Completed analyses", completed),
    rate(
      "Analysis completion",
      matchingCount(rows, "analysis", "complete"),
      analysis,
    ),
    count("Kiosk starts without a completed analysis", started - completed),
    count(
      "Completed analyses without a mobile open",
      completed - matchingCount(rows, "complete", "open"),
    ),
    count("Visible QR displays", qr),
    rate(
      "QR display coverage",
      matchingCount(rows, "complete", "qr"),
      completed,
    ),
    count("Unique mobile report opens", opens),
    rate("QR handoff", matchingCount(rows, "complete", "open"), completed),
    rate("Display-to-open", matchingCount(rows, "qr", "open"), qr),
    count("Mobile preferences completed", matchingCount(rows, "preferences")),
    count("Explicit activation sessions", matchingCount(rows, "activation")),
    rate("Explicit activation rate", opensWith("activation"), opens),
    rate("Successful mobile activation", opensWith("generated"), opens),
    count(
      "Report opens without explicit activation",
      opens - opensWith("activation"),
    ),
    count(
      "Activations without a generated selection",
      matchingCount(rows, "activation") -
        matchingCount(rows, "activation", "generated"),
    ),
    count("Recommendation-viewing sessions", impressions),
    count("Recommendation-clicking sessions", clicked),
    rate("Mobile product CTR", clicked, impressions),
    count("Mobile repeat visits", opensWith("return")),
    rate("Mobile return rate", opensWith("return"), opens),
    rate("Result save rate", opensWith("save"), opens),
    rate("Share initiation rate", opensWith("share"), opens),
    rate("Social link click rate", opensWith("social"), opens),
    rate("Marketing opt-in rate", opensWith("optIn"), opens),
    count(
      "Verified campaign content",
      context.verifiedContent,
      "Independent verification is unavailable",
    ),
    count("Product inquiry sessions", inquiry),
    rate(
      "Mobile inquiry rate",
      rows.filter((s) => has(s, "open") && has(s, "inquiry", productIds))
        .length,
      opens,
    ),
    count("Physical try-on sessions", tryOns),
    rate(
      "Inquiry-to-try-on",
      rows.filter((s) => occurredAfter(s, "inquiry", "tryOn")).length,
      inquiry,
    ),
    rate(
      "Recommendation-to-inquiry",
      rows.filter((s) => occurredAfter(s, "impression", "inquiry")).length,
      impressions,
    ),
    count(
      "Attributed purchase sessions",
      context.salesAvailable ? rows.filter(qualifyingSale).length : null,
      financeMissing,
    ),
    count(
      "Attributed net revenue",
      context.salesAvailable && !productIds ? revenues : null,
      productIds ? productRevenueMissing : financeMissing,
      "IDR",
    ),
    count(
      "Average transaction value",
      context.salesAvailable && !productIds && sales.length
        ? revenues / sales.length
        : null,
      productIds
        ? productRevenueMissing
        : context.salesAvailable
          ? "No completed receipts"
          : financeMissing,
      "IDR",
    ),
    context.salesAvailable
      ? rate(
          "Try-on-to-purchase",
          rows.filter((s) =>
            s.events.some(
              (e) =>
                e.name === "tryon_confirmed" &&
                e.channel === "STAFF" &&
                (!productIds ||
                  (!!e.productId && productIds.has(e.productId))) &&
                s.sales.some(
                  (sale) =>
                    sale.net > 0 &&
                    sale.at >= e.at &&
                    (!productIds ||
                      sale.items.some(
                        (item) => item.productId === e.productId,
                      )),
                ),
            ),
          ).length,
          tryOns,
        )
      : count("Try-on-to-purchase", null, financeMissing, "rate"),
    count(
      "Customer satisfaction",
      mean(csats),
      "No satisfaction ratings",
      "score",
    ),
    count("Customer satisfaction responses", csats.length),
    rate(
      "Customer satisfaction response rate",
      rows.filter(
        (s) =>
          has(s, "open") && s.feedback.some((f) => f.subject === "discovery"),
      ).length,
      opens,
    ),
    rate(
      "Recommendation relevance",
      relevance.filter((r) => r >= 4).length,
      relevance.length,
    ),
    count(
      "AI operating cost",
      unknownCosts
        ? null
        : attempts.reduce((total, a) => total + (a.cost ?? 0), 0),
      "One or more attempts lack provider cost",
      "USD",
    ),
  ];
  const diagnostics = {
    unpersistedResults: rows.filter(
      (s) =>
        has(s, "complete") &&
        !s.events.some((e) => e.name === "color_analysis_completed"),
    ).length,
    openWithoutDisplay: rows.filter((s) => has(s, "open") && !has(s, "qr"))
      .length,
    clickWithoutImpression: rows.filter(
      (s) => has(s, "click") && !hasClickWithImpression(s),
    ).length,
    pendingRuns: rows.reduce(
      (n, s) => n + s.runs.filter((r) => r.status === "PENDING").length,
      0,
    ),
    unknownProviderCosts: unknownCosts,
    missingFootfall: context.visitors === null,
    missingVerifiedSales: !context.salesAvailable,
    initiatedAIWithoutActivation: rows.flatMap((s) =>
      s.runs.filter(
        (r) =>
          r.attempts.length &&
          !s.events.some(
            (e) => e.runId === r.id && e.name === "recommendation_requested",
          ),
      ),
    ).length,
  };
  return { metrics: events, diagnostics };
}

export type ProductDimension = {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
};
export function productIntelligence(
  rows: SessionFact[],
  catalog: ProductDimension[],
  salesAvailable: boolean,
) {
  const empty = () => ({
    recommended: 0,
    viewed: 0,
    impressions: 0,
    clicks: 0,
    inquiries: 0,
    tryOns: 0,
    purchased: 0,
    afterRecommendation: 0,
    inquiryTryOn: 0,
  });
  const products = new Map(
    catalog.map((product) => [product.id, { ...product, ...empty() }]),
  );
  const ranked = new Map<
    string,
    {
      productId: string;
      runId: string;
      strategy: string;
      rank: number;
      impressions: number;
      clicks: number;
    }
  >();
  const gold = new Map<string, number>();
  const groups = {
    brand: new Map<string, ReturnType<typeof empty>>(),
    category: new Map<string, ReturnType<typeof empty>>(),
  };
  const budgets = [
    { band: "Under IDR 1m", count: 0 },
    { band: "IDR 1m–5m", count: 0 },
    { band: "Over IDR 5m", count: 0 },
    { band: "Unspecified", count: 0 },
  ];
  for (const session of rows) {
    const latest = session.runs.at(-1);
    if (latest?.gold) gold.set(latest.gold, (gold.get(latest.gold) ?? 0) + 1);
    if (latest)
      budgets[
        latest.budget === undefined
          ? 3
          : latest.budget < 1e6
            ? 0
            : latest.budget <= 5e6
              ? 1
              : 2
      ].count++;
    const fields = new Map<string, ReturnType<typeof empty>>();
    const product = (id: string) => {
      const current = fields.get(id) ?? empty();
      fields.set(id, current);
      return current;
    };
    for (const run of session.runs.filter((run) => run.status === "COMPLETE")) {
      for (const item of run.candidates)
        if (products.has(item.productId))
          product(item.productId).recommended = 1;
    }
    const tuples = new Map<
      string,
      {
        productId: string;
        runId: string;
        strategy: string;
        rank: number;
        impressions: number;
        clicks: number;
      }
    >();
    for (const event of session.events) {
      if (!event.productId || !products.has(event.productId)) continue;
      const p = product(event.productId);
      if (event.channel === "STAFF" && event.name === "tryon_confirmed")
        p.tryOns = 1;
      if (event.channel !== "MOBILE") continue;
      if (event.name === "product_detail_viewed") p.viewed = 1;
      if (event.name === "product_inquiry_requested") p.inquiries = 1;
      if (
        !event.runId ||
        !event.rank ||
        !["recommendation_impression", "recommended_product_clicked"].includes(
          event.name,
        )
      )
        continue;
      const run = session.runs.find((r) => r.id === event.runId);
      if (!run) continue;
      const key = [event.runId, event.productId, event.rank].join("/");
      const row = tuples.get(key) ?? {
        productId: event.productId,
        runId: event.runId,
        strategy: run.strategy,
        rank: event.rank,
        impressions: 0,
        clicks: 0,
      };
      if (event.name === "recommendation_impression") row.impressions = 1;
      else row.clicks = 1;
      tuples.set(key, row);
    }
    for (const [key, row] of tuples)
      if (row.impressions) {
        ranked.set(key, row);
        const p = product(row.productId);
        p.impressions = 1;
        p.clicks = Math.max(p.clicks, row.clicks);
      }
    for (const sale of session.sales)
      if (sale.net > 0)
        for (const item of sale.items) {
          if (item.recommended && products.has(item.productId))
            product(item.productId).purchased = 1;
        }
    const touched = {
      brand: new Map<string, ReturnType<typeof empty>>(),
      category: new Map<string, ReturnType<typeof empty>>(),
    };
    for (const [id, p] of fields) {
      const related = session.events.filter((e) => e.productId === id);
      p.afterRecommendation = Number(
        related.some(
          (e) =>
            e.channel === "MOBILE" &&
            e.name === "recommendation_impression" &&
            related.some(
              (x) =>
                x.channel === "MOBILE" &&
                x.name === "product_inquiry_requested" &&
                x.at >= e.at,
            ),
        ),
      );
      p.inquiryTryOn = Number(
        related.some(
          (e) =>
            e.channel === "MOBILE" &&
            e.name === "product_inquiry_requested" &&
            related.some(
              (x) =>
                x.channel === "STAFF" &&
                x.name === "tryon_confirmed" &&
                x.at >= e.at,
            ),
        ),
      );
      const rollup = products.get(id)!;
      for (const field of Object.keys(p) as (keyof typeof p)[])
        rollup[field] += p[field];
      for (const axis of ["brand", "category"] as const) {
        const label = rollup[axis],
          record = touched[axis].get(label) ?? empty();
        for (const field of Object.keys(p) as (keyof typeof p)[])
          record[field] = Math.max(record[field], p[field]);
        touched[axis].set(label, record);
      }
    }
    for (const axis of ["brand", "category"] as const)
      for (const [label, p] of touched[axis]) {
        const total = groups[axis].get(label) ?? empty();
        for (const field of Object.keys(p) as (keyof typeof p)[])
          total[field] += p[field];
        groups[axis].set(label, total);
      }
  }
  const result = [...products.values()].filter((p) =>
    Object.keys(empty()).some(
      (key) => p[key as keyof ReturnType<typeof empty>],
    ),
  );
  const breakdown = (key: "brand" | "category") =>
    [...groups[key]].map(([label, p]) => ({
      label,
      recommended: p.recommended,
      views: p.viewed,
      inquiries: p.inquiries,
      tryOns: p.tryOns,
      purchases: salesAvailable ? p.purchased : null,
    }));
  return {
    products: result.map((p) => ({
      ...p,
      purchased: salesAvailable ? p.purchased : null,
      lowConversion:
        salesAvailable &&
        p.impressions >= 10 &&
        p.purchased / p.impressions < 0.1,
      ctr: p.impressions ? p.clicks / p.impressions : null,
      recommendationToInquiry: p.impressions
        ? p.afterRecommendation / p.impressions
        : null,
      inquiryToTryOn: p.inquiries ? p.inquiryTryOn / p.inquiries : null,
    })),
    ranked: [...ranked.values()].map((r) => ({
      ...r,
      sku: products.get(r.productId)?.sku,
    })),
    brands: breakdown("brand"),
    categories: breakdown("category"),
    gold: [...gold].map(([label, count]) => ({ label, count })),
    budgets,
  };
}
