import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { issue } from "@/lib/credentials";
import { identity } from "../support/identity";
import type { StaffScope } from "@/domains/authentication/access";
import { registerDevice } from "@/domains/devices/service";
import { startSession, issueReport } from "@/domains/sessions/service";
import { activate } from "@/domains/recommendations/discovery";
import { submitCustomerAction } from "@/domains/inquiries/customer";
import {
  requestOperation,
  confirmCustomerTryOn,
} from "@/domains/operations/workflow";
import { customerRequests } from "@/domains/inquiries/queue";
import { operationStore } from "@/domains/operations/store";
import { refreshWaitAlerts, dispatchAlerts } from "@/domains/operations/alerts";
import {
  mockPOSAdapter,
  posCommand,
  runPOS,
} from "@/domains/transactions/adapter";
import { importTransactions } from "@/domains/transactions/import";
import { operationalReport } from "@/domains/operations/report";
import { ingest } from "@/domains/analytics/ingest";

let staff: StaffScope, colleague: StaffScope, foreign: StaffScope;
let store: { organizationId: string; storeId: string };
let otherStore: { organizationId: string; storeId: string };
let kiosk: string;
const sku = "OPERATIONS-SKU",
  barcode = "8712345678910",
  otherSku = "ADD-ON";

beforeAll(async () => {
  const org = await db.organization.create({
    data: { name: "Operations test", slug: "ops-" + randomUUID() },
  });
  const orgId = org.id;
  const first = await db.store.create({
    data: { organizationId: orgId, name: "Store A", code: "STORE-A" },
  });
  const second = await db.store.create({
    data: { organizationId: orgId, name: "Store B", code: "STORE-B" },
  });
  store = { organizationId: orgId, storeId: first.id };
  otherStore = { organizationId: orgId, storeId: second.id };
  const members = [
    await identity(db, orgId),
    await identity(db, orgId),
    await identity(db, orgId),
  ];
  [staff, colleague, foreign] = members.map(({ userId }, index) => ({
    userId,
    organizationId: orgId,
    storeId: index === 2 ? second.id : first.id,
    role: "SALES_ASSOCIATE" as const,
  }));
  for (const member of [staff, colleague, foreign])
    await db.membership.update({
      where: {
        userId_organizationId: { organizationId: orgId, userId: member.userId },
      },
      data: { role: "SALES_ASSOCIATE", storeId: member.storeId },
    });
  kiosk = (
    await registerDevice(
      { ...staff, role: "ORG_ADMIN", storeId: null },
      first.id,
      "Operations kiosk",
      "KIOSK",
    )
  ).credential;
  const brand = await db.brand.create({
    data: { organizationId: orgId, name: "Operations brand" },
  });
  for (const [productSku, category] of [
    [sku, "necklace"],
    [otherSku, "ring"],
  ]) {
    const product = await db.product.create({
      data: {
        organizationId: orgId,
        brandId: brand.id,
        sku: productSku,
        barcode: productSku === sku ? barcode : null,
        name: productSku,
        category,
        goldColor: "yellow",
        purity: "18K",
      },
    });
    await db.inventory.create({
      data: {
        ...store,
        productId: product.id,
        displayLocation: "Cabinet A",
        onHand: 4,
        price: "100.25",
      },
    });
  }
});
afterAll(() => db.$disconnect());
afterEach(() => vi.unstubAllEnvs());
async function journey() {
  const session = await startSession(kiosk);
  const token = issue("report");
  await issueReport(session.credential, {
    profile: "warm",
    palette: ["#F1D0AA"],
    reportCredential: token,
  });
  const selection = await activate(token, randomUUID(), {
    category: "necklace",
  });
  return { sessionId: session.sessionId, token, runId: selection.runId };
}
async function transition(
  staffer: StaffScope,
  id: string,
  kind: "inquiry" | "tryon",
  state: "ACKNOWLEDGED" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED",
) {
  return requestOperation(staffer, { action: "transition", id, kind, state });
}

it("routes phone requests to the originating store and allows only one concurrent claimant", async () => {
  const { token, sessionId, runId } = await journey();
  await submitCustomerAction(token, {
    action: "inquiry",
    sku,
    runId,
    mode: "in_store",
  });
  const request = await db.productInquiry.findFirstOrThrow({
    where: { sessionId },
  });
  await db.productInquiry.update({
    where: { id: request.id },
    data: { createdAt: new Date(Date.now() - 11 * 60000) },
  });
  await refreshWaitAlerts(store);
  const queue = await customerRequests(store, staff.userId);
  expect(
    queue.requests.find((row) => row.id === request.id)?.product.location,
  ).toBe("Cabinet A");
  expect(queue.alerts.map((alert) => alert.kind)).toEqual(
    expect.arrayContaining(["NEW_REQUEST", "UNACKNOWLEDGED", "EXCESSIVE_WAIT"]),
  );
  expect((await customerRequests(otherStore, foreign.userId)).requests).toEqual(
    [],
  );
  await expect(operationStore(staff, otherStore.storeId)).rejects.toMatchObject(
    { status: 404 },
  );
  await expect(
    transition(foreign, request.id, "inquiry", "ACKNOWLEDGED"),
  ).rejects.toMatchObject({ status: 404 });
  const results = await Promise.allSettled([
    transition(staff, request.id, "inquiry", "ACKNOWLEDGED"),
    transition(colleague, request.id, "inquiry", "ACKNOWLEDGED"),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual([
    "fulfilled",
    "rejected",
  ]);
  const owner = results[0].status === "fulfilled" ? staff : colleague;
  const other = owner === staff ? colleague : staff;
  await expect(
    transition(other, request.id, "inquiry", "PREPARING"),
  ).rejects.toMatchObject({ status: 409 });
  for (const state of ["PREPARING", "READY", "COMPLETED"] as const)
    await transition(owner, request.id, "inquiry", state);
  expect(
    await db.interactionEvent.count({
      where: { sessionId, name: "request_acknowledged" },
    }),
  ).toBe(1);
  expect(
    (await operationalReport(store)).metrics.acknowledgedSeconds,
  ).toBeGreaterThan(600);
});

it("matches product barcode or QR and distinguishes staff activity from customer confirmation", async () => {
  const { token, sessionId, runId } = await journey();
  await submitCustomerAction(token, {
    action: "tryon",
    sku,
    runId,
    mode: "in_store",
  });
  const row = await db.tryOn.findFirstOrThrow({ where: { sessionId } });
  await expect(confirmCustomerTryOn(token, row.id)).rejects.toMatchObject({
    status: 404,
  });
  await transition(staff, row.id, "tryon", "ACKNOWLEDGED");
  await transition(staff, row.id, "tryon", "READY");
  await expect(
    transition(staff, row.id, "tryon", "COMPLETED"),
  ).rejects.toMatchObject({ status: 400 });
  const command = {
    action: "scan" as const,
    sessionId,
    requestId: row.id,
    code: barcode,
  };
  await expect(requestOperation(colleague, command)).rejects.toMatchObject({
    status: 409,
  });
  await Promise.all([
    requestOperation(staff, command),
    requestOperation(staff, command),
  ]);
  await expect(
    confirmCustomerTryOn((await journey()).token, row.id),
  ).rejects.toMatchObject({ status: 404 });
  await Promise.all([
    confirmCustomerTryOn(token, row.id),
    confirmCustomerTryOn(token, row.id),
  ]);
  await requestOperation(staff, {
    action: "scan",
    sessionId,
    code: "sinar-fajar:sku:" + otherSku,
  });
  await expect(
    requestOperation(staff, { action: "scan", sessionId, code: "MISSING-SKU" }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    await db.tryOn.findFirst({ where: { sessionId, source: "staff" } }),
  ).toBeTruthy();
  expect(
    await db.interactionEvent.count({
      where: { sessionId, name: "tryon_customer_confirmed" },
    }),
  ).toBe(1);
  expect(
    await db.operationalAlert.count({
      where: { ...store, kind: "INVENTORY_DISCREPANCY" },
    }),
  ).toBe(1);
});

it("links one idempotent sale, tracks exact adjustments and reconciles CSV references", async () => {
  const { token, sessionId, runId } = await journey();
  await ingest(token, {
    event: {
      id: randomUUID(),
      name: "recommendation_impression",
      runId,
      sku,
      rank: 1,
      occurredAt: new Date(),
    },
  });
  const checkout = await submitCustomerAction(token, { action: "checkout" });
  if (!("code" in checkout) || !checkout.code)
    throw new Error("Missing cashier code");
  const externalRef = "RECEIPT-" + randomUUID();
  const soldAt = new Date().toISOString();
  const sale = posCommand.parse({
    type: "sale",
    soldAt,
    externalRef,
    currency: "IDR",
    total: "125.30",
    checkoutCode: checkout.code,
    lines: [
      { sku, quantity: 1, unitPrice: "100.25" },
      { sku: otherSku, quantity: 1, unitPrice: "25.05" },
    ],
  });
  const results = await Promise.all([
    runPOS(mockPOSAdapter, store, sale),
    runPOS(mockPOSAdapter, store, sale),
  ]);
  expect(
    results.map((result) => "duplicate" in result && result.duplicate).sort(),
  ).toEqual([false, true]);
  const row = await db.transaction.findFirstOrThrow({
    where: { ...store, externalRef },
    include: { items: { include: { product: true } } },
  });
  expect(row).toMatchObject({
    sessionId,
    attribution: "rules_assisted",
    duplicateCount: 1,
  });
  expect(row.items.find((item) => item.product.sku === sku)?.recommended).toBe(
    true,
  );
  expect(
    row.items.find((item) => item.product.sku === otherSku)?.recommended,
  ).toBe(false);
  expect(
    await db.interactionEvent.count({
      where: { sessionId, name: "purchase_completed" },
    }),
  ).toBe(1);
  await expect(
    runPOS(
      mockPOSAdapter,
      otherStore,
      posCommand.parse({
        type: "link",
        externalRef,
        checkoutCode: checkout.code,
      }),
    ),
  ).rejects.toMatchObject({ status: 404 });
  const refund = posCommand.parse({
    type: "refund",
    externalRef,
    adjustmentRef: "REF-1",
    occurredAt: new Date().toISOString(),
    amount: "20.10",
  });
  await runPOS(mockPOSAdapter, store, refund);
  expect(await runPOS(mockPOSAdapter, store, refund)).toMatchObject({
    duplicate: true,
  });
  await runPOS(
    mockPOSAdapter,
    store,
    posCommand.parse({
      type: "cancel",
      externalRef,
      adjustmentRef: "CANCEL-1",
      occurredAt: new Date().toISOString(),
    }),
  );
  const csvRef = "CSV-" + randomUUID();
  const csv =
    "type,externalRef,occurredAt,currency,total,sku,quantity,unitPrice\nsale," +
    csvRef +
    "," +
    soldAt +
    ",IDR,100.25," +
    sku +
    ",1,100.25";
  expect((await importTransactions(store, csv, false))[0].outcome).toBe(
    "parsed",
  );
  expect((await importTransactions(store, csv, true))[0].outcome).toBe(
    "recorded",
  );
  expect((await importTransactions(store, csv, true))[0].outcome).toBe(
    "duplicate",
  );
  const report = await operationalReport(store, [csvRef, "MISSING-REFERENCE"]);
  expect(report.missing).toEqual(["MISSING-REFERENCE"]);
  expect(
    report.transactions.find((item) => item.externalRef === externalRef),
  ).toMatchObject({ status: "cancelled", net: "0.00" });
  expect(
    report.transactions.find((item) => item.externalRef === csvRef),
  ).toMatchObject({ attribution: "unattributed" });
  expect(() =>
    posCommand.parse({ type: "link", externalRef, checkoutCode: token }),
  ).toThrow();
});

it("applies ordered inventory snapshots and keeps alerts retryable when n8n fails", async () => {
  const observedAt = new Date().toISOString();
  const snapshot = posCommand.parse({
    type: "inventory",
    observedAt,
    items: [{ sku, onHand: 8 }],
  });
  expect(await runPOS(mockPOSAdapter, store, snapshot)).toEqual({ updated: 1 });
  expect(await runPOS(mockPOSAdapter, store, snapshot)).toEqual({ updated: 0 });
  const older = posCommand.parse({
    type: "inventory",
    observedAt: new Date(Date.parse(observedAt) - 1000).toISOString(),
    items: [{ sku, onHand: 1 }],
  });
  expect(await runPOS(mockPOSAdapter, store, older)).toEqual({ updated: 0 });
  vi.stubEnv(
    "OPS_N8N_WEBHOOK",
    "https://automation.example.test/webhook/operations",
  );
  const transport = vi.fn(async () => new Response(null, { status: 503 }));
  const delivery = await dispatchAlerts(store, transport);
  expect(delivery.failed).toBeGreaterThan(0);
  expect(
    await db.operationalAlert.count({
      where: {
        ...store,
        kind: "INVENTORY_DISCREPANCY",
        deliveredAt: null,
        attempts: { gt: 0 },
      },
    }),
  ).toBe(1);
  expect((await dispatchAlerts(store, transport)).failed).toBe(0);
});

it("distinguishes an AI-assisted sale and keeps a verified receipt when its code cannot be matched", async () => {
  const { token, sessionId, runId } = await journey();
  await db.recommendationRun.update({ where: { id: runId }, data: { strategy: "openrouter" } });
  await ingest(token, { event: { id: randomUUID(), name: "recommendation_impression", runId, sku, rank: 1, occurredAt: new Date() } });
  const checkout = await submitCustomerAction(token, { action: "checkout" });
  if (!("code" in checkout) || !checkout.code) throw new Error("Missing cashier code");
  const externalRef = "AI-RECEIPT-" + randomUUID();
  const sale = posCommand.parse({ type: "sale", soldAt: new Date().toISOString(), externalRef, currency: "IDR", total: "100.25", checkoutCode: issue("checkout"),
    lines: [{ sku, quantity: 1, unitPrice: "100.25" }] });
  expect(await runPOS(mockPOSAdapter, store, sale)).toMatchObject({ attribution: "unattributed" });
  expect(await runPOS(mockPOSAdapter, store, posCommand.parse({ type: "link", externalRef, checkoutCode: checkout.code }))).toEqual({ attribution: "ai_assisted" });
  expect(await db.transaction.count({ where: { ...store, externalRef, sessionId } })).toBe(1);
});
