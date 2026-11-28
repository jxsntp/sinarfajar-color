import { z } from "zod";
import { paletteSnapshot, tones } from "./swatches";

const revision = z.string().regex(/^[a-z0-9-]{1,64}$/);
export const toneInput = z.enum(tones);
const toneSelection = z.array(toneInput).min(1).max(2).refine((items) => new Set(items).size === items.length);
const suggestedGold = z.enum(["yellow", "rose", "white"]);
const trialInput = z.object({
  kind: z.literal("trial"), tones: toneSelection.length(2), paletteVersion: revision,
  swatchIds: z.array(revision).length(3).refine((items) => new Set(items).size === items.length),
  gold: suggestedGold, quality: z.enum(["stable", "mixed"]),
}).strict();
export type TrialResult = z.infer<typeof trialInput>;
export const resultInput = z.discriminatedUnion("kind", [
  trialInput,
  z.object({
    kind: z.literal("manual"), paletteId: z.string().regex(/^drape-(vivid|dark|pale|dull)$/),
    paletteVersion: revision,
  }).strict(),
  z.object({ kind: z.literal("mixed"), tones: toneSelection.length(2), paletteVersion: revision }).strict(),
  z.object({
    kind: z.literal("automatic"), tones: toneSelection, quality: z.enum(["stable", "mixed"]),
    methodVersion: revision, paletteVersion: revision, calibrationVersion: revision,
  }).strict(),
  z.object({
    kind: z.literal("uncertain"), reason: z.enum(["no_clear_match", "capture_unavailable"]),
  }).strict(),
]);
export type ColorResultInput = z.infer<typeof resultInput>;
export type PaletteSnapshot = ReturnType<typeof paletteSnapshot>;
export const snapshotInput = z.array(z.object({
  id: revision, label: z.object({ en: z.string(), id: z.string() }),
  display: z.string().regex(/^#[0-9a-f]{6}$/i), family: z.enum(["red","yellow","green","blue","violet","neutral"]),
  tone: toneInput.nullable(),
})).max(64);
const savedTrial = z.object({
  kind: z.literal("camera-trial"), swatches: snapshotInput.length(3), gold: suggestedGold,
}).strict();
export function readTrial(snapshot: unknown) {
  const parsed = savedTrial.safeParse(snapshot);
  return parsed.success ? parsed.data : null;
}
export const readPalette = (snapshot: unknown): PaletteSnapshot => {
  const parsed = snapshotInput.safeParse(snapshot);
  return parsed.success ? parsed.data : readTrial(snapshot)?.swatches ?? [];
};
