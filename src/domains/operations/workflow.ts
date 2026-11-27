import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { allow, storeFilter, type StaffScope } from "../authentication/access";
import { writeEvent } from "../analytics/events";
import { reportScope } from "../sessions/service";
import { raiseAlert } from "./alerts";
import type { FulfillmentState, Prisma } from "@prisma/client";

export const requestKind = z.enum(["inquiry", "tryon"]);
export type RequestKind = z.infer<typeof requestKind>;
export const requestCommand = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("transition"),
      id: z.uuid(),
      kind: requestKind,
      state: z.enum([
        "ACKNOWLEDGED",
        "PREPARING",
        "READY",
        "COMPLETED",
        "CANCELLED",
      ]),
    })
    .strict(),
  z
    .object({
      action: z.literal("scan"),
      sessionId: z.uuid(),
      code: z.string().trim().min(1).max(128),
      requestId: z.uuid().optional(),
    })
    .strict(),
]);

const next: Record<FulfillmentState, readonly FulfillmentState[]> = {
  PENDING: ["ACKNOWLEDGED", "CANCELLED"],
  ACKNOWLEDGED: ["PREPARING", "READY", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};
const event = (name: string, productId: string) => ({
  id: randomUUID(),
  name,
  productId,
  occurredAt: new Date(),
});
async function lockSession(
  tx: Prisma.TransactionClient,
  id: string,
  organizationId: string,
) {
  await tx.$queryRaw`SELECT id FROM "CustomerSession" WHERE id = ${id}::uuid AND "organizationId" = ${organizationId}::uuid FOR NO KEY UPDATE`;
}

export async function requestOperation(
  scope: StaffScope,
  input: z.infer<typeof requestCommand>,
) {
  allow(scope, "staff");
  if (input.action === "scan") return staffScan(scope, input);
  return db.$transaction(async (tx) => {
    const where = {
      id: input.id,
      organizationId: scope.organizationId,
      session: storeFilter(scope),
    };
    const select = {
      id: true,
      session: true,
      productId: true,
      fulfillmentState: true,
      assigneeId: true,
    } as const;
    const row =
      input.kind === "inquiry"
        ? await tx.productInquiry.findFirst({ where, select })
        : await tx.tryOn.findFirst({ where, select });
    if (!row) throw new HttpError(404, "request_unavailable");
    await lockSession(tx, row.session.id, scope.organizationId);
    if (row.assigneeId && row.assigneeId !== scope.userId)
      throw new HttpError(409, "already_assigned");
    if (row.fulfillmentState === input.state && row.assigneeId === scope.userId)
      return { state: input.state };
    if (!next[row.fulfillmentState].includes(input.state))
      throw new HttpError(409, "invalid_transition");
    if (input.kind === "tryon" && input.state === "COMPLETED")
      throw new HttpError(400, "scan_required");
    const now = new Date();
    const expected = {
      ...where,
      fulfillmentState: row.fulfillmentState,
      assigneeId: row.assigneeId,
    };
    const data = {
      fulfillmentState: input.state,
      assigneeId: scope.userId,
      acknowledgedAt: input.state === "ACKNOWLEDGED" ? now : undefined,
      completedAt: input.state === "COMPLETED" ? now : undefined,
      cancelledAt: input.state === "CANCELLED" ? now : undefined,
    };
    const update =
      input.kind === "inquiry"
        ? await tx.productInquiry.updateMany({ where: expected, data })
        : await tx.tryOn.updateMany({ where: expected, data });
    if (!update.count) throw new HttpError(409, "request_changed");
    const resolved = ["ACKNOWLEDGED", "COMPLETED", "CANCELLED"].includes(
      input.state,
    );
    if (resolved)
      await tx.operationalAlert.updateMany({
        where: {
          organizationId: scope.organizationId,
          storeId: row.session.storeId,
          subject: row.id,
          resolvedAt: null,
          ...(input.state === "ACKNOWLEDGED"
            ? { kind: { in: ["NEW_REQUEST", "UNACKNOWLEDGED"] } }
            : {}),
        },
        data: { resolvedAt: now },
      });
    await writeEvent(
      tx,
      row.session,
      "STAFF",
      event("request_" + input.state.toLowerCase(), row.productId),
    );
    return { state: input.state };
  });
}

function productCode(raw: string) {
  const value = raw.trim();
  const match = /^sinar-fajar:sku:([A-Za-z0-9._-]{1,64})$/i.exec(value);
  if (match) return match[1];
  if (/^[A-Za-z0-9._-]{1,64}$/.test(value)) return value;
  throw new HttpError(400, "invalid_product_label");
}

async function staffScan(
  scope: StaffScope,
  input: Extract<z.infer<typeof requestCommand>, { action: "scan" }>,
) {
  const code = productCode(input.code);
  const result = await db.$transaction(async (tx) => {
    const session = await tx.customerSession.findFirst({
      where: { id: input.sessionId, ...storeFilter(scope) },
    });
    if (!session) throw new HttpError(404, "session_unavailable");
    await lockSession(tx, session.id, session.organizationId);
    const products = await tx.product.findMany({
      where: {
        organizationId: scope.organizationId,
        archived: false,
        OR: [{ sku: code }, { barcode: code }],
      },
      take: 2,
    });
    if (products.length > 1)
      throw new HttpError(409, "ambiguous_product_label");
    const product = products[0];
    const stock =
      product &&
      (await tx.inventory.findFirst({
        where: {
          organizationId: scope.organizationId,
          storeId: session.storeId,
          productId: product.id,
        },
      }));
    if (!stock || stock.onHand < 1) {
      await raiseAlert(
        tx,
        session,
        "INVENTORY_DISCREPANCY",
        session.id + ":" + (product?.id ?? "missing"),
        "Staff scanned an item that the store inventory could not confirm.",
      );
      return { error: true as const };
    }
    const now = new Date();
    const where = {
      organizationId: scope.organizationId,
      sessionId: session.id,
      productId: product.id,
    };
    if (input.requestId) {
      const existing = await tx.tryOn.findFirst({
        where: {
          ...where,
          id: input.requestId,
          source: "customer",
          assigneeId: scope.userId,
        },
      });
      if (!existing)
        throw new HttpError(409, "assigned_matching_tryon_required");
      if (existing.fulfillmentState === "COMPLETED" && existing.scannedAt)
        return { confirmed: true as const, id: existing.id };
      const updated = await tx.tryOn.updateMany({
        where: {
          ...where,
          id: existing.id,
          assigneeId: scope.userId,
          fulfillmentState: "READY",
        },
        data: {
          fulfillmentState: "COMPLETED",
          scannedAt: now,
          confirmedAt: now,
          completedAt: now,
        },
      });
      if (!updated.count) throw new HttpError(409, "tryon_not_ready");
      await tx.operationalAlert.updateMany({
        where: {
          organizationId: scope.organizationId,
          storeId: session.storeId,
          subject: existing.id,
          resolvedAt: null,
        },
        data: { resolvedAt: now },
      });
      await writeEvent(
        tx,
        session,
        "STAFF",
        event("tryon_confirmed", product.id),
      );
      return { confirmed: true as const, id: existing.id };
    }
    const duplicate = await tx.tryOn.findFirst({
      where: { ...where, source: "staff", scannedAt: { not: null } },
    });
    if (duplicate) return { confirmed: true as const, id: duplicate.id };
    const row = await tx.tryOn.create({
      data: {
        ...where,
        source: "staff",
        assigneeId: scope.userId,
        fulfillmentState: "COMPLETED",
        scannedAt: now,
        confirmedAt: now,
        completedAt: now,
      },
    });
    await writeEvent(
      tx,
      session,
      "STAFF",
      event("staff_product_interaction", product.id),
    );
    await writeEvent(
      tx,
      session,
      "STAFF",
      event("tryon_confirmed", product.id),
    );
    return { confirmed: true as const, id: row.id };
  });
  if ("error" in result) throw new HttpError(409, "inventory_discrepancy");
  return result;
}

export async function customerTryOns(token: string) {
  const session = await reportScope(token);
  return db.tryOn.findMany({
    where: {
      organizationId: session.organizationId,
      sessionId: session.id,
      scannedAt: { not: null },
      fulfillmentState: "COMPLETED",
    },
    select: {
      id: true,
      customerConfirmedAt: true,
      product: { select: { name: true } },
    },
  });
}

export async function confirmCustomerTryOn(token: string, id: string) {
  return db.$transaction(async (tx) => {
    const session = await reportScope(token, tx);
    await lockSession(tx, session.id, session.organizationId);
    const where = {
      organizationId: session.organizationId,
      sessionId: session.id,
      id,
      scannedAt: { not: null },
      fulfillmentState: "COMPLETED" as const,
    };
    const row = await tx.tryOn.findFirst({ where });
    if (!row) throw new HttpError(404, "tryon_unavailable");
    const result = await tx.tryOn.updateMany({
      where: { ...where, customerConfirmedAt: null },
      data: { customerConfirmedAt: new Date() },
    });
    if (result.count)
      await writeEvent(
        tx,
        session,
        "MOBILE",
        event("tryon_customer_confirmed", row.productId),
      );
    return { confirmed: true };
  });
}
