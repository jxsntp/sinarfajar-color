import { z } from "zod";
import { weightSchema, weights } from "../catalog/input";
import { HttpError } from "@/lib/http";
export const settingsSchema = z
  .object({
    promptId: z.uuid().nullable().optional(),
    candidateLimit: z.number().int().min(5).max(24).optional(),
    outputTokens: z.number().int().min(128).max(2000).optional(),
    runLimitUsd: z.number().positive().max(1).optional(),
    strategy: z.enum(["rules", "openrouter"]).default("rules"),
    model: z.string().max(120).default(""),
    provider: z.string().max(80).default(""),
    weights: weightSchema.default(weights),
  })
  .strict();
export type RankingSettings = z.output<typeof settingsSchema>;
const config = z.object({
  OPENROUTER_API_KEY: z.string().optional(),
  ENABLE_HOSTED_OPENROUTER: z.enum(["true", "false"]).default("false"),
  OPENROUTER_MODELS: z.string().default(""),
  OPENROUTER_PROVIDERS: z.string().default(""),
  AI_TIMEOUT_MS: z.coerce.number().int().min(100).max(10000).default(3000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(128).max(2000).default(650),
  AI_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(2).default(2),
  AI_DAILY_REQUESTS: z.coerce.number().int().min(1).max(10000).default(100),
  AI_DAILY_USD: z.coerce.number().positive().max(1000).default(2),
  AI_RUN_USD: z.coerce.number().positive().default(0.019),
  AI_PROMPT_USD_PER_M: z.coerce.number().nonnegative().max(10).default(0.5),
  AI_COMPLETION_USD_PER_M: z.coerce.number().nonnegative().max(30).default(2),
});
export const aiLimits = () => config.parse(process.env);
export function providerEnabled() {
  const hosted = process.env.APP_ENV === "uat" || process.env.APP_ENV === "production";
  const { OPENROUTER_API_KEY, ENABLE_HOSTED_OPENROUTER } = aiLimits();
  return Boolean(OPENROUTER_API_KEY) && (!hosted || ENABLE_HOSTED_OPENROUTER === "true");
}
const list = (s: string) =>
  s
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
export function approvedModels() {
  const c = aiLimits();
  return {
    models: list(c.OPENROUTER_MODELS),
    providers: list(c.OPENROUTER_PROVIDERS),
  };
}
export function checkSettings(settings: RankingSettings) {
  const approved = approvedModels();
  if (
    settings.strategy === "openrouter" &&
    (!approved.models.includes(settings.model) ||
      !approved.providers.includes(settings.provider))
  )
    throw new HttpError(400, "unapproved_provider_or_model");
}
