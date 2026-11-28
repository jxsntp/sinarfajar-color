import { deltaE00 } from "./delta-e";
import type { Lab, Tone } from "./swatches";

export type Calibration = {
  revision: string;
  // Row-major XYZ transform with an intercept per row. Input is linear sRGB in [0, 1].
  matrix: readonly number[];
  white: readonly [number, number, number];
};
/** Standard sRGB to XYZ (D65). Used when a camera has no station calibration and for on-screen colors. */
export const assumedSrgb: Calibration = {
  revision: "assumed-srgb-d65",
  matrix: [
    0.4124564, 0.3575761, 0.1804375, 0,
    0.2126729, 0.7151522, 0.0721750, 0,
    0.0193339, 0.1191920, 0.9503041, 0,
  ],
  white: [0.95047, 1, 1.08883],
};
export const linear = (n: number) => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
const delta = 6 / 29;
export function xyzToLab(xyz: Lab, white: Lab): Lab {
  const f = (n: number) => n > delta ** 3 ? Math.cbrt(n) : n / (3 * delta ** 2) + 4 / 29;
  const [x, y, z] = xyz.map((v, i) => f(v / white[i]));
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export function labToXyz([l, a, b]: Lab, white: Lab): Lab {
  const f = (n: number) => n > delta ? n ** 3 : 3 * delta ** 2 * (n - 4 / 29);
  const y = (l + 16) / 116;
  return [f(y + a / 500) * white[0], f(y) * white[1], f(y - b / 200) * white[2]];
}
export function pixelXyz(rgb: Lab, { matrix: m }: Calibration): Lab {
  const [r, g, b] = rgb.map((v) => linear(v / 255));
  return [0, 4, 8].map((i) => m[i] * r + m[i + 1] * g + m[i + 2] * b + m[i + 3]) as unknown as Lab;
}
export const pixelLab = (rgb: Lab, calibration: Calibration): Lab =>
  xyzToLab(pixelXyz(rgb, calibration), calibration.white);

// Bradford cone response matrix and its inverse (Lam, 1985; Lindbloom).
const bradford = [0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296];
const bradfordInverse = [
  0.9869929, -0.1470543, 0.1599627, 0.4323053, 0.5183603, 0.0492912, -0.0085287, 0.0400428, 0.9684867,
];
const apply = (m: readonly number[], v: Lab): Lab =>
  [0, 3, 6].map((i) => m[i] * v[0] + m[i + 1] * v[1] + m[i + 2] * v[2]) as unknown as Lab;
/**
 * Adapts a calibration so a measured neutral reference maps to the calibration white.
 * The adaptation corrects chromaticity only, so the reference keeps its measured lightness.
 */
/** Row-major 3x3 Bradford transform from one white point to another. */
export function adaptation(from: Lab, to: Lab): number[] {
  const source = apply(bradford, from);
  const target = apply(bradford, to);
  const gains = target.map((v, i) => v / source[i]);
  // Combined 3x3: inverse · diag(gains) · bradford.
  return [0, 1, 2].flatMap((row) => [0, 1, 2].map((col) =>
    [0, 1, 2].reduce((sum, k) => sum + bradfordInverse[row * 3 + k] * gains[k] * bradford[k * 3 + col], 0)));
}
export const adaptXyz = (xyz: Lab, from: Lab, to: Lab) => apply(adaptation(from, to), xyz);
export function balanceCalibration(calibration: Calibration, reference: Lab): Calibration | null {
  const xyz = labToXyz(reference, calibration.white);
  if (!xyz.every((v) => Number.isFinite(v) && v > 0)) return null;
  const adapt = adaptation(xyz.map((v) => v / xyz[1]) as unknown as Lab, calibration.white);
  const m = calibration.matrix;
  const matrix = [0, 1, 2].flatMap((row) => [0, 1, 2, 3].map((col) =>
    [0, 1, 2].reduce((sum, k) => sum + adapt[row * 3 + k] * m[k * 4 + col], 0)));
  return matrix.every(Number.isFinite) ? { ...calibration, matrix } : null;
}

export function regionContrast(skin: number, brow: number): number | null {
  if (![skin, brow].every((v) => Number.isFinite(v) && v >= 0 && v <= 100) || skin + brow < 1) {
    return null;
  }
  return Math.abs(skin - brow) / (skin + brow);
}
export function median(values: readonly number[]) {
  if (!values.length || values.some((n) => !Number.isFinite(n))) return null;
  const sorted = values.toSorted((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
}
export function medianLab(values: readonly Lab[]): Lab | null {
  const channels = [0, 1, 2].map((axis) => median(values.map((value) => value[axis])));
  return channels.every((value) => value !== null) ? channels as unknown as Lab : null;
}

export type SkinFeatures = {
  lightness: number;
  a: number;
  b: number;
  chroma: number;
  /** CIELAB hue angle in degrees. */
  hue: number;
  /** Individual typology angle in degrees, atan2(L* - 50, b*). */
  ita: number;
};
const degrees = (radians: number) => radians * 180 / Math.PI;
export function skinFeatures([lightness, a, b]: Lab): SkinFeatures {
  return {
    lightness, a, b, chroma: Math.hypot(a, b),
    hue: (degrees(Math.atan2(b, a)) + 360) % 360,
    ita: degrees(Math.atan2(lightness - 50, b)),
  };
}

export const captureFailures = [
  "no_face", "multiple_faces", "pose", "blur", "clipping", "lighting",
  "region", "reference", "unstable", "camera_denied", "capture_unavailable",
] as const;
export type CaptureFailure = (typeof captureFailures)[number];
export type QualityLimits = {
  minFrames: number;
  maxContrastDeviation: number;
  minSharpness: number;
  maxClipped: number;
  maxSkinDifference: number;
  /** Darkest share of brow pixels used for brow lightness, so skin between hairs is excluded. */
  browFraction: number;
  /** Largest CIEDE2000 difference between a frame's skin color and the capture median. */
  maxSkinDeviation: number;
  /** Largest CIEDE2000 difference between a frame's raw gray reference and the capture median. */
  maxReferenceDrift: number;
};
export type WhiteReferenceMode = "off" | "auto" | "required";
/** `skin` is the calibrated (and, with `reference`, white-balanced) skin color for the frame. */
export type AcceptedFrame = { sides: [number, number]; skin: Lab; reference?: Lab };

function consistentFrames(frames: AcceptedFrame[], limits: QualityLimits, mode: WhiteReferenceMode) {
  const referenced = frames.filter((frame) => frame.reference);
  if (mode !== "off" && referenced.length >= limits.minFrames) {
    const center = medianLab(referenced.map((frame) => frame.reference!));
    if (!center) return null;
    return {
      balanced: true,
      frames: referenced.filter((frame) => deltaE00(frame.reference!, center) <= limits.maxReferenceDrift),
    };
  }
  // Balanced and unbalanced frames are never mixed in one summary.
  return mode === "required" ? null : { balanced: false, frames: frames.filter((frame) => !frame.reference) };
}

export function summarizeCapture(frames: AcceptedFrame[], limits: QualityLimits, mode: WhiteReferenceMode = "off") {
  const usable = consistentFrames(frames, limits, mode);
  if (!usable || usable.frames.length < limits.minFrames) return null;
  const contrasts = usable.frames.flatMap((frame) => frame.sides);
  const contrast = median(contrasts);
  if (contrast === null || contrasts.some((value) => Math.abs(value - contrast) > limits.maxContrastDeviation)) return null;
  const skin = medianLab(usable.frames.map((frame) => frame.skin));
  if (!skin || usable.frames.some((frame) => deltaE00(frame.skin, skin) > limits.maxSkinDeviation)) return null;
  return { contrast, skinLab: skin, skin: skinFeatures(skin), balanced: usable.balanced, frames: usable.frames.length };
}

export type ToneRule = { low: number; high: number; mixedWidth: number; tieOrder: Tone[] };
export function scoreTones(contrast: number, { low, high, mixedWidth, tieOrder }: ToneRule) {
  if (![contrast, low, high, mixedWidth].every(Number.isFinite) || contrast < 0 ||
      contrast > 1 || low < 0 || high > 1 || low >= high || mixedWidth < 0 || mixedWidth >= 0.5 ||
      new Set(tieOrder).size !== 4) return null;
  const c = Math.min(1, Math.max(0, (contrast - low) / (high - low)));
  const scores = { vivid: c, dark: c, pale: 1 - c, dull: 1 - c };
  const upper = tieOrder.filter((tone) => tone === "vivid" || tone === "dark");
  const lower = tieOrder.filter((tone) => tone === "pale" || tone === "dull");
  if (Math.abs(c - 0.5) <= mixedWidth) {
    return { scores, tones: [upper[0], lower[0]], quality: "mixed" as const };
  }
  return { scores, tones: c > 0.5 ? upper : lower, quality: "stable" as const };
}
