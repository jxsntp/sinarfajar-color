import { z } from "zod";
import { HttpError } from "@/lib/http";
import { deltaE00 } from "../color-analysis/delta-e";
import { hueFamilies, paletteVersion, swatchFor, swatchesFor, tones } from "../color-analysis/swatches";
import { readPalette, readTrial } from "../color-analysis/result";
import type { Preferences } from "../catalog/input";
import type { VisibleColor } from "../catalog/visible-colors";

const key = z.string().regex(/^[a-z0-9-]{1,64}$/);
const context = z.object({
  version: key.nullable(),
  method: z.string().nullable(),
  quality: z.string().nullable(),
  source: z.enum(["manual_drape", "legacy_manual", "validated_auto", "camera_trial", "unavailable"]),
  toneGroups: z.array(z.enum(tones)).max(2),
  swatches: z.array(z.object({ id: key, evidence: z.enum(["customer_selected", "curated_by_tone"]) })).max(23),
  accentFamily: z.enum(hueFamilies).optional(),
  categoryCoverage: z.literal(true).optional(),
}).strict();
export type PaletteContext = z.infer<typeof context>;
type Analysis = {
  paletteVersion: string | null; paletteSnapshot: unknown; source: string;
  profile: string | null; methodVersion: string; quality: string; toneGroups: string[];
};
export function storedPalette(value: unknown): PaletteContext | null {
  const parsed = context.safeParse(value);
  return parsed.success ? parsed.data : null;
}
export function availablePalette(version: string) {
  return (swatchesFor(version) ?? []).filter((swatch) => swatch.status === "approved" || process.env.APP_ENV !== "production");
}
export function resolvePaletteContext(preferences: Preferences, analysis: Analysis | null): PaletteContext | null {
  const record = readPalette(analysis?.paletteSnapshot);
  const version = preferences.selectedSwatchVersion ?? analysis?.paletteVersion ??
    (process.env.APP_ENV === "production" ? null : paletteVersion);
  const available = version ? availablePalette(version) : [];
  const selected = preferences.selectedSwatchIds ?? [];
  const removed = new Set(preferences.removedSwatchIds ?? []);
  if (selected.some((id) => !available.some((swatch) => swatch.id === id)) ||
      [...removed].some((id) => !record.some((swatch) => swatch.id === id))) {
    throw new HttpError(400, "invalid_palette_preference");
  }
  const useProfile = preferences.useColorProfile !== false && preferences.colorPreference !== "skip";
  const trial = useProfile && readTrial(analysis?.paletteSnapshot);
  const swatches: PaletteContext["swatches"] = selected.length
    ? selected.map((id) => ({ id, evidence: "customer_selected" }))
    : useProfile && version === analysis?.paletteVersion
      ? record.filter(({ id, tone }) => tone !== null && !removed.has(id) && available.some((swatch) => swatch.id === id))
        .map(({ id }) => ({ id, evidence: "curated_by_tone" }))
      : [];
  if (!swatches.length && !preferences.accentFamily) return null;
  return {
    version, swatches, accentFamily: preferences.accentFamily,
    method: useProfile ? analysis?.methodVersion ?? null : null,
    quality: useProfile ? analysis?.quality ?? null : null,
    source: !useProfile || !analysis ? "unavailable" : trial ? "camera_trial"
      : analysis.source === "AUTOMATIC" ? "validated_auto"
      : analysis.profile ? "legacy_manual" : analysis.paletteVersion ? "manual_drape" : "unavailable",
    toneGroups: useProfile ? tones.filter((tone) => analysis?.toneGroups.includes(tone)) : [],
    ...(trial ? { categoryCoverage: true as const } : {}),
  };
}

const prominence = { dominant: 1, noticeable: 0.75, minor: 0.35 } as const;
export function paletteFit(components: VisibleColor[] | undefined, palette: PaletteContext | null | undefined) {
  let best: { score: number; reason?: string; kind?: string } = { score: 0 };
  if (!palette) return best;
  for (const item of components ?? []) {
    if (item.status !== "verified" || item.role === "metal" ||
        (item.appearance !== "chromatic" && item.appearance !== "neutral")) continue;
    const weight = item.prominence ? prominence[item.prominence] : 0.50;
    const ref = item.reference && swatchFor(item.reference.version, item.reference.id);
    const family = item.colorFamily ?? ref?.family ?? (item.appearance === "neutral" ? "neutral" : undefined);
    if (palette.accentFamily && family === palette.accentFamily && weight * 0.50 > best.score) {
      best = { score: weight * 0.50, reason: "This piece has a verified " + family + " accent you prefer.", kind: "selected_family" };
    }
    if (!palette.version) continue;
    for (const choice of palette.swatches) {
      const swatch = swatchFor(palette.version, choice.id);
      if (!swatch || (swatch.status === "fixture" && process.env.APP_ENV === "production") ||
          (swatch.family === "neutral") !== (item.appearance === "neutral")) continue;
      let similarity = 0;
      let kind = "family";
      if (item.reference?.id === swatch.id && item.reference.version === palette.version) {
        similarity = 1;
        kind = "exact";
      } else if (item.measurement && swatch.reference && item.measurement.protocol === swatch.reference.protocol &&
          item.measurement.whitePoint === swatch.reference.whitePoint &&
          (item.appearance === "neutral" || Math.hypot(item.measurement.lab[1], item.measurement.lab[2]) >= 2)) {
        similarity = Math.max(0, 1 - deltaE00(swatch.reference.lab, item.measurement.lab) / 20);
        kind = "measured";
      } else if (family === swatch.family) {
        similarity = family === "neutral" ? 0.30 : 0.48;
      }
      const selected = choice.evidence === "customer_selected";
      const score = similarity * weight * (selected ? 1 : 0.36);
      if (score <= best.score) continue;
      const shade = swatch.label.en.toLowerCase();
      const reason = kind === "family"
        ? (selected ? "Compare its verified " + family + " accent with the " + shade + " you chose."
          : "Compare its verified " + family + " accent with " + shade + " from your palette.")
        : (selected ? "Its verified accent coordinates with the " + shade + " you chose."
          : "Its verified accent is one to compare with " + shade + " from your palette.");
      best = { score, reason, kind: (selected ? "selected_" : "curated_") + kind };
    }
  }
  return best;
}
