/**
 * Face-metered exposure for uncalibrated cameras. Webcam auto exposure meters the whole frame, so a
 * bright window or lamp behind the customer leaves the face dark. This steers whichever exposure
 * control the camera exposes until the face sits in a usable band. It only corrects a face that is
 * clearly too dark or near clipping, so darker skin is not pushed toward a single target.
 * A calibrated station locks its settings and never uses this.
 */

/** The metered region inside the face guide (x, y, width, height as fractions of the frame): cheeks and nose. */
export const faceMeter = [0.38, 0.3, 0.24, 0.3] as const;
/** Mean sRGB luma (0–255) of the metered region. */
export const exposureBand = { low: 95, high: 190, target: 130 } as const;

type Range = { min: number; max: number; step?: number };
export type ExposureCapabilities = {
  exposureMode?: string[];
  exposureCompensation?: Range;
  exposureTime?: Range;
  brightness?: Range;
};
export type ExposureSettings = { exposureCompensation?: number; exposureTime?: number; brightness?: number };
export type ExposureStep =
  | { kind: "ok" }
  | { kind: "adjust"; constraints: Record<string, number | string> }
  /** The face is outside the band and no control can move it further. */
  | { kind: "limit" };

const usable = (range?: Range): range is Range =>
  !!range && Number.isFinite(range.min) && Number.isFinite(range.max) && range.max > range.min;
function snap(value: number, { min, max, step }: Range) {
  const clamped = Math.min(max, Math.max(min, value));
  return step && step > 0 ? Math.min(max, Math.max(min, min + Math.round((clamped - min) / step) * step)) : clamped;
}

/** Mean luma of an RGBA region. */
export function regionLuma(pixels: Uint8ClampedArray) {
  let sum = 0;
  for (let i = 0; i < pixels.length; i += 4) sum += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
  return sum / Math.max(1, pixels.length / 4);
}

/** The next exposure change for a measured face luma, preferring the least invasive control. */
export function exposureStep(luma: number, caps: ExposureCapabilities, current: ExposureSettings): ExposureStep {
  if (!Number.isFinite(luma) || (luma >= exposureBand.low && luma <= exposureBand.high)) return { kind: "ok" };
  // Stops of linear light between the measured and target luma, damped so the loop settles without overshoot.
  const stops = 0.6 * 2.2 * Math.log2(exposureBand.target / Math.max(1, luma));
  const compensation = caps.exposureCompensation;
  if (usable(compensation)) {
    const now = current.exposureCompensation ?? 0;
    // Move at least one step, or a small correction would snap back to the current value.
    const step = compensation.step ?? 0;
    const next = snap(now + (Math.abs(stops) < step ? Math.sign(stops) * step : stops), compensation);
    if (next !== now) return { kind: "adjust", constraints: { exposureCompensation: next } };
  }
  const time = caps.exposureTime;
  if (usable(time) && caps.exposureMode?.includes("manual") && current.exposureTime) {
    const next = snap(current.exposureTime * 2 ** stops, time);
    if (next !== current.exposureTime) return { kind: "adjust", constraints: { exposureMode: "manual", exposureTime: next } };
  }
  const brightness = caps.brightness;
  if (usable(brightness) && current.brightness !== undefined) {
    const next = snap(current.brightness + Math.sign(stops) * (brightness.max - brightness.min) * 0.08, brightness);
    if (next !== current.brightness) return { kind: "adjust", constraints: { brightness: next } };
  }
  return { kind: "limit" };
}
