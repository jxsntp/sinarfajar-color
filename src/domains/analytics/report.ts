import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { allow, type StaffScope } from "../authentication/access";
import { compareExperiments } from "../experiments/statistics";
import { summarize, productIntelligence, type SessionFact } from "./metrics";

const dayMs = 86400000;
const offset = 7 * 3600000;
export const dayKey = (date: Date) =>
  new Date(date.getTime() + offset).toISOString().slice(0, 10);
export const dayStart = (key: string) => new Date(key + "T00:00:00+07:00");
export const filters = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    store: z.uuid().optional(),
    brand: z.uuid().optional(),
    category: z.string().max(80).optional(),
    campaign: z.union([z.uuid(), z.enum(["opening", "ongoing"])]).optional(),
    assisted: z.enum(["assisted", "self"]).optional(),
    variant: z
      .enum(["B", "C", "rules", "openrouter", "palette-first", "metals-first"])
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.to >= value.from &&
      dayStart(value.to).getTime() - dayStart(value.from).getTime() <
        92 * dayMs,
    { path: ["to"] },
  );
export type Filters = z.output<typeof filters>;
export function defaultFilters(now = new Date()) {
  return { from: dayKey(new Date(now.getTime() - 6 * dayMs)), to: dayKey(now) };
}
export const canSeeFinance = (scope: StaffScope) =>
  scope.role !== "MARKETING_ANALYST";

export async function analyticsChoices(scope: StaffScope) {
  allow(scope, "dashboard");
  const { organizationId, storeId } = scope;
  const [stores, brands, categories, campaigns] = await Promise.all([
    db.store.findMany({
      where: { organizationId, id: storeId ?? undefined },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.brand.findMany({
      where: { organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.product.findMany({
      where: { organizationId },
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    }),
    db.analyticsCampaign.findMany({
      where: { organizationId, storeId: storeId ?? undefined },
      select: { id: true, label: true, storeId: true },
      orderBy: { startsAt: "desc" },
      take: 100,
    }),
  ]);
  return {
    stores,
    brands,
    categories: categories.map((p) => p.category),
    campaigns,
  };
}
function parsePreferences(json: Prisma.JsonValue) {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const gold =
    typeof json.preferredGold === "string" ? json.preferredGold : undefined;
  const budget =
    typeof json.maxBudget === "string" && /^\d+(?:\.\d+)?$/.test(json.maxBudget)
      ? Number(json.maxBudget)
      : undefined;
  return { gold, budget };
}
export async function analyticsReport(
  scope: StaffScope,
  filter: Filters,
  asOf = new Date(),
) {
  allow(scope, "dashboard");
  const days =
    (dayStart(filter.to).getTime() - dayStart(filter.from).getTime()) / dayMs +
    1;
  const start = dayStart(filter.from);
  const end = new Date(start.getTime() + days * dayMs);
  const endOfObservation = new Date(
    Math.min(asOf.getTime(), end.getTime() + 60 * dayMs),
  );
  if (scope.storeId && filter.store && scope.storeId !== filter.store)
    throw new HttpError(404, "store_unavailable");
  const organizationId = scope.organizationId;
  const stores = await db.store.findMany({
    where: { organizationId, id: scope.storeId ?? filter.store },
    select: { id: true },
  });
  if (filter.store && !stores.length)
    throw new HttpError(404, "store_unavailable");
  const storeIds = stores.map((row) => row.id);
  const range = { gte: start, lte: endOfObservation };
  const campaign = filter.campaign;
  const campaignField =
    campaign === "ongoing"
      ? null
      : campaign === "opening"
        ? { not: null }
        : campaign;
  const [source, catalog, daily, campaigns, protocols, receiptStores] =
    await Promise.all([
      db.customerSession.findMany({
        where: {
          organizationId,
          storeId: { in: storeIds },
          createdAt: { gte: start, lt: end },
          campaignId: campaignField,
          assisted:
            filter.assisted === undefined
              ? undefined
              : filter.assisted === "assisted",
          experimentAssignmentRecords: filter.variant
            ? { some: { variant: filter.variant } }
            : undefined,
        },
        take: 20001,
        select: {
          id: true,
          storeId: true,
          createdAt: true,
          campaignId: true,
          assisted: true,
          interactionEventRecords: {
            where: { occurredAt: range },
            select: {
              name: true,
              channel: true,
              occurredAt: true,
              productId: true,
              runId: true,
              rank: true,
            },
          },
          recommendationRunRecords: {
            where: { createdAt: range },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              strategy: true,
              createdAt: true,
              assignedStrategy: true,
              status: true,
              fallback: true,
              latencyMs: true,
              promptLabel: true,
              preferences: true,
              items: { select: { productId: true, rank: true } },
              attempts: {
                where: { createdAt: range },
                select: {
                  outcome: true,
                  createdAt: true,
                  costUsd: true,
                  inputTokens: true,
                  outputTokens: true,
                },
              },
            },
          },
          storeTransactions: {
            where: { soldAt: range, source: "csv" },
            select: {
              soldAt: true,
              total: true,
              adjustments: {
                where: { occurredAt: { lte: asOf } },
                select: { amount: true },
              },
              items: { select: { productId: true, recommended: true } },
            },
          },
          feedbackRecords: {
            where: { createdAt: range },
            orderBy: { updatedAt: "desc" },
            select: { subject: true, rating: true, createdAt: true },
          },
          experimentAssignmentRecords: {
            select: { experimentId: true, variant: true, createdAt: true },
          },
        },
      }),
      db.product.findMany({
        where: {
          organizationId,
          brandId: filter.brand,
          category: filter.category,
        },
        select: {
          id: true,
          sku: true,
          name: true,
          category: true,
          brand: { select: { name: true } },
        },
      }),
      db.analyticsDaily.findMany({
        where: {
          organizationId,
          storeId: { in: storeIds },
          day: { gte: filter.from, lte: filter.to },
        },
        select: {
          day: true,
          storeId: true,
          cohort: true,
          visitors: true,
          verifiedContent: true,
        },
      }),
      db.analyticsCampaign.findMany({
        where: {
          organizationId,
          storeId: { in: storeIds },
          startsAt: { lt: end },
          endsAt: { gt: start },
        },
        select: {
          id: true,
          label: true,
          storeId: true,
          startsAt: true,
          endsAt: true,
        },
      }),
      db.experiment.findMany({
        where: {
          organizationId,
          name: { in: ["mobile-ranking", "kiosk-reveal"] },
        },
        orderBy: [{ name: "asc" }, { version: "desc" }],
        select: {
          id: true,
          name: true,
          version: true,
          state: true,
          primaryOutcome: true,
          minimumPerArm: true,
          observationDays: true,
        },
      }),
      db.transaction.findMany({
        where: {
          organizationId,
          storeId: { in: storeIds },
          soldAt: range,
          source: "csv",
        },
        distinct: ["storeId"],
        select: { storeId: true },
      }),
    ]);
  if (source.length > 20000)
    throw new HttpError(422, "analytics_window_too_large");
  if (
    campaign &&
    campaign !== "ongoing" &&
    campaign !== "opening" &&
    !(await db.analyticsCampaign.findFirst({
      where: { id: campaign, organizationId, storeId: { in: storeIds } },
      select: { id: true },
    }))
  )
    throw new HttpError(404, "campaign_unavailable");
  const validSales =
    storeIds.length > 0 && receiptStores.length === storeIds.length;
  const rows: SessionFact[] = source.map((s) => {
    const base = s.createdAt.getTime();
    const eligible = (date: Date) =>
      date.getTime() >= base &&
      date.getTime() <= Math.min(base + 60 * dayMs, asOf.getTime());
    return {
      id: s.id,
      storeId: s.storeId,
      day: dayKey(s.createdAt),
      start: base,
      campaignId: s.campaignId,
      assisted: s.assisted,
      events: s.interactionEventRecords
        .filter((e) => eligible(e.occurredAt))
        .map((e) => ({
          name: e.name,
          channel: e.channel,
          at: e.occurredAt.getTime(),
          productId: e.productId,
          runId: e.runId,
          rank: e.rank,
        })),
      runs: s.recommendationRunRecords.map((r) => ({
        id: r.id,
        strategy: r.strategy,
        at: r.createdAt.getTime(),
        assigned: r.assignedStrategy,
        status: r.status,
        fallback: r.fallback,
        latency: r.latencyMs,
        prompt: r.promptLabel,
        candidates: r.items,
        ...parsePreferences(r.preferences),
        attempts: r.attempts.map((a) => ({
          cost: a.costUsd?.toNumber() ?? null,
          at: a.createdAt.getTime(),
          outcome: a.outcome,
          input: a.inputTokens,
          output: a.outputTokens,
        })),
      })),
      sales: s.storeTransactions
        .filter((sale) => eligible(sale.soldAt))
        .map((sale) => ({
          net: sale.adjustments
            .reduce((total, a) => total.minus(a.amount), sale.total)
            .toNumber(),
          at: sale.soldAt.getTime(),
          items: sale.items,
        })),
      assignments: s.experimentAssignmentRecords.map((a) => ({
        experimentId: a.experimentId,
        variant: a.variant,
        at: a.createdAt.getTime(),
      })),
      feedback: s.feedbackRecords
        .filter((record) => record.createdAt.getTime() <= base + 30 * dayMs)
        .map(({ subject, rating }) => ({ subject, rating })),
    };
  });
  const dayList = Array.from({ length: days }, (_, i) =>
    dayKey(new Date(start.getTime() + i * dayMs)),
  );
  const cohorts = dayList.flatMap((day) =>
    stores.flatMap((store) => {
      const at = dayStart(day).getTime();
      const matches = campaigns.filter(
        (c) =>
          c.storeId === store.id &&
          c.startsAt.getTime() < at + dayMs &&
          c.endsAt.getTime() > at,
      );
      const all = [
        ...(matches.some(
          (c) => c.startsAt.getTime() <= at && c.endsAt.getTime() >= at + dayMs,
        )
          ? []
          : ["ongoing"]),
        ...matches.map((c) => c.id),
      ];
      const chosen = all.filter(
        (key) =>
          !campaign ||
          (campaign === "opening" ? key !== "ongoing" : key === campaign),
      );
      return chosen.map((cohort) => ({ day, storeId: store.id, cohort }));
    }),
  );
  const approved = (column: "visitors" | "verifiedContent") => {
    if (filter.assisted || filter.variant || !cohorts.length) return null;
    const observations = cohorts.map(
      (key) =>
        daily.find(
          (row) =>
            row.day === key.day &&
            row.storeId === key.storeId &&
            row.cohort === key.cohort,
        )?.[column] ?? null,
    );
    return observations.some((n) => n === null)
      ? null
      : observations.reduce<number>((total, n) => total + (n ?? 0), 0);
  };
  const cohortRows = rows.map((row) => ({
    ...row,
    events: row.events.filter((event) => event.at <= row.start + 30 * dayMs),
    runs: row.runs
      .filter((run) => (run.at ?? row.start) <= row.start + 30 * dayMs)
      .map((run) => ({
        ...run,
        attempts: run.attempts.filter(
          (attempt) => (attempt.at ?? row.start) <= row.start + 30 * dayMs,
        ),
      })),
    sales: row.sales.filter((sale) => sale.at <= row.start + 30 * dayMs),
  }));
  const productList = catalog.map((p) => ({ ...p, brand: p.brand.name }));
  const productIds =
    filter.brand || filter.category
      ? new Set(productList.map((p) => p.id))
      : undefined;
  const summary = summarize(
    cohortRows,
    {
      visitors: approved("visitors"),
      verifiedContent: approved("verifiedContent"),
      salesAvailable: validSales,
    },
    productIds,
  );
  const metrics = canSeeFinance(scope)
    ? summary.metrics
    : summary.metrics.filter((m) => m.unit !== "USD" && m.unit !== "IDR");
  const trend = dayList.map((day) => {
    const dailyRows = cohortRows.filter((s) => s.day === day);
    return {
      day,
      kiosk: dailyRows.length,
      open: dailyRows.filter((s) =>
        s.events.some((e) => e.name === "mobile_report_opened"),
      ).length,
    };
  });
  return {
    metrics,
    diagnostics: summary.diagnostics,
    trend,
    products: productIntelligence(cohortRows, productList, validSales),
    experiments: compareExperiments(
      rows,
      protocols,
      asOf.getTime(),
      validSales,
    ),
    cohort: {
      opening: rows.filter((s) => s.campaignId).length,
      ongoing: rows.filter((s) => !s.campaignId).length,
    },
  };
}
