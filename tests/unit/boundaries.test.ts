import { describe, expect, it } from "vitest";
import { issue, digest } from "@/lib/credentials";
import { allow, navigation, type Role } from "@/domains/authentication/access";
import { checkProducer, eventInput } from "@/domains/analytics/events";

describe("credential domains", () => {
  it("generates independent 256-bit secrets and stable one-way digests", () => {
    const value = issue("report");
    expect(value).toMatch(/^report_[\w-]{43}$/);
    expect(issue("report")).not.toBe(value);
    expect(digest(value, "report")).toMatch(/^[a-f0-9]{64}$/);
    expect(digest(value, "report")).toBe(digest(value, "report"));
    for (const bad of [
      issue("kiosk"),
      issue("device"),
      "report_short",
      value + "/",
    ])
      expect(() => digest(bad, "report")).toThrow();
  });
});
it.each([
  ["PLATFORM_ADMIN", ["staff", "dashboard", "admin", "lab"]],
  ["ORG_ADMIN", ["staff", "dashboard", "admin", "lab"]],
  ["STORE_MANAGER", ["staff", "dashboard"]],
  ["SALES_ASSOCIATE", ["staff"]],
  ["MARKETING_ANALYST", ["dashboard"]],
] as const)(
  "enforces %s at the same boundary used for navigation",
  (role: Role, expected) => {
    expect(navigation(role)).toEqual(expected);
    const scope = { role, organizationId: "a", storeId: null, userId: "b" };
    for (const area of ["staff", "dashboard", "admin", "lab"] as const) {
      const permits = navigation(role).includes(area);
      if (permits) expect(() => allow(scope, area)).not.toThrow();
      else expect(() => allow(scope, area)).toThrow("permission_denied");
    }
  },
);
it("rejects client-generated commercial outcomes, private payloads and channel spoofing", () => {
  expect(() => checkProducer("KIOSK", "purchase_completed")).toThrow();
  expect(() => checkProducer("MOBILE", "qr_displayed")).toThrow();
  expect(
    eventInput.safeParse({
      id: crypto.randomUUID(),
      name: "mobile_report_opened",
      occurredAt: new Date().toISOString(),
      token: "sensitive",
    }).success,
  ).toBe(false);
});
