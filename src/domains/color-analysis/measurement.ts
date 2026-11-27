import type { Lab, Tone } from "./swatches";

export type Calibration = {
  revision: string;
  // Row-major XYZ transform with an intercept per row. Input is linear sRGB in [0, 1].
  matrix: readonly number[];
  white: readonly [number, number, number];
};
export const linear = (n: number) => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
export function xyzToLab(xyz: Lab, white: Lab): Lab {
  const delta = 6 / 29;
  const f = (n: number) => n > delta ** 3 ? Math.cbrt(n) : n / (3 * delta ** 2) + 4 / 29;
  const [x, y, z] = xyz.map((v, i) => f(v / white[i]));
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export function pixelLab(rgb: Lab, calibration: Calibration): Lab {
  const [r, g, b] = rgb.map((v) => linear(v / 255));
  const m = calibration.matrix;
  return xyzToLab(
    [0, 4, 8].map((i) => m[i] * r + m[i + 1] * g + m[i + 2] * b + m[i + 3]) as unknown as Lab,
    calibration.white,
  );
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
export const captureFailures = [
  "no_face", "multiple_faces", "pose", "blur", "clipping", "lighting",
  "region", "unstable", "camera_denied", "capture_unavailable",
] as const;
export type CaptureFailure = (typeof captureFailures)[number];
export type QualityLimits = {
  minFrames: number;
  maxContrastDeviation: number;
  minSharpness: number;
  maxClipped: number;
  maxSkinDifference: number;
};
export type AcceptedFrame = { sides: [number, number]; skinAB: [number, number]; skinLightness?: number };
export function summarizeCapture(frames: AcceptedFrame[], limits: QualityLimits) {
  if (frames.length < limits.minFrames) return null;
  const contrasts = frames.flatMap((frame) => frame.sides);
  const contrast = median(contrasts);
  if (contrast === null || contrasts.some((value) => Math.abs(value - contrast) > limits.maxContrastDeviation)) return null;
  const a = median(frames.map((frame) => frame.skinAB[0]));
  const b = median(frames.map((frame) => frame.skinAB[1]));
  const lightness = median(frames.flatMap((frame) => frame.skinLightness === undefined ? [] : [frame.skinLightness]));
  return a === null || b === null ? null : { contrast, skinAB: [a, b] as [number, number], lightness };
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
