import type { TrialResult } from "./result";
import { swatchFor, swatchesFor, type ColorStyle, type HueFamily, type Swatch, type Tone } from "./swatches";

/**
 * The comparison sequence follows a draping analyst's order instead of a fixed list:
 * light against deep, then clear against muted, then the two leaders against each other.
 * Each step depends on the earlier choices. The metal (temperature) step runs before these.
 */
export const drapeSteps = 6;
export const depthTones = ["pale", "dark"] as const satisfies readonly Tone[];
export const clarityTones = ["vivid", "dull"] as const satisfies readonly Tone[];
export type DrapeDimension = "depth" | "clarity" | "confirm";
/** Gold against silver-toned metal, the analyst's usual first warm/cool check. */
export const metalChoices = ["yellow", "white"] as const;
export type MetalChoice = (typeof metalChoices)[number];
// Each step uses a different hue family so the customer judges the tone, not one color.
const families: HueFamily[] = ["green", "red", "blue", "violet", "yellow", "red"];

export function drapeDimension(step: number): DrapeDimension {
  return step < 2 ? "depth" : step < 4 ? "clarity" : "confirm";
}

/** The tones with the most votes among the options. A tie, or no votes, keeps every option. */
function leaders(votes: readonly (Tone | null)[], options: readonly Tone[]) {
  const counts = options.map((tone) => votes.filter((vote) => vote === tone).length);
  const most = Math.max(...counts);
  return options.filter((_, i) => counts[i] === most);
}

/** The pair for the next comparison, or undefined once all six are done. */
export function nextDrapes(version: string, votes: readonly (Tone | null)[]): [Swatch, Swatch] | undefined {
  const step = votes.length;
  if (step >= drapeSteps) return;
  let tones: readonly [Tone, Tone];
  if (step < 2) tones = depthTones;
  else if (step < 4) tones = clarityTones;
  else {
    const depth = leaders(votes.slice(0, 2), depthTones);
    const clarity = leaders(votes.slice(2, 4), clarityTones);
    const combos = depth.flatMap((a) => clarity.map((b) => [a, b] as const));
    // One leader each: compare them twice. Ties: compare different combinations.
    tones = combos.length === 4 ? combos[(step - 4) * 3] : combos[(step - 4) % combos.length];
  }
  const library = swatchesFor(version) ?? [];
  const find = (tone: Tone) => library.find((swatch) => swatch.family === families[step] && swatch.tone === tone);
  const [left, right] = [find(tones[0]), find(tones[1])];
  if (!left || !right) return;
  // Alternate sides so the first-listed tone is not always on the left.
  return step % 2 ? [right, left] : [left, right];
}

const opposites: Record<Tone, Tone> = { vivid: "dull", dull: "vivid", pale: "dark", dark: "pale" };
export type EngineCheck = "confirmed" | "split" | "overruled";
export const checkSteps = 2;

/**
 * Pairs that test the camera's top two picks: each pick against the same hue family in the opposite
 * tone, within the customer's style. The engine's pick alternates sides.
 */
export function checkDrapes(trial: TrialResult, style: ColorStyle = "both"): [Swatch, Swatch][] {
  const library = swatchesFor(trial.paletteVersion) ?? [];
  return trial.swatchIds.slice(0, checkSteps).flatMap((id, i) => {
    const pick = swatchFor(trial.paletteVersion, id);
    if (!pick?.tone) return [];
    const tone = opposites[pick.tone];
    const opposite = library.find((s) => s.family === pick.family && s.tone === tone && s.styles.includes(style)) ??
      library.find((s) => s.family === pick.family && s.tone === tone);
    if (!opposite) return [];
    return [i % 2 ? [opposite, pick] : [pick, opposite]] as [Swatch, Swatch][];
  });
}

/** Whether the comparison agreed with the camera. `picks` are the chosen swatch IDs, null for "both". */
export function engineCheck(trial: TrialResult, picks: readonly (string | null)[]): EngineCheck {
  const engine = picks.filter((id, i) => id === trial.swatchIds[i]).length;
  const opposite = picks.filter((id, i) => id !== null && id !== trial.swatchIds[i]).length;
  return engine === picks.length ? "confirmed" : engine === 0 && opposite > 0 ? "overruled" : "split";
}
