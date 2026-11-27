import { afterEach, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { parseEnvironment } from "@/lib/env";
import { verifiedInventory } from "@/domains/inventory/freshness";

const origin = "https://kiosk.example.test";
const hosted = {
  VERCEL_ENV: "production",
  APP_ENV: "production",
  APP_ORIGIN: origin,
  REPORT_ORIGIN: origin,
  DATABASE_URL: "postgresql://fixture:test@db.example.test:6543/postgres?sslmode=require",
  DIRECT_URL: "postgresql://fixture:test@db.example.test:5432/postgres?sslmode=require",
  SUPABASE_URL: "https://auth.example.test",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
  SECURITY_KEY: "A".repeat(32),
  INBOUND_JOB_SECRET: "B".repeat(32),
  MONITOR_TOKEN: "C".repeat(32),
  INVENTORY_MAX_AGE_MINUTES: "off",
};

function issueNames(input: Parameters<typeof parseEnvironment>[0]) {
  try {
    parseEnvironment(input);
    return [];
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    return error.issues.map(({ path }) => path.join(".")).sort();
  }
}

afterEach(() => vi.unstubAllEnvs());

it("reports every missing hosted variable together", () => {
  expect(issueNames({ VERCEL_ENV: "production" })).toEqual(
    Object.keys(hosted).filter((name) => name !== "VERCEL_ENV").sort(),
  );
});

it("checks independent secrets, matching origins and database credentials together", () => {
  expect(issueNames({
    ...hosted,
    MONITOR_TOKEN: hosted.SECURITY_KEY,
    REPORT_ORIGIN: origin + "/kiosk",
    DATABASE_URL: hosted.DATABASE_URL.replace(":test@", ":%5BENCODED_PASSWORD%5D@"),
  })).toEqual(["DATABASE_URL", "REPORT_ORIGIN", "SECURITY_KEY"]);
});

it("rejects production configuration on Preview and accepts UAT", () => {
  expect(issueNames({ ...hosted, VERCEL_ENV: "preview" })).toEqual(["APP_ENV"]);
  expect(parseEnvironment({ ...hosted, VERCEL_ENV: "preview", APP_ENV: "uat" }).APP_ENV).toBe("uat");
});

it("uses no age cutoff when explicitly turned off and preserves numeric cutoffs", () => {
  for (const [name, value] of Object.entries(hosted)) vi.stubEnv(name, value);
  expect(parseEnvironment(hosted).INVENTORY_MAX_AGE_MINUTES).toBe("off");
  expect(verifiedInventory()).toEqual({});
  vi.stubEnv("INVENTORY_MAX_AGE_MINUTES", "5");
  const now = Date.parse("2026-11-27T12:00:00Z");
  const range = { gte: new Date(now - 5 * 60_000), lte: new Date(now) };
  expect(verifiedInventory(now)).toEqual({ OR: [{ posSyncedAt: range }, { verifiedAt: range }] });
});
