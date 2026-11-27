import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { signature } from "@/lib/security";
import type { OperationalAlertKind, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import type { StoreScope } from "../catalog/service";

export async function raiseAlert(
  tx: Prisma.TransactionClient,
  scope: StoreScope,
  kind: OperationalAlertKind,
  subject: string,
  message: string,
) {
  const key = {
    organizationId: scope.organizationId,
    storeId: scope.storeId,
    kind,
    subject,
  };
  await tx.operationalAlert.upsert({
    where: { organizationId_storeId_kind_subject: key },
    create: { ...key, message },
    update: {},
  });
}

export async function refreshWaitAlerts(scope: StoreScope, now = new Date()) {
  const late = new Date(now.getTime() - 120000);
  const excessive = new Date(now.getTime() - 600000);
  const common = {
    organizationId: scope.organizationId,
    session: scope,
    fulfillmentState: {
      notIn: ["COMPLETED", "CANCELLED"] as ("COMPLETED" | "CANCELLED")[],
    },
    createdAt: { lte: late },
  };
  const select = { id: true, createdAt: true, fulfillmentState: true } as const;
  const [inquiries, tryOns] = await Promise.all([
    db.productInquiry.findMany({
      where: { ...common, channel: "in_store" },
      select,
    }),
    db.tryOn.findMany({ where: { ...common, source: "customer" }, select }),
  ]);
  const notifications = [...inquiries, ...tryOns].flatMap((request) => {
    const alerts: { kind: OperationalAlertKind; message: string }[] = [];
    if (request.fulfillmentState === "PENDING")
      alerts.push({
        kind: "UNACKNOWLEDGED",
        message: "Customer has been waiting two minutes for acknowledgment.",
      });
    if (request.createdAt <= excessive)
      alerts.push({
        kind: "EXCESSIVE_WAIT",
        message: "Customer has been waiting ten minutes for fulfillment.",
      });
    return alerts.map((alert) => ({ ...scope, subject: request.id, ...alert }));
  });
  if (notifications.length)
    await db.operationalAlert.createMany({
      data: notifications,
      skipDuplicates: true,
    });
}

export async function dispatchAlerts(
  scope: StoreScope,
  transport: typeof fetch = fetch,
) {
  const webhook = process.env.OPS_N8N_WEBHOOK;
  if (!webhook) return { delivered: 0, failed: 0, configured: false };
  const signingKey = env().OPS_N8N_SIGNING_KEY;
  const url = new URL(webhook);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new HttpError(503, "invalid_webhook_configuration");
  const batch = await db.$queryRaw<
    {
      id: string;
      kind: OperationalAlertKind;
      subject: string;
      createdAt: Date;
      attempts: number;
    }[]
  >`
    WITH pending AS (
      SELECT id FROM "OperationalAlert" WHERE "organizationId" = ${scope.organizationId}::uuid
        AND "storeId" = ${scope.storeId}::uuid AND "deliveredAt" IS NULL AND "resolvedAt" IS NULL
        AND attempts < 5 AND ("leaseUntil" IS NULL OR "leaseUntil" <= now())
      ORDER BY "createdAt" LIMIT 12 FOR UPDATE SKIP LOCKED
    ) UPDATE "OperationalAlert" AS alert SET "leaseUntil" = now() + interval '2 minutes',
      attempts = alert.attempts + 1 FROM pending WHERE alert.id = pending.id
      RETURNING alert.id, alert.kind, alert.subject, alert."createdAt", alert.attempts`;
  const results = await Promise.all(
    batch.map(async (alert) => {
      let delivered = false;
      try {
        const timestamp = String(Math.floor(Date.now() / 1000));
        const nonce = randomUUID();
        const body = JSON.stringify({ id: alert.id, kind: alert.kind, storeId: scope.storeId, occurredAt: alert.createdAt });
        const response = await transport(url, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(3000),
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": alert.id,
            ...(signingKey ? {
              "X-Inaura-Timestamp": timestamp,
              "X-Inaura-Nonce": nonce,
              "X-Inaura-Signature": signature(signingKey, timestamp, nonce, body),
            } : {}),
            ...(process.env.OPS_N8N_TOKEN
              ? { Authorization: "Bearer " + process.env.OPS_N8N_TOKEN }
              : {}),
          },
          body,
        });
        delivered = response.ok;
      } catch {
        /* The lease expires and allows a later retry. */
      }
      if (delivered)
        await db.operationalAlert.updateMany({
          where: { ...scope, id: alert.id, attempts: alert.attempts },
          data: { deliveredAt: new Date(), leaseUntil: null },
        });
      return delivered;
    }),
  );
  return {
    delivered: results.filter(Boolean).length,
    failed: results.filter((value) => !value).length,
    configured: true,
  };
}
