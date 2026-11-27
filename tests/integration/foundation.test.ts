import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it } from "vitest";
import { db } from "@/lib/db";
import { staffScope } from "@/domains/authentication/staff";
import type { StaffScope } from "@/domains/authentication/access";
import { registerDevice, revokeDevice } from "@/domains/devices/service";
import {
  startSession,
  issueReport,
  reportScope,
  resetSession,
  revokeReport,
} from "@/domains/sessions/service";
import { ingest } from "@/domains/analytics/ingest";
import { identity } from "../support/identity";

let admin: StaffScope;
let storeId: string;
let foreign: string;
let credentials: Awaited<ReturnType<typeof identity>>;
let slug: string;
beforeAll(async () => {
  slug = "qa-" + randomUUID();
  const org = await db.organization.create({
    data: {
      slug,
      name: "Test tenant",
      storeRecords: { create: { code: "ONE", name: "Test store" } },
    },
    include: { storeRecords: true },
  });
  foreign = (
    await db.organization.create({
      data: { slug: "qa-" + randomUUID(), name: "Second tenant" },
    })
  ).id;
  storeId = org.storeRecords[0].id;
  credentials = await identity(db, org.id);
  admin = await staffScope(credentials.accessToken, slug);
});
afterAll(() => db.$disconnect());
async function journey() {
  const device = await registerDevice(admin, storeId, "Test kiosk", "KIOSK");
  const session = await startSession(device.credential);
  const { reportPath } = await issueReport(session.credential, {
    profile: "uncertain",
    palette: ["#ddccb0"],
  });
  return { device, session, report: reportPath.split("/").pop()! };
}
it("resolves a real Supabase identity and rejects foreign membership or invalid JWT", async () => {
  expect(admin.role).toBe("ORG_ADMIN");
  expect(admin.userId).toBe(credentials.userId);
  await expect(
    staffScope(credentials.accessToken, "sinar-fajar"),
  ).rejects.toMatchObject({ status: 403 });
  await expect(staffScope("invalid", slug)).rejects.toMatchObject({
    status: 401,
  });
});
it("enforces tenant foreign keys, RLS and API-role grants", async () => {
  await expect(
    db.inventory.create({
      data: {
        organizationId: foreign,
        storeId,
        productId: (await db.product.findFirstOrThrow()).id,
        onHand: 1,
        price: "1.05",
      },
    }),
  ).rejects.toMatchObject({ code: "P2003" });
  const policies = await db.$queryRaw<
    { secured: boolean }[]
  >`SELECT bool_and(relrowsecurity) AS secured FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'`;
  expect(policies[0].secured).toBe(true);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL ROLE authenticated`;
    await tx.$queryRaw`SELECT set_config('request.jwt.claim.sub', ${admin.userId}, true)`;
    expect(await tx.membership.count()).toBe(1);
    expect(await tx.userProfile.findMany({ select: { id: true } })).toEqual([
      { id: admin.userId },
    ]);
    const [grants] = await tx.$queryRaw<
      { readable: boolean; writable: boolean }[]
    >`SELECT has_table_privilege('anon','"MobileReportToken"','SELECT') AS readable, has_table_privilege('authenticated','"Membership"','UPDATE') AS writable`;
    expect(grants).toEqual({ readable: false, writable: false });
  });
  await expect(
    registerDevice(
      { ...admin, organizationId: foreign },
      storeId,
      "foreign",
      "KIOSK",
    ),
  ).rejects.toMatchObject({ status: 404 });
});
it("keeps the scoped report valid through reset and device revocation", async () => {
  const { device, session, report } = await journey();
  await expect(reportScope(session.credential)).rejects.toMatchObject({
    status: 401,
  });
  expect((await reportScope(report)).id).toBe(session.sessionId);
  await resetSession(session.credential);
  await expect(resetSession(session.credential)).rejects.toMatchObject({
    status: 401,
  });
  await revokeDevice(admin, device.deviceId);
  await expect(startSession(device.credential)).rejects.toMatchObject({
    status: 401,
  });
  expect((await reportScope(report)).id).toBe(session.sessionId);
  const row = await db.mobileReportToken.findFirstOrThrow({
    where: { sessionId: session.sessionId },
  });
  expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  await expect(
    revokeReport({ ...admin, organizationId: foreign }, session.sessionId),
  ).rejects.toMatchObject({ status: 404 });
  await revokeReport(admin, session.sessionId);
  await expect(reportScope(report)).rejects.toMatchObject({ status: 401 });
});
it("expires report and kiosk credentials independently", async () => {
  const { session, report } = await journey();
  await db.customerSession.update({
    where: { id: session.sessionId },
    data: { expiresAt: new Date(0) },
  });
  await expect(resetSession(session.credential)).rejects.toMatchObject({
    status: 401,
  });
  expect((await reportScope(report)).id).toBe(session.sessionId);
  await db.mobileReportToken.updateMany({
    where: { sessionId: session.sessionId },
    data: { expiresAt: new Date(0) },
  });
  await expect(reportScope(report)).rejects.toMatchObject({ status: 401 });
});
it("deduplicates concurrent delivery and accepts POS events only in the originating store", async () => {
  const { session, report } = await journey();
  const input = {
    sessionId: session.sessionId,
    event: {
      id: randomUUID(),
      name: "mobile_report_opened" as const,
      occurredAt: new Date(),
    },
  };
  const results = await Promise.all([
    ingest(report, input),
    ingest(report, input),
    ingest(report, { ...input, event: { ...input.event, id: randomUUID() } }),
  ]);
  expect(results.filter((x) => x.recorded)).toHaveLength(1);
  await expect(
    ingest(report, { ...input, sessionId: randomUUID() }),
  ).rejects.toMatchObject({ status: 403 });
  const pos = await registerDevice(admin, storeId, "POS", "POS");
  const event = {
    id: randomUUID(),
    name: "pos_session_link_checked" as const,
    occurredAt: new Date(),
  };
  await ingest(pos.credential, { sessionId: session.sessionId, event });
  const otherStore = await db.store.create({
    data: {
      organizationId: admin.organizationId,
      code: randomUUID(),
      name: "Other",
    },
  });
  const otherDevice = await registerDevice(
    admin,
    otherStore.id,
    "Other POS",
    "POS",
  );
  await expect(
    ingest(otherDevice.credential, { sessionId: session.sessionId, event }),
  ).rejects.toMatchObject({ status: 404 });
});
it("serializes kiosk restarts and enforces device revocation on active sessions", async () => {
  const device = await registerDevice(admin, storeId, "Kiosk", "KIOSK");
  const starts = await Promise.all([
    startSession(device.credential),
    startSession(device.credential),
  ]);
  expect(
    await db.customerSession.count({
      where: { deviceId: device.deviceId, endedAt: null },
    }),
  ).toBe(1);
  await revokeDevice(admin, device.deviceId);
  for (const start of starts)
    await expect(resetSession(start.credential)).rejects.toMatchObject({
      status: 401,
    });
});
