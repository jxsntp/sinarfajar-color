import { randomUUID } from "node:crypto";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { issue, digest } from "@/lib/credentials";
import { boundedJson, consumeQuota, signature, verifySignedJob } from "@/lib/security";
import { startSession, issueReport, reportScope, resetSession } from "@/domains/sessions/service";
import { customerPrivacy, enforceRetention } from "@/domains/privacy/service";
import { submitCustomerAction } from "@/domains/inquiries/customer";
import { activate, readResult } from "@/domains/recommendations/discovery";
import { operationalSnapshot, readinessResponse } from "@/domains/operations/monitor";
import { POST as activateRoute } from "@/app/api/mobile/recommendations/route";
import { GET as readiness } from "@/app/api/health/ready/route";
import { GET as monitor } from "@/app/api/internal/monitor/route";
import { GET as liveness } from "@/app/api/health/live/route";

afterAll(() => db.$disconnect());
afterEach(() => vi.unstubAllEnvs());

async function fixture() {
  const organization = await db.organization.create({ data: { slug: "release-" + randomUUID(), name: "Release test" } });
  const store = await db.store.create({ data: { organizationId: organization.id, code: "TEST", name: "Test store" } });
  const scope = { organizationId: organization.id, storeId: store.id };
  const key = issue("device");
  const device = await db.device.create({
    data: { ...scope, kind: "KIOSK", label: "Fixture", keyHash: digest(key, "device") },
  });
  const session = await startSession(key);
  const token = issue("report");
  await issueReport(session.credential, { profile: "warm", palette: ["#ffd9aa"], reportCredential: token });
  return { scope, device, key, session, token };
}

it("enforces an atomic quota under concurrent requests and rejects oversized input", async () => {
  const subject = randomUUID();
  const results = await Promise.allSettled(Array.from({ length: 7 }, () => consumeQuota("release-test", subject, 3, 60, 90000)));
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(3);
  for (const result of results)
    if (result.status === "rejected") expect(result.reason).toMatchObject({ status: 429, retryAfter: 30 });
  expect(await consumeQuota("release-test", subject, 3, 60, 120000)).toBeUndefined();
  const body = new Request("https://example.test", { method: "POST", body: JSON.stringify({ marker: "x".repeat(1024) }) });
  await expect(boundedJson(body, 100)).rejects.toMatchObject({ status: 413 });
});

it("authenticates scheduled jobs and admits a signed nonce once", async () => {
  const secret = randomUUID() + randomUUID();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomUUID();
  const body = JSON.stringify({ action: "retention" });
  const mac = signature(secret, timestamp, nonce, body);
  const request = (payload = body, stamp = timestamp) => new Request("https://example.test/api/internal/jobs", {
    method: "POST", body: payload,
    headers: { "X-Inaura-Timestamp": stamp, "X-Inaura-Nonce": nonce, "X-Inaura-Signature": mac },
  });
  await expect(verifySignedJob(request("{}"), secret)).rejects.toMatchObject({ status: 401 });
  await expect(verifySignedJob(request(body, "1000000000"), secret)).rejects.toMatchObject({ status: 401 });
  expect(await verifySignedJob(request(), secret)).toEqual({ action: "retention" });
  await expect(verifySignedJob(request(), secret)).rejects.toMatchObject({ status: 409 });
});

it("separates expired device, preview activation and other organizations from a valid report", async () => {
  const customer = await fixture();
  const other = await fixture();
  await resetSession(customer.session.credential);
  await db.device.update({ where: { id: customer.device.id }, data: { expiresAt: new Date(0) } });
  await expect(startSession(customer.key)).rejects.toMatchObject({ status: 401 });
  expect((await reportScope(customer.token)).id).toBe(customer.session.sessionId);
  const result = await activate(other.token, randomUUID(), {});
  await expect(readResult(customer.token, result.runId)).rejects.toMatchObject({ status: 404 });
  const post = (key: string, headers = {}) => activateRoute(new Request("https://example.test/api/mobile/recommendations", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Idempotency-Key": randomUUID(), ...headers },
    body: JSON.stringify({ preferences: {} }),
  }));
  expect((await post(customer.key)).status).toBe(401);
  expect((await post(customer.token, { "Sec-Purpose": "prefetch" })).status).toBe(403);
  expect((await post(customer.token, { "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
  expect(await db.recommendationRun.count({ where: { sessionId: customer.session.sessionId } })).toBe(0);
});

it("withdraws consent and erases a report without discarding quota or verified financial records", async () => {
  const { session, token, scope } = await fixture();
  await submitCustomerAction(token, { action: "marketing", granted: true });
  await customerPrivacy(token, { action: "withdraw", purpose: "marketing" });
  await customerPrivacy(token, { action: "withdraw", purpose: "local_camera" });
  const latest = await db.consent.findFirst({ where: { sessionId: session.sessionId, purpose: "marketing" }, orderBy: { createdAt: "desc" } });
  expect(latest?.granted).toBe(false);
  const run = await activate(token, randomUUID(), {});
  const charge = await db.inferenceAttempt.create({ data: { organizationId: scope.organizationId, runId: run.runId, reservedUsd: "0.005" } });
  const sale = await db.transaction.create({
    data: { ...scope, sessionId: session.sessionId, externalRef: randomUUID(), total: "123.45", attribution: "rules" },
  });
  expect(await customerPrivacy(token, { action: "erase", confirm: "delete" })).toEqual({ erased: true });
  await expect(reportScope(token)).rejects.toMatchObject({ status: 401 });
  expect(await db.customerSession.findUnique({ where: { id: session.sessionId } })).toBeNull();
  expect(await db.recommendationRun.findUnique({ where: { id: run.runId } })).toBeNull();
  expect(await db.transaction.findUnique({ where: { id: sale.id } })).toMatchObject({ sessionId: null, attribution: "unattributed", total: sale.total });
  const keptCharge = await db.inferenceAttempt.findUniqueOrThrow({ where: { id: charge.id } });
  expect(keptCharge.runId).toBeNull();
  expect(keptCharge.reservedUsd.toString()).toBe("0.005");
  expect(await db.privacyAudit.count({ where: { ...scope, action: "customer_erasure" } })).toBe(1);
});

it("emits aggregate monitoring only to the configured collector", async () => {
  const secret = randomUUID() + randomUUID();
  vi.stubEnv("MONITOR_TOKEN", secret);
  expect(liveness().status).toBe(200);
  expect((await readiness()).status).toBe(200);
  const outage = await readinessResponse(async () => { throw new Error("synthetic database disconnect"); });
  expect(outage.status).toBe(503);
  expect(await outage.json()).toEqual({ status: "unavailable" });
  expect((await readiness()).status).toBe(200);
  const request = (key: string) => new Request("https://example.test/api/internal/monitor", { headers: { Authorization: "Bearer " + key } });
  expect((await monitor(request("unassigned"))).status).toBe(401);
  const response = await monitor(request(secret));
  expect(response.status).toBe(200);
  expect((await response.json()).data).toEqual(expect.objectContaining({ qrGenerated: expect.any(Number), checks: expect.any(Object) }));
  expect(await operationalSnapshot()).not.toHaveProperty("sessionId");
});


it("retention erases expired synthetic sessions and preserves reports still in scope", async () => {
  const expired = await fixture();
  const protectedReport = await fixture();
  const asOf = new Date("1970-03-01T00:00:00Z");
  await db.customerSession.updateMany({
    where: { id: { in: [expired.session.sessionId, protectedReport.session.sessionId] } },
    data: { createdAt: new Date("1970-01-01T00:00:00Z") },
  });
  await db.mobileReportToken.updateMany({
    where: { sessionId: expired.session.sessionId }, data: { expiresAt: new Date("1970-01-02T00:00:00Z") },
  });
  const results = await enforceRetention(asOf);
  expect(results.erased).toBeGreaterThanOrEqual(1);
  expect(await db.customerSession.findUnique({ where: { id: expired.session.sessionId } })).toBeNull();
  expect((await reportScope(protectedReport.token)).id).toBe(protectedReport.session.sessionId);
  expect(await db.privacyAudit.count({ where: { ...expired.scope, action: "retention_erasure" } })).toBe(1);
});
