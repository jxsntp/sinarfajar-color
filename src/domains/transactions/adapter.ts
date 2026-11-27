import { z } from "zod";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { digest } from "@/lib/credentials";
import { HttpError } from "@/lib/http";
import type { StoreScope } from "../catalog/service";
import { writeEvent } from "../analytics/events";

const money = z
  .string()
  .regex(/^\d{1,14}(?:\.\d{1,2})?$/)
  .transform((value) => new Prisma.Decimal(value).toFixed(2));
const ref = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => !/(?:report_|checkout_)[A-Za-z0-9_-]{43}/.test(value));
const stamp = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value))
  .refine((value) => value.getTime() < Date.now() + 120000);
const sku = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9._-]{1,64}$/);
const code = z.string().regex(/^checkout_[A-Za-z0-9_-]{43}$/);
const lines = z
  .array(
    z
      .object({
        sku,
        quantity: z.number().int().positive().max(9999),
        unitPrice: money,
      })
      .strict(),
  )
  .min(1)
  .max(100);
export const posCommand = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("sale"),
      externalRef: ref,
      soldAt: stamp,
      currency: z.literal("IDR"),
      total: money,
      lines,
      checkoutCode: code.optional(),
    })
    .strict(),
  z
    .object({
      type: z.enum(["refund", "cancel"]),
      externalRef: ref,
      adjustmentRef: ref,
      occurredAt: stamp,
      amount: money.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("inventory"),
      observedAt: stamp,
      items: z
        .array(
          z
            .object({
              sku,
              onHand: z.number().int().nonnegative().max(1000000),
            })
            .strict(),
        )
        .min(1)
        .max(100),
    })
    .strict(),
  z
    .object({ type: z.literal("link"), externalRef: ref, checkoutCode: code })
    .strict(),
]);
type Command = z.output<typeof posCommand>;
type Sale = Extract<Command, { type: "sale" }>;
type Adjustment = Extract<Command, { type: "refund" | "cancel" }>;
type Inventory = Extract<Command, { type: "inventory" }>;
type Link = Extract<Command, { type: "link" }>;
type Tx = Prisma.TransactionClient;
type SaleRow = Prisma.TransactionGetPayload<{
  include: { items: { include: { product: { select: { sku: true } } } } };
}>;
export interface POSAdapter {
  recordSale(
    scope: StoreScope,
    input: Sale,
  ): Promise<{ id: string; duplicate: boolean; attribution: string }>;
  recordAdjustment(
    scope: StoreScope,
    input: Adjustment,
  ): Promise<{ duplicate: boolean }>;
  synchronizeInventory(
    scope: StoreScope,
    input: Inventory,
  ): Promise<{ updated: number }>;
  linkSale(scope: StoreScope, input: Link): Promise<{ attribution: string }>;
}

const settings = z.coerce.number().int().min(15).max(10080).default(180);
export const attributionMinutes = () =>
  settings.parse(process.env.ATTRIBUTION_WINDOW_MINUTES);
const sum = (values: Prisma.Decimal[]) =>
  values.reduce((total, value) => total.plus(value), new Prisma.Decimal(0));
async function lockStore(tx: Tx, scope: StoreScope) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM "Store" WHERE id = ${scope.storeId}::uuid AND "organizationId" = ${scope.organizationId}::uuid FOR NO KEY UPDATE`;
  if (!rows.length) throw new HttpError(404, "store_unavailable");
}
const findSale = (tx: Tx, scope: StoreScope, externalRef: string) =>
  tx.transaction.findUnique({
    where: { organizationId_storeId_externalRef: { ...scope, externalRef } },
    include: { items: { include: { product: { select: { sku: true } } } } },
  });
function signature(
  items: { sku: string; quantity: number; unitPrice: string }[],
) {
  return JSON.stringify(
    items
      .map((item) => [item.sku, item.quantity, item.unitPrice])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
}

class SaleLedger implements POSAdapter {
  constructor(private readonly source: "mock" | "csv") {}

  async recordSale(scope: StoreScope, input: Sale) {
    const lineTotal = sum(
      input.lines.map((line) =>
        new Prisma.Decimal(line.unitPrice).mul(line.quantity),
      ),
    );
    if (!lineTotal.eq(input.total))
      throw new HttpError(400, "sale_total_mismatch");
    const result = await db.$transaction(async (tx) => {
      await lockStore(tx, scope);
      const prior = await findSale(tx, scope, input.externalRef);
      if (prior) {
        await tx.transaction.update({
          where: { id: prior.id },
          data: { duplicateCount: { increment: 1 } },
        });
        const recorded = prior.items.map((line) => ({
          sku: line.product.sku,
          quantity: line.quantity,
          unitPrice: line.unitPrice.toFixed(2),
        }));
        if (
          prior.soldAt.getTime() !== input.soldAt.getTime() ||
          prior.currency !== input.currency ||
          !prior.total.eq(input.total) ||
          signature(recorded) !== signature(input.lines)
        ) {
          return { conflict: true as const };
        }
        const attribution =
          input.checkoutCode && !prior.sessionId
            ? await this.tryAttach(tx, scope, prior, input.checkoutCode)
            : prior.attribution;
        return { id: prior.id, duplicate: true, attribution };
      }
      const products = await tx.product.findMany({
        where: {
          organizationId: scope.organizationId,
          sku: { in: input.lines.map((line) => line.sku) },
        },
        select: { id: true, sku: true },
      });
      const ids = new Map(products.map((product) => [product.sku, product.id]));
      if (input.lines.some((line) => !ids.has(line.sku)))
        throw new HttpError(400, "unknown_sale_sku");
      const sale = await tx.transaction.create({
        data: {
          ...scope,
          source: this.source,
          externalRef: input.externalRef,
          soldAt: input.soldAt,
          currency: input.currency,
          total: input.total,
        },
      });
      await tx.transactionItem.createMany({
        data: input.lines.map((line) => ({
          organizationId: scope.organizationId,
          transactionId: sale.id,
          productId: ids.get(line.sku)!,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        })),
      });
      const attribution = input.checkoutCode
        ? await this.tryAttach(
            tx,
            scope,
            (await findSale(tx, scope, input.externalRef))!,
            input.checkoutCode,
          )
        : sale.attribution;
      return { id: sale.id, duplicate: false, attribution };
    });
    if ("conflict" in result)
      throw new HttpError(409, "duplicate_transaction_conflict");
    return result;
  }

  async recordAdjustment(scope: StoreScope, input: Adjustment) {
    return db.$transaction(async (tx) => {
      await lockStore(tx, scope);
      const sale = await findSale(tx, scope, input.externalRef);
      if (!sale) throw new HttpError(404, "missing_original_sale");
      const adjustments = await tx.saleAdjustment.findMany({
        where: { organizationId: scope.organizationId, transactionId: sale.id },
      });
      const prior = adjustments.find(
        (row) => row.externalRef === input.adjustmentRef,
      );
      if (prior) {
        if (
          prior.kind !== input.type ||
          prior.occurredAt.getTime() !== input.occurredAt.getTime() ||
          (input.amount && !prior.amount.eq(input.amount))
        )
          throw new HttpError(409, "conflicting_adjustment");
        return { duplicate: true };
      }
      if (
        input.occurredAt < sale.soldAt ||
        adjustments.some((row) => row.kind === "cancel")
      )
        throw new HttpError(409, "invalid_adjustment");
      const remaining = sale.total.minus(
        sum(adjustments.map((row) => row.amount)),
      );
      const amount =
        input.type === "cancel"
          ? remaining
          : new Prisma.Decimal(input.amount ?? 0);
      if (
        amount.gt(remaining) ||
        (input.type === "refund" && amount.lte(0)) ||
        (input.type === "cancel" && input.amount && !amount.eq(input.amount))
      )
        throw new HttpError(400, "invalid_adjustment_amount");
      await tx.saleAdjustment.create({
        data: {
          organizationId: scope.organizationId,
          transactionId: sale.id,
          externalRef: input.adjustmentRef,
          kind: input.type,
          amount,
          occurredAt: input.occurredAt,
        },
      });
      if (sale.sessionId) {
        const session = await tx.customerSession.findFirstOrThrow({
          where: { ...scope, id: sale.sessionId },
        });
        await writeEvent(tx, session, "POS", {
          id: randomUUID(),
          name:
            input.type === "refund"
              ? "purchase_refunded"
              : "purchase_cancelled",
          occurredAt: input.occurredAt,
        });
      }
      return { duplicate: false };
    });
  }

  async synchronizeInventory(scope: StoreScope, input: Inventory) {
    if (
      new Set(input.items.map((item) => item.sku)).size !== input.items.length
    )
      throw new HttpError(400, "duplicate_inventory_sku");
    return db.$transaction(async (tx) => {
      await lockStore(tx, scope);
      const rows = await tx.inventory.findMany({
        where: {
          ...scope,
          product: { sku: { in: input.items.map((item) => item.sku) } },
        },
        include: { product: { select: { sku: true } } },
      });
      if (rows.length !== input.items.length)
        throw new HttpError(400, "unknown_store_inventory");
      let updated = 0;
      for (const item of input.items) {
        const row = rows.find((row) => row.product.sku === item.sku)!;
        if (row.verifiedAt && row.verifiedAt > input.observedAt) {
          throw new HttpError(409, "stale_inventory_snapshot");
        }
        if (row.posSyncedAt && row.posSyncedAt >= input.observedAt) {
          if (
            row.posSyncedAt.getTime() === input.observedAt.getTime() &&
            row.onHand !== item.onHand
          )
            throw new HttpError(409, "conflicting_inventory_snapshot");
          continue;
        }
        await tx.inventory.update({
          where: { id: row.id },
          data: { onHand: item.onHand, posSyncedAt: input.observedAt },
        });
        updated++;
      }
      return { updated };
    });
  }

  async linkSale(scope: StoreScope, input: Link) {
    return db.$transaction(async (tx) => {
      await lockStore(tx, scope);
      const sale = await findSale(tx, scope, input.externalRef);
      if (!sale) throw new HttpError(404, "missing_original_sale");
      return {
        attribution: await this.attach(tx, scope, sale, input.checkoutCode),
      };
    });
  }

  private async tryAttach(
    tx: Tx,
    scope: StoreScope,
    sale: SaleRow,
    checkoutCode: string,
  ) {
    try {
      return await this.attach(tx, scope, sale, checkoutCode);
    } catch (error) {
      if (error instanceof HttpError && error.code === "checkout_unavailable")
        return sale.attribution;
      throw error;
    }
  }

  private async attach(
    tx: Tx,
    scope: StoreScope,
    sale: SaleRow,
    checkoutCode: string,
  ) {
    const earliest = new Date(
      sale.soldAt.getTime() - attributionMinutes() * 60000,
    );
    const session = await tx.customerSession.findFirst({
      where: {
        ...scope,
        checkoutHash: digest(checkoutCode, "checkout"),
        checkoutExpiresAt: { gt: new Date() },
        createdAt: { gte: earliest, lte: sale.soldAt },
      },
    });
    if (!session) throw new HttpError(409, "checkout_unavailable");
    if (sale.sessionId && sale.sessionId !== session.id)
      throw new HttpError(409, "transaction_already_linked");
    if (sale.sessionId) return sale.attribution;

    const impressions = await tx.interactionEvent.findMany({
      where: {
        organizationId: scope.organizationId,
        sessionId: session.id,
        channel: "MOBILE",
        name: "recommendation_impression",
        occurredAt: { gte: earliest, lte: sale.soldAt },
        run: { status: "COMPLETE" },
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      select: { runId: true, run: { select: { strategy: true } } },
    });
    const strategy = impressions[0]?.run?.strategy;
    const attribution =
      strategy === "openrouter"
        ? "ai_assisted"
        : strategy === "rules"
          ? "rules_assisted"
          : "session_only";
    const products = await tx.recommendationItem.findMany({
      where: {
        organizationId: scope.organizationId,
        runId: {
          in: [
            ...new Set(
              impressions.flatMap((event) =>
                event.runId ? [event.runId] : [],
              ),
            ),
          ],
        },
        productId: { in: sale.items.map((item) => item.productId) },
      },
      select: { productId: true },
    });
    await tx.transactionItem.updateMany({
      where: {
        organizationId: scope.organizationId,
        transactionId: sale.id,
        productId: { in: products.map((product) => product.productId) },
      },
      data: { recommended: true },
    });
    await tx.transaction.update({
      where: { id: sale.id },
      data: { sessionId: session.id, attribution },
    });
    await writeEvent(tx, session, "POS", {
      id: randomUUID(),
      name: "purchase_completed",
      occurredAt: sale.soldAt,
      runId: impressions[0]?.runId ?? undefined,
    });
    const priorAdjustments = await tx.saleAdjustment.findMany({
      where: { organizationId: scope.organizationId, transactionId: sale.id },
    });
    for (const row of priorAdjustments) {
      await writeEvent(tx, session, "POS", {
        id: randomUUID(),
        name:
          row.kind === "cancel" ? "purchase_cancelled" : "purchase_refunded",
        occurredAt: row.occurredAt,
      });
    }
    return attribution;
  }
}

export const mockPOSAdapter: POSAdapter = new SaleLedger("mock");
export const csvPOSAdapter: POSAdapter = new SaleLedger("csv");

export function runPOS(adapter: POSAdapter, scope: StoreScope, input: Command) {
  switch (input.type) {
    case "sale":
      return adapter.recordSale(scope, input);
    case "refund":
    case "cancel":
      return adapter.recordAdjustment(scope, input);
    case "inventory":
      return adapter.synchronizeInventory(scope, input);
    case "link":
      return adapter.linkSale(scope, input);
  }
}
