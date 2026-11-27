import { metalColors } from "../sessions/palette";
import { pixelLab, type Calibration } from "./measurement";
import type { TrialResult } from "./result";
import { paletteFor, type Lab, type Tone } from "./swatches";

const goldVariants = ["yellow", "rose", "white"] as const;
const radians = (degrees: number) => degrees * Math.PI / 180;

function hueEffect([lightness, a, b]: Lab) {
  const hue = (Math.atan2(b, a) / radians(1) + 360) % 360;
  const chroma = Math.hypot(a, b);
  const chromaWeight = 0.5 + 0.5 * Math.tanh(-2 + 0.5 * chroma);
  const basicHue = -0.08 - 0.14 * Math.sin(radians(hue + 50)) - 0.07 * Math.sin(radians(2 * hue + 90));
  const yellow = (90 - hue) / 10;
  const yellowAdjustment = (0.22 * lightness - 12.8) / 10 * Math.exp(yellow - Math.exp(yellow));
  return chromaWeight * (basicHue + yellowAdjustment);
}

// Ou and Luo (2006), equation 11. This trial treats skin and display swatches as color patches.
export function harmony(first: Lab, second: Lab) {
  const chromaDelta = Math.hypot(first[1], first[2]) - Math.hypot(second[1], second[2]);
  const hueDifferenceSquared = Math.max(0,
    (first[1] - second[1]) ** 2 + (first[2] - second[2]) ** 2 - chromaDelta ** 2);
  const chromatic = Math.sqrt(hueDifferenceSquared + (chromaDelta / 1.46) ** 2);
  const lightnessSum = first[0] + second[0];
  const lightnessDelta = Math.abs(first[0] - second[0]);
  return 0.04 + 0.53 * Math.tanh(0.8 - 0.045 * chromatic)
    + 0.28 + 0.54 * Math.tanh(-3.88 + 0.029 * lightnessSum)
    + 0.14 + 0.15 * Math.tanh(-2 + 0.2 * lightnessDelta)
    + hueEffect(first) + hueEffect(second);
}
export function rankTrial(
  skin: Lab, calibration: Calibration, paletteVersion: string,
  group: { tones: Tone[]; quality: TrialResult["quality"] },
): TrialResult | undefined {
  const score = (hex: string) => {
    const rgb: Lab = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)) as unknown as Lab;
    return harmony(skin, pixelLab(rgb, calibration));
  };
  const swatches = paletteFor(paletteVersion, group.tones).filter((swatch) => swatch.tone !== null);
  if (!skin.every(Number.isFinite) || swatches.length < 3) return;
  const swatchIds = swatches.map(({ id, display }) => ({ id, score: score(display) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 3).map(({ id }) => id);
  const metal = goldVariants.map((gold, index) => ({ gold, score: score(metalColors[index]) }))
    .sort((a, b) => b.score - a.score)[0];
  return { kind: "trial", paletteVersion, tones: group.tones, quality: group.quality, swatchIds, gold: metal.gold };
}
