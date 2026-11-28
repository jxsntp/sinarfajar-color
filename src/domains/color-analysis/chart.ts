import { checkChart, fitChart, type ChartPatch } from "./calibration";
import { deltaE00 } from "./delta-e";
import { adaptXyz, labToXyz, median, pixelLab, xyzToLab, type Calibration } from "./measurement";
import type { FrameRegion } from "./regions";
import type { Lab } from "./swatches";

export const d50: Lab = [0.96422, 1, 0.82521];
export const d65: Lab = [0.95047, 1, 1.08883];

export type ChartReference = {
  id: string;
  name: string;
  /** Patch CIELAB under D50 in reading order, starting at dark skin with the brown patch at top left. */
  patches: readonly { name: string; lab: Lab }[];
};
/**
 * Average ColorChecker Classic (2005 formulation) D50 values from BabelColor.
 * Charts vary by batch and age. Prefer the values on the chart's own data sheet when available.
 */
export const colorCheckerClassic: ChartReference = {
  id: "colorchecker-classic-2005",
  name: "ColorChecker Classic (2005 average)",
  patches: ([
    ["Dark skin", 37.986, 13.555, 14.059], ["Light skin", 65.711, 18.13, 17.81],
    ["Blue sky", 49.927, -4.88, -21.925], ["Foliage", 43.139, -13.095, 21.905],
    ["Blue flower", 55.112, 8.844, -25.399], ["Bluish green", 70.719, -33.397, -0.199],
    ["Orange", 62.661, 36.067, 57.096], ["Purplish blue", 40.02, 10.41, -45.964],
    ["Moderate red", 51.124, 48.239, 16.248], ["Purple", 30.325, 22.976, -21.587],
    ["Yellow green", 72.532, -23.709, 57.255], ["Orange yellow", 71.941, 19.363, 67.857],
    ["Blue", 28.778, 14.179, -50.297], ["Green", 55.261, -38.342, 31.37],
    ["Red", 42.101, 53.378, 28.19], ["Yellow", 81.733, 4.039, 79.819],
    ["Magenta", 51.935, 49.986, -14.574], ["Cyan", 51.038, -28.631, -28.638],
    ["White 9.5", 96.539, -0.425, 1.186], ["Neutral 8", 81.257, -0.638, -0.335],
    ["Neutral 6.5", 66.766, -0.734, -0.504], ["Neutral 5", 50.867, -0.153, -0.27],
    ["Neutral 3.5", 35.656, -0.421, -1.231], ["Black 2", 20.461, -0.079, -0.973],
  ] as const).map(([name, l, a, b]) => ({ name, lab: [l, a, b] as Lab })),
};
export const chartColumns = 6;
export const chartRows = 4;
/** Normalized frame area the operator aligns the chart's 24 patches with. */
export const chartGuide: FrameRegion = [0.15, 0.2, 0.7, 0.6];
/** Patches excluded from the fit and used to check it: light skin, orange, purple, green, cyan and neutral 5. */
export const heldOutPatches: readonly number[] = [1, 6, 9, 13, 17, 21];
/** Provisional bench targets for held-out CIEDE2000 error, pending the hardware review. */
export const chartTargets = { mean: 3, max: 6 } as const;

/** Sampling rectangle in the middle 40% of each patch cell. */
export function patchRegion(index: number, guide: FrameRegion = chartGuide): FrameRegion {
  const [x, y, w, h] = guide;
  const cellW = w / chartColumns, cellH = h / chartRows;
  const column = index % chartColumns, row = Math.floor(index / chartColumns);
  return [x + (column + 0.3) * cellW, y + (row + 0.3) * cellH, cellW * 0.4, cellH * 0.4];
}

export type PatchReading = { rgb: Lab; clipped: number };
/** Median RGB of each patch's sampling rectangle in one frame. */
export function samplePatches(image: ImageData, guide: FrameRegion = chartGuide): PatchReading[] {
  return Array.from({ length: chartColumns * chartRows }, (_, index) => {
    const [x, y, w, h] = patchRegion(index, guide);
    const left = Math.floor(x * image.width), right = Math.ceil((x + w) * image.width);
    const top = Math.floor(y * image.height), bottom = Math.ceil((y + h) * image.height);
    const channels: number[][] = [[], [], []];
    let clipped = 0;
    for (let row = top; row < bottom; row++) {
      for (let column = left; column < right; column++) {
        const i = (row * image.width + column) * 4;
        const pixel = [image.data[i], image.data[i + 1], image.data[i + 2]];
        // Saturated patches can reach zero in one channel; a blown highlight or a fully crushed pixel cannot be fitted.
        if (Math.max(...pixel) >= 254 || Math.max(...pixel) <= 2) clipped++;
        pixel.forEach((value, axis) => channels[axis].push(value));
      }
    }
    const count = channels[0].length;
    return { rgb: channels.map((values) => median(values) ?? NaN) as unknown as Lab, clipped: count ? clipped / count : 1 };
  });
}

export type ChartFailure = "frames" | "clipping" | "orientation" | "fit";
export type ChartResult = {
  calibration: Calibration;
  heldOut: { mean: number; max: number; patchCount: number };
  all: { mean: number; max: number; patchCount: number };
  patches: { name: string; rgb: Lab; reference: Lab; measured: Lab; error: number; heldOut: boolean }[];
  passed: boolean;
};
/** Fits a station calibration from several frames of chart readings and checks it on held-out patches. */
export function calibrateChart(
  frames: readonly PatchReading[][], revision: string, chart: ChartReference = colorCheckerClassic,
): ChartResult | { error: ChartFailure } {
  const count = chart.patches.length;
  if (frames.length < 3 || frames.some((frame) => frame.length !== count)) return { error: "frames" };
  const readings = chart.patches.map((_, index) => ({
    rgb: [0, 1, 2].map((axis) => median(frames.map((frame) => frame[index].rgb[axis])) ?? NaN) as unknown as Lab,
    clipped: median(frames.map((frame) => frame[index].clipped)) ?? 1,
  }));
  if (readings.some(({ rgb, clipped }) => !rgb.every(Number.isFinite) || clipped > 0.05)) return { error: "clipping" };
  // The bottom row runs from white to black, so its camera lightness must fall from left to right.
  const luma = ([r, g, b]: Lab) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const neutrals = readings.slice(18, 24).map(({ rgb }) => luma(rgb));
  if (neutrals.some((value, i) => i > 0 && value >= neutrals[i - 1])) return { error: "orientation" };
  const patches: ChartPatch[] = readings.map(({ rgb }, index) => ({
    rgb, xyz: adaptXyz(labToXyz(chart.patches[index].lab, d50), d50, d65),
  }));
  const held = new Set(heldOutPatches);
  const calibration = fitChart(patches.filter((_, i) => !held.has(i)), revision, d65);
  if (!calibration) return { error: "fit" };
  const heldOut = checkChart(calibration, patches.filter((_, i) => held.has(i)));
  const all = checkChart(calibration, patches);
  if (!heldOut || !all) return { error: "fit" };
  return {
    calibration, heldOut, all,
    passed: heldOut.mean <= chartTargets.mean && heldOut.max <= chartTargets.max,
    patches: patches.map(({ rgb, xyz }, index) => {
      const measured = pixelLab(rgb, calibration);
      // Reference shown in D65 Lab, the space the kiosk measures in.
      const reference = xyzToLab(xyz, d65);
      return {
        name: chart.patches[index].name, rgb, reference, measured, heldOut: held.has(index),
        error: deltaE00(measured, reference),
      };
    }),
  };
}

/** `manual` keeps customer draping and feeds the localhost trial; `research` runs the blinded study capture. */
export type StationMode = "manual" | "research";
export type StationEntry = {
  mode: StationMode;
  checkedAt: string;
  camera?: { deviceId?: string; exposureTime?: number; exposureCompensation?: number; colorTemperature?: number };
  whiteReference?: true;
  calibration: { revision: string; matrix: number[]; white: [number, number, number] };
};
/** The `COLOR_STATIONS` entry for one device. */
export function stationEntry(
  calibration: Calibration, checkedAt: Date, camera?: StationEntry["camera"], whiteReference = false,
  mode: StationMode = "manual",
): StationEntry {
  return {
    mode, checkedAt: checkedAt.toISOString(),
    ...(camera && Object.keys(camera).length ? { camera } : {}),
    ...(whiteReference ? { whiteReference: true as const } : {}),
    calibration: {
      revision: calibration.revision,
      matrix: calibration.matrix.map((value) => Number(value.toFixed(7))),
      white: [...calibration.white] as [number, number, number],
    },
  };
}
/** For example `station-20261127-1905` (UTC). */
export const calibrationRevision = (date: Date) =>
  "station-" + date.toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
