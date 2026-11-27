import { z } from "zod";

const settings = z
  .object({
    APP_ENV: z
      .enum(["development", "uat", "production"])
      .default("development"),
    DATABASE_URL: z.url().regex(/^postgres(ql)?:/),
    DIRECT_URL: z.url().regex(/^postgres(ql)?:/),
    SUPABASE_URL: z.url(),
    SUPABASE_PUBLISHABLE_KEY: z.string().min(12),
    SUPABASE_STORAGE_KEY: z.string().min(12).optional(),
    LOCAL_STORAGE_SERVICE_KEY: z.string().optional(),
    CLIENT_SLUG: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .default("sinar-fajar"),
    REPORT_ORIGIN: z.url().optional(),
    APP_ORIGIN: z.url().optional(),
    SECURITY_KEY: z.string().min(32).optional(),
    INBOUND_JOB_SECRET: z.string().min(32).optional(),
    MONITOR_DAILY_USD: z.coerce.number().positive().default(2),
    OPS_N8N_SIGNING_KEY: z.string().min(32).optional(),
    MONITOR_TOKEN: z.string().min(32).optional(),
    DEVICE_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(180),
    PRIVACY_AUDIT_RETENTION_DAYS: z.coerce.number().int().min(7).max(730).default(90),
    CUSTOMER_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    INVENTORY_MAX_AGE_MINUTES: z.union([z.literal("off"), z.coerce.number().int().min(5).max(10080)], {
      error: "Use an integer from 5 to 10080 or off.",
    }).optional(),
    PUBLIC_SOCIAL_URL: z
      .url()
      .regex(/^https:\/\//)
      .optional(),
    REPORT_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    KIOSK_SESSION_MINUTES: z.coerce.number().int().min(1).max(120).default(15),
    ENABLE_MOBILE_REPORTS: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
  });

const loopback = ["localhost", "127.0.0.1", "[::1]"];
const runtimeSecrets = ["SECURITY_KEY", "INBOUND_JOB_SECRET", "MONITOR_TOKEN"] as const;
type EnvironmentInput = Record<string, string | undefined>;

export function isVercelHostedTarget(input: EnvironmentInput) {
  return input.VERCEL_ENV === "production" || input.VERCEL_ENV === "preview" ||
    (input.VERCEL === "1" && input.VERCEL_ENV !== "development");
}

export function parseEnvironment(input: EnvironmentInput) {
  const result = settings.safeParse(input);
  const issues = result.success ? [] : [...result.error.issues];
  const issue = (key: keyof typeof settings.shape, message: string) => {
    if (!issues.some(({ path }) => path[0] === key)) {
      issues.push({ code: "custom", path: [key], message });
    }
  };

  const hosted = input.APP_ENV === "uat" || input.APP_ENV === "production";
  const vercelHosted = isVercelHostedTarget(input);
  if (input.VERCEL_ENV === "preview" && input.APP_ENV !== "uat") {
    issue("APP_ENV", "Vercel Preview requires APP_ENV=uat.");
  } else if (vercelHosted && !hosted) {
    issue("APP_ENV", "Set APP_ENV to uat or production for this hosted deployment.");
  }

  if (hosted || vercelHosted) {
    const keys = runtimeSecrets.map((name) => {
      const value = input[name];
      if (!value) issue(name, "Set an independent secret of at least 32 characters.");
      return value;
    });
    if (keys.every(Boolean) && new Set(keys).size !== keys.length) {
      issue("SECURITY_KEY", "SECURITY_KEY, INBOUND_JOB_SECRET, and MONITOR_TOKEN must all differ.");
    }
    for (const name of ["APP_ORIGIN", "REPORT_ORIGIN"] as const) {
      const raw = input[name];
      const url = raw && URL.canParse(raw) ? new URL(raw) : null;
      if (!url || url.protocol !== "https:" || url.origin !== raw || loopback.includes(url.hostname)) {
        issue(name, "Set the exact application HTTPS origin without a trailing slash or path.");
      }
    }
    if (input.APP_ORIGIN && input.REPORT_ORIGIN && input.APP_ORIGIN !== input.REPORT_ORIGIN) {
      issue("REPORT_ORIGIN", "Set REPORT_ORIGIN to the same value as APP_ORIGIN.");
    }
    if (input.LOCAL_STORAGE_SERVICE_KEY || input.SUPABASE_PUBLISHABLE_KEY?.startsWith("local-")) {
      issue("SUPABASE_PUBLISHABLE_KEY", "Local fixture credentials are development-only.");
    }
    for (const name of ["DATABASE_URL", "DIRECT_URL"] as const) {
      const raw = input[name];
      if (!raw || !URL.canParse(raw)) continue;
      const url = new URL(raw);
      if (/(?:\[|%5b)(?:ENCODED_PASSWORD|YOUR-DATABASE-PASSWORD)(?:\]|%5d)/i.test(url.password)) {
        issue(name, "Replace the placeholder with the actual database password.");
      } else if (loopback.includes(url.hostname) ||
          !["require", "verify-ca", "verify-full"].includes(url.searchParams.get("sslmode") ?? "")) {
        issue(name, "Use a hosted database URL with sslmode=require or stronger.");
      }
    }
    if (input.OPS_N8N_WEBHOOK &&
        (!input.OPS_N8N_SIGNING_KEY || keys.includes(input.OPS_N8N_SIGNING_KEY))) {
      issue("OPS_N8N_SIGNING_KEY", "Configure an independent signing key for n8n.");
    }
    if (input.INVENTORY_MAX_AGE_MINUTES === undefined) {
      issue("INVENTORY_MAX_AGE_MINUTES", "Set the inventory age in minutes or set it to off.");
    }
    const auth = input.SUPABASE_URL;
    if (auth && URL.canParse(auth)) {
      const url = new URL(auth);
      if (url.protocol !== "https:" || loopback.includes(url.hostname)) {
        issue("SUPABASE_URL", "Hosted authentication requires a hosted HTTPS URL.");
      }
    }
  }

  if (result.success && result.data.CUSTOMER_RETENTION_DAYS < result.data.REPORT_TTL_DAYS) {
    issue("CUSTOMER_RETENTION_DAYS", "Retention must cover report validity.");
  }
  if (!result.success || issues.length) throw new z.ZodError(issues);
  return result.data;
}

export const env = () => parseEnvironment(process.env);

export function reportOrigin() {
  const config = env();
  const url = new URL(config.REPORT_ORIGIN ?? "http://localhost:3000");
  const devLocal =
    config.APP_ENV === "development" &&
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
    url.protocol === "http:";
  if (
    (!devLocal && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("REPORT_ORIGIN must be a trusted HTTPS origin");
  }
  return url.origin;
}
