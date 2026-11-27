import { db } from "@/lib/db";
import { photoUrl } from "../catalog/photo";
import type { StoreScope } from "../catalog/service";

export async function customerRequests(scope: StoreScope, userId: string) {
  const { organizationId, storeId } = scope;
  const where = { organizationId, session: { organizationId, storeId } };
  const durations = new Date(Date.now() - 86400000);
  const scoped = {
    ...where,
    OR: [
      {
        fulfillmentState: {
          notIn: ["COMPLETED", "CANCELLED"] as ("COMPLETED" | "CANCELLED")[],
        },
      },
      { updatedAt: { gte: durations } },
    ],
  };
  const select = {
    id: true,
    sessionId: true,
    fulfillmentState: true,
    assigneeId: true,
    createdAt: true,
    acknowledgedAt: true,
    completedAt: true,
    cancelledAt: true,
    product: {
      select: {
        sku: true,
        name: true,
        images: {
          orderBy: { createdAt: "asc" as const },
          take: 1,
          select: { storagePath: true },
        },
        stock: {
          where: { organizationId, storeId },
          take: 1,
          select: { displayLocation: true },
        },
      },
    },
  } as const;
  const ordering = [
    { fulfillmentState: "asc" as const },
    { createdAt: "asc" as const },
  ];
  const [inquiries, tryOns, alerts] = await Promise.all([
    db.productInquiry.findMany({
      where: scoped,
      select: { ...select, channel: true, contactEmail: true },
      orderBy: ordering,
      take: 80,
    }),
    db.tryOn.findMany({
      where: scoped,
      select: { ...select, source: true, customerConfirmedAt: true },
      orderBy: ordering,
      take: 80,
    }),
    db.operationalAlert.findMany({
      where: { organizationId, storeId, resolvedAt: null },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, kind: true, message: true },
    }),
  ]);
  const summarize = (
    row: (typeof inquiries)[number] | (typeof tryOns)[number],
  ) => ({
    id: row.id,
    sessionId: row.sessionId,
    state: row.fulfillmentState,
    assigned:
      row.assigneeId === null
        ? "open"
        : row.assigneeId === userId
          ? "you"
          : "other",
    kind: "channel" in row ? ("inquiry" as const) : ("tryon" as const),
    channel:
      "channel" in row
        ? row.channel
        : row.source === "staff"
          ? "staff"
          : "in_store",
    contactEmail: "contactEmail" in row ? row.contactEmail : null,
    customerConfirmed:
      "customerConfirmedAt" in row && !!row.customerConfirmedAt,
    createdAt: row.createdAt.toISOString(),
    closedAt: (row.completedAt ?? row.cancelledAt)?.toISOString() ?? null,
    product: {
      name: row.product.name,
      sku: row.product.sku,
      photo: row.product.images[0]
        ? photoUrl(row.product.images[0].storagePath)
        : null,
      location: row.product.stock[0]?.displayLocation ?? null,
    },
  });
  return {
    requests: [...inquiries, ...tryOns]
      .map(summarize)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    alerts,
  };
}
