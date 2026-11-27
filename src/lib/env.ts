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
    INVENTORY_MAX_AGE_MINUTES: z.coerce.number().int().min(5).max(10080).optional(),
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
  })
  .superRefine((value, ctx) => {
    const hosted = value.APP_ENV !== "development";
    const issue = (key: string, message: string) => ctx.addIssue({ code: "custom", path: [key], message });
    if (process.env.VERCEL_ENV === "production" && !hosted) issue("APP_ENV", "Hosted instance must declare UAT or production");
    if (process.env.VERCEL_ENV === "preview" && value.APP_ENV !== "uat") issue("APP_ENV", "Preview instance must use UAT configuration");
    if (hosted) {
      if (!value.SECURITY_KEY || !value.INBOUND_JOB_SECRET || !value.MONITOR_TOKEN) issue("SECURITY_KEY", "Hosted security, scheduler and monitor keys are required");
      const keys = [value.SECURITY_KEY,value.INBOUND_JOB_SECRET,value.MONITOR_TOKEN];
      if (new Set(keys).size !== keys.length) issue("SECURITY_KEY", "Use independent runtime credentials");
      for (const name of ["APP_ORIGIN","REPORT_ORIGIN"] as const) {
        const candidate = value[name];
        if (!candidate || !candidate.startsWith("https://") || !URL.canParse(candidate) || new URL(candidate).origin !== candidate) issue(name,"Exact hosted HTTPS origin required");
      }
      if (value.APP_ORIGIN !== value.REPORT_ORIGIN) issue("REPORT_ORIGIN","Use the application HTTPS origin");
      if (value.LOCAL_STORAGE_SERVICE_KEY || value.SUPABASE_PUBLISHABLE_KEY.startsWith("local-")) issue("SUPABASE_PUBLISHABLE_KEY","Local fixture credentials are development-only");
      for (const name of ["DATABASE_URL","DIRECT_URL"] as const) {
        if (!URL.canParse(value[name])) continue;
        const url = new URL(value[name]);
        if (["localhost","127.0.0.1","[::1]"].includes(url.hostname) || !["require","verify-ca","verify-full"].includes(url.searchParams.get("sslmode") ?? "")) issue(name,"Hosted database requires TLS and a separate endpoint");
      }
      if (process.env.OPS_N8N_WEBHOOK && (!value.OPS_N8N_SIGNING_KEY || keys.includes(value.OPS_N8N_SIGNING_KEY))) issue("OPS_N8N_SIGNING_KEY", "Configure an independent signing key for n8n");
      if (!value.INVENTORY_MAX_AGE_MINUTES) issue("INVENTORY_MAX_AGE_MINUTES","Confirm maximum inventory age for this environment");
    }
    if (value.CUSTOMER_RETENTION_DAYS < value.REPORT_TTL_DAYS) issue("CUSTOMER_RETENTION_DAYS","Retention must cover report validity");
    if (
      value.APP_ENV !== "development" &&
      (!value.SUPABASE_URL.startsWith("https://") ||
        (URL.canParse(value.SUPABASE_URL) && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value.SUPABASE_URL).hostname)))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["SUPABASE_URL"],
        message: "Hosted auth requires HTTPS",
      });
    }
  });
export const env = () => settings.parse(process.env);

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
