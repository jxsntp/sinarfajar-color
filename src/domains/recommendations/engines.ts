import { z } from "zod";
import type { Candidate } from "../catalog/service";
import type { Preferences, Weights } from "../catalog/input";
import { paletteFit, type PaletteContext } from "./palette-evidence";
import { jewelryCategory, type JewelryCategory } from "./jewelry-categories";

export type RankingInput = {
  candidates: Candidate[];
  preferences: Preferences;
  color: string | null; // Kept for historical evaluation case compatibility.
  palette?: PaletteContext | null;
  weights: Weights;
};
export type Ranking = { sku: string; rank: number; reason: string }[];
export type Usage = { input: number; output: number; cost: number | null };
export interface RecommendationEngine {
  rank(input: RankingInput): Promise<{ items: Ranking; usage?: Usage }>;
}
const neutralReason =
  "An option to explore from this store's eligible selection.";
export function evidence(p: Candidate, input: RankingInput) {
  const { preferences: pref, weights: w } = input;
  let score = 0;
  const reasons: string[] = [];
  if (pref.style && p.styleTags.includes(pref.style)) {
    score += w.style;
    reasons.push("Selected for your " + pref.style + " style preference.");
  }
  if (pref.occasion && p.occasionTags.includes(pref.occasion)) {
    score += w.occasion;
    reasons.push("Selected for your " + pref.occasion + " occasion.");
  }
  if (pref.preferredGold === p.goldColor) {
    score += w.gold;
    reasons.push(input.palette?.source === "camera_trial"
      ? "Matches the metal color suggested in your camera result." : "Reflects your preferred gold color.");
  }
  const match = paletteFit(p.visibleColors, input.palette);
  const activeSoftWeights = [pref.style && w.style, pref.occasion && w.occasion, pref.preferredGold && w.gold]
    .filter((weight): weight is number => typeof weight === "number" && weight > 0);
  const profileCap = Math.min(w.color, 0.95, ...activeSoftWeights.map((weight) => weight * 0.49));
  if (match.reason && profileCap > 0) {
    score += profileCap * match.score;
    reasons.push(match.reason);
  }
  if (pref.maxBudget) {
    score += w.budget * Math.max(0, 1 - Number(p.price) / Math.max(1, Number(pref.maxBudget)));
    reasons.push("One of the options within your selected budget.");
  }
  return {
    score, paletteScore: profileCap > 0 ? match.score : 0,
    paletteReason: profileCap > 0 ? match.reason : undefined, paletteKind: profileCap > 0 ? match.kind : undefined,
    tier: Number(!!pref.preferredGold && pref.preferredGold === p.goldColor), reasons: [...reasons, neutralReason],
  };
}

export async function selectCandidates(
  pages: AsyncIterable<Candidate[]>,
  input: Omit<RankingInput, "candidates">,
  limit: number,
) {
  const pool: { product: Candidate; tier: number; score: number }[] = [];
  type Choice = (typeof pool)[number];
  const byCategory = input.palette?.categoryCoverage ? new Map<JewelryCategory, Choice>() : null;
  const compare = (a: Choice, b: Choice) => b.tier - a.tier || b.score - a.score ||
    (a.product.sku < b.product.sku ? -1 : a.product.sku > b.product.sku ? 1 : 0);
  for await (const page of pages) {
    for (const product of page) {
      const { tier, score } = evidence(product, { ...input, candidates: [] });
      const choice = { product, tier, score };
      if (!byCategory) {
        pool.push(choice);
        continue;
      }
      const category = jewelryCategory(product.category);
      if (!category) continue;
      const current = byCategory.get(category);
      if (!current || compare(choice, current) < 0) byCategory.set(category, choice);
    }
    if (!byCategory) {
      pool.sort(compare);
      pool.length = Math.min(pool.length, limit, 24);
    }
  }
  const choices = byCategory ? [...byCategory.values()].sort(compare) : pool;
  return choices.map(({ product }) => product);
}
export const rulesEngine: RecommendationEngine = {
  async rank(input) {
    const pool = input.candidates.map((p) => ({ p, ...evidence(p, input) }));
    const items: Ranking = [];
    const brands = new Set<string>(),
      categories = new Set<string>();
    const adjusted = (v: (typeof pool)[number]) =>
      v.score +
      input.weights.diversity *
        (Number(!brands.has(v.p.brand)) +
          Number(!categories.has(v.p.category)));
    while (pool.length && items.length < 5) {
      pool.sort(
        (a, b) => b.tier - a.tier || adjusted(b) - adjusted(a) || (a.p.sku < b.p.sku ? -1 : 1),
      );
      const chosen = pool.shift()!;
      items.push({
        sku: chosen.p.sku,
        rank: items.length + 1,
        reason: chosen.paletteReason && chosen.paletteReason !== chosen.reasons[0]
          ? chosen.reasons[0] + " " + chosen.paletteReason : chosen.reasons[0],
      });
      brands.add(chosen.p.brand);
      categories.add(chosen.p.category);
    }
    return { items };
  },
};
export const rankingSchema = z
  .object({
    recommendations: z
      .array(
        z
          .object({
            sku: z.string(),
            rank: z.number().int().positive(),
            reason: z.string().min(1).max(220),
          })
          .strict(),
      )
      .max(5),
  })
  .strict();
export function groundedReason(reason: string, evidence: string[]) {
  return evidence.some(
    (first) =>
      reason === first ||
      evidence.some(
        (second) => second !== first && reason === first + " " + second,
      ),
  );
}
export function validateRanking(raw: unknown, input: RankingInput): Ranking {
  const rows = rankingSchema
    .parse(raw)
    .recommendations.sort((a, b) => a.rank - b.rank);
  const seen = new Set<string>();
  if (rows.length !== Math.min(input.candidates.length, 5))
    throw new Error("incomplete_ranking");
  const preferred = input.preferences.preferredGold;
  const preferredCount = preferred ? input.candidates.filter((p) => p.goldColor === preferred).length : 0;
  for (const [index, row] of rows.entries()) {
    const candidate = input.candidates.find((p) => p.sku === row.sku);
    if (preferred && candidate && (index < preferredCount) !== (candidate.goldColor === preferred))
      throw new Error("invalid_preference_tier");
    if (
      !candidate ||
      seen.has(row.sku) ||
      row.rank !== index + 1 ||
      !groundedReason(row.reason, evidence(candidate, input).reasons)
    )
      throw new Error("invalid_ranking");
    seen.add(row.sku);
  }
  return rows;
}
