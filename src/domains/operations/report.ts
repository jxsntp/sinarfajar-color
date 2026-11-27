import { db } from "@/lib/db";
import type { StoreScope } from "../catalog/service";

export async function operationalReport(
  scope: StoreScope,
  expected: string[] = [],
) {
  const { organizationId, storeId } = scope;
  const since = new Date(Date.now() - 7 * 86400000);
  const [rows, workload, recent, missing, unmatched, sales] = await Promise.all(
    [
      db.$queryRaw<
        {
          pending: number;
          cancelled: number;
          acknowledgedSeconds: number | null;
          fulfillmentSeconds: number | null;
          tryOns: number;
          customerConfirmed: number;
        }[]
      >`
      WITH requests AS (
        SELECT i."fulfillmentState", i."createdAt", i."acknowledgedAt", i."completedAt", i."cancelledAt", false AS tryon, false AS confirmed
        FROM "ProductInquiry" i JOIN "CustomerSession" s ON s.id=i."sessionId" AND s."organizationId"=i."organizationId"
        WHERE s."organizationId"=${organizationId}::uuid AND s."storeId"=${storeId}::uuid AND i.channel='in_store'
        UNION ALL
        SELECT i."fulfillmentState", i."createdAt", i."acknowledgedAt", i."completedAt", i."cancelledAt", true, i."customerConfirmedAt" IS NOT NULL
        FROM "TryOn" i JOIN "CustomerSession" s ON s.id=i."sessionId" AND s."organizationId"=i."organizationId"
        WHERE s."organizationId"=${organizationId}::uuid AND s."storeId"=${storeId}::uuid
      ) SELECT count(*) FILTER (WHERE "fulfillmentState"='PENDING')::int AS pending,
        count(*) FILTER (WHERE "cancelledAt">=${since})::int AS cancelled,
        avg(extract(epoch FROM "acknowledgedAt"-"createdAt")) FILTER (WHERE "acknowledgedAt">=${since})::float8 AS "acknowledgedSeconds",
        avg(extract(epoch FROM "completedAt"-"createdAt")) FILTER (WHERE "completedAt">=${since} AND "acknowledgedAt" IS NOT NULL)::float8 AS "fulfillmentSeconds",
        count(*) FILTER (WHERE tryon AND "completedAt">=${since})::int AS "tryOns",
        count(*) FILTER (WHERE confirmed AND "completedAt">=${since})::int AS "customerConfirmed" FROM requests`,
      db.$queryRaw<{ staffId: string; active: number; completed: number }[]>`
      WITH assigned AS (
        SELECT i."assigneeId",i."fulfillmentState",i."completedAt" FROM "ProductInquiry" i JOIN "CustomerSession" s ON s.id=i."sessionId" AND s."organizationId"=i."organizationId"
        WHERE s."organizationId"=${organizationId}::uuid AND s."storeId"=${storeId}::uuid
        UNION ALL
        SELECT i."assigneeId",i."fulfillmentState",i."completedAt" FROM "TryOn" i JOIN "CustomerSession" s ON s.id=i."sessionId" AND s."organizationId"=i."organizationId"
        WHERE s."organizationId"=${organizationId}::uuid AND s."storeId"=${storeId}::uuid
      ) SELECT "assigneeId" AS "staffId", count(*) FILTER (WHERE "fulfillmentState" NOT IN ('COMPLETED','CANCELLED'))::int AS active,
        count(*) FILTER (WHERE "completedAt">=${since})::int AS completed FROM assigned WHERE "assigneeId" IS NOT NULL
        GROUP BY "assigneeId" ORDER BY active DESC,completed DESC`,
      db.transaction.findMany({
        where: { organizationId, storeId, soldAt: { gte: since } },
        orderBy: { soldAt: "desc" },
        take: 150,
        include: {
          adjustments: { select: { kind: true, amount: true } },
          items: {
            select: {
              quantity: true,
              recommended: true,
              product: { select: { sku: true } },
            },
          },
        },
      }),
      expected.length
        ? db.transaction.findMany({
            where: { organizationId, storeId, externalRef: { in: expected } },
            select: { externalRef: true },
          })
        : [],
      db.customerSession.findMany({
        where: {
          organizationId,
          storeId,
          checkoutExpiresAt: { gte: since },
          storeTransactions: { none: {} },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, createdAt: true },
      }),
      db.$queryRaw<
        { total: number; linked: number }[]
      >`SELECT count(*)::int AS total, count("sessionId")::int AS linked FROM "Transaction"
      WHERE "organizationId"=${organizationId}::uuid AND "storeId"=${storeId}::uuid AND "soldAt">=${since}`,
    ],
  );
  return {
    metrics: rows[0],
    workload,
    sales: sales[0],
    unmatched,
    missing: expected.filter(
      (ref) => !missing.some((sale) => sale.externalRef === ref),
    ),
    transactions: recent.map((sale) => {
      const adjusted = sale.adjustments.reduce(
        (total, entry) => total.plus(entry.amount),
        sale.total.minus(sale.total),
      );
      return {
        externalRef: sale.externalRef,
        sessionId: sale.sessionId,
        source: sale.source,
        status: sale.adjustments.some((entry) => entry.kind === "cancel")
          ? "cancelled"
          : adjusted.gt(0)
            ? adjusted.eq(sale.total)
              ? "refunded"
              : "partially_refunded"
            : "completed",
        gross: sale.total.toFixed(2),
        net: sale.total.minus(adjusted).toFixed(2),
        attribution: sale.attribution,
        duplicates: sale.duplicateCount,
        items: sale.items.map((item) => ({
          sku: item.product.sku,
          quantity: item.quantity,
          recommended: item.recommended,
        })),
      };
    }),
  };
}
