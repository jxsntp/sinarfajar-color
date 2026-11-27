import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { db } from "@/lib/db";
import { issue, digest } from "@/lib/credentials";
import {
  issueReport,
  startSession,
  resetSession,
  reportScope,
} from "@/domains/sessions/service";
import { identity } from "../support/identity";
import { registerDevice } from "@/domains/devices/service";
import {
  resolveCheckout,
  submitCustomerAction,
} from "@/domains/inquiries/customer";
import { activate } from "@/domains/recommendations/discovery";
import { ingest } from "@/domains/analytics/ingest";

afterAll(() => db.$disconnect());

it("recovers a lost report response, keeps the report through reset and separates checkout credentials", async () => {
  const org = await db.organization.create({
    data: { slug: "experience-" + randomUUID(), name: "Experience test" },
  });
  const person = await identity(db, org.id);
  const staff = {
    userId: person.userId,
    organizationId: org.id,
    role: "ORG_ADMIN" as const,
    storeId: null,
  };
  const store = await db.store.create({
    data: { organizationId: org.id, name: "Test store", code: "ONE" },
  });
  const other = await db.store.create({
    data: { organizationId: org.id, name: "Other store", code: "TWO" },
  });
  const kiosk = await registerDevice(staff, store.id, "Kiosk", "KIOSK");
  const session = await startSession(kiosk.credential);
  expect(["palette-first", "metals-first"]).toContain(session.variant);
  const token = issue("report");
  const input = {
    profile: "uncertain" as const,
    palette: ["#F1D0AA"],
    reportCredential: token,
  };
  const handoff = await issueReport(session.credential, input);
  expect(await issueReport(session.credential, input)).toEqual(handoff);
  expect(
    (
      await db.mobileReportToken.findFirstOrThrow({
        where: { sessionId: session.sessionId },
      })
    ).tokenHash,
  ).toBe(digest(token, "report"));
  await resetSession(session.credential);
  expect((await reportScope(token)).id).toBe(session.sessionId);
  expect(
    await db.recommendationRun.count({
      where: { sessionId: session.sessionId },
    }),
  ).toBe(0);
  const checkout = await submitCustomerAction(token, { action: "checkout" });
  if (!("code" in checkout) || !checkout.code)
    throw new Error("Missing checkout code");
  const pos = await registerDevice(staff, store.id, "Cashier", "POS");
  const otherPos = await registerDevice(
    staff,
    other.id,
    "Other cashier",
    "POS",
  );
  expect(await resolveCheckout(pos.credential, checkout.code)).toEqual({
    sessionId: session.sessionId,
  });
  await expect(
    resolveCheckout(otherPos.credential, checkout.code),
  ).rejects.toMatchObject({ status: 404 });
  await expect(reportScope(checkout.code)).rejects.toMatchObject({
    status: 401,
  });
  await db.mobileReportToken.updateMany({
    where: { sessionId: session.sessionId },
    data: { expiresAt: new Date(0) },
  });
  await expect(reportScope(token)).rejects.toMatchObject({ status: 401 });
});

it("scopes later contact and try-on, and counts only one click per recommendation", async () => {
  const organization = await db.organization.findUniqueOrThrow({
    where: { slug: "sinar-fajar" },
  });
  const store = await db.store.findFirstOrThrow({
    where: { organizationId: organization.id, code: "PURI" },
  });
  const person = await identity(db, organization.id);
  const kiosk = await registerDevice(
    {
      userId: person.userId,
      organizationId: organization.id,
      role: "ORG_ADMIN",
      storeId: null,
    },
    store.id,
    "Kiosk",
    "KIOSK",
  );
  const session = await startSession(kiosk.credential);
  const token = issue("report");
  await issueReport(session.credential, {
    profile: "warm",
    palette: ["#F1D0AA"],
    reportCredential: token,
  });
  const selection = await activate(token, randomUUID(), {
    category: "necklace",
    colorPreference: "skip",
  });
  const item = selection.items[0];
  const reference = { sku: item.sku, runId: selection.runId, rank: item.rank };
  await Promise.all(
    [1, 2].map(() =>
      ingest(token, {
        event: {
          ...reference,
          id: randomUUID(),
          name: "recommended_product_clicked",
          occurredAt: new Date(),
        },
      }),
    ),
  );
  expect(
    await db.interactionEvent.count({
      where: {
        sessionId: session.sessionId,
        name: "recommended_product_clicked",
      },
    }),
  ).toBe(1);
  await submitCustomerAction(token, {
    action: "tryon",
    ...reference,
    mode: "in_store",
  });
  await submitCustomerAction(token, {
    action: "inquiry",
    ...reference,
    mode: "later",
    email: "followup@example.test",
  });
  expect(
    await db.tryOn.count({ where: { sessionId: session.sessionId } }),
  ).toBe(1);
  expect(
    await db.productInquiry.findFirst({
      where: { sessionId: session.sessionId },
    }),
  ).toMatchObject({
    channel: "later",
    status: "contact_later",
    contactEmail: "followup@example.test",
  });
});
