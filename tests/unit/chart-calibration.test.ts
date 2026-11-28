import { expect, it } from "vitest";
import {
  calibrateChart, calibrationRevision, chartGuide, chartTargets, colorCheckerClassic, d50, d65, patchRegion, samplePatches, stationEntry,
} from "@/domains/color-analysis/chart";
import { adaptXyz, labToXyz } from "@/domains/color-analysis/measurement";
import type { Lab } from "@/domains/color-analysis/swatches";

// XYZ (D65) to linear sRGB.
const inverse = [3.2404542, -1.5371385, -0.4985314, -0.969266, 1.8760108, 0.041556, 0.0556434, -0.2040259, 1.0572252];
const encode = (v: number) => Math.round(255 * Math.min(1, Math.max(0,
  v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)));
/** What an ideal sRGB camera would record for each patch, with an exposure factor. */
const cameraRgb = (exposure: number) => colorCheckerClassic.patches.map(({ lab }) => {
  const xyz = adaptXyz(labToXyz(lab, d50), d50, d65);
  return [0, 3, 6].map((i) => encode(exposure * (inverse[i] * xyz[0] + inverse[i + 1] * xyz[1] + inverse[i + 2] * xyz[2]))) as unknown as Lab;
});
function paintChart(colors: Lab[], size = [640, 480] as const) {
  const [width, height] = size;
  const data = new Uint8ClampedArray(width * height * 4).fill(40);
  const [gx, gy, gw, gh] = chartGuide;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = (x / width - gx) / gw, v = (y / height - gy) / gh;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
      const color = colors[Math.floor(v * 4) * 6 + Math.floor(u * 6)];
      data.set([...color, 255], (y * width + x) * 4);
    }
  }
  return { width, height, data, colorSpace: "srgb" } as ImageData;
}

it("samples each patch from the middle of its grid cell", () => {
  expect(patchRegion(0)).toEqual([
    expect.closeTo(0.15 + 0.3 * 0.7 / 6, 12), expect.closeTo(0.2 + 0.3 * 0.15, 12),
    expect.closeTo(0.4 * 0.7 / 6, 12), expect.closeTo(0.4 * 0.15, 12),
  ]);
  const colors = cameraRgb(0.9);
  const readings = samplePatches(paintChart(colors));
  expect(readings.map(({ rgb }) => rgb)).toEqual(colors);
  expect(readings.every(({ clipped }) => clipped === 0)).toBe(true);
});

it("fits an exposure-scaled sRGB camera with near-zero held-out error", () => {
  const frame = samplePatches(paintChart(cameraRgb(0.85)));
  const result = calibrateChart([frame, frame, frame], "station-test");
  if ("error" in result) throw new Error(result.error);
  expect(result.heldOut.patchCount).toBe(6);
  // Cyan lies slightly outside the sRGB gamut, so an ideal sRGB camera clips it.
  const inGamut = result.patches.filter(({ name }) => name !== "Cyan");
  expect(Math.max(...inGamut.map(({ error }) => error))).toBeLessThan(2);
  expect(result.heldOut.mean).toBeLessThan(1.5);
  expect(result.patches.find(({ name }) => name === "Cyan")!.error).toBeLessThan(chartTargets.max);
  expect(result.passed).toBe(true);
  expect(result.patches.find(({ name }) => name === "Light skin")).toMatchObject({ heldOut: true });
  const entry = stationEntry(result.calibration, new Date("2026-11-27T08:00:00Z"), { exposureTime: 120 }, true, "research");
  expect(stationEntry(result.calibration, new Date())).not.toHaveProperty("camera");
  expect(stationEntry(result.calibration, new Date()).mode).toBe("manual");
  expect(entry).toMatchObject({
    mode: "research", checkedAt: "2026-11-27T08:00:00.000Z", camera: { exposureTime: 120 }, whiteReference: true,
    calibration: { revision: "station-test", white: [...d65] },
  });
  expect(entry.calibration.matrix).toHaveLength(12);
  expect(calibrationRevision(new Date("2026-11-27T19:05:41Z"))).toBe("station-20261127-1905");
});

it("rejects too few frames, clipped patches and an upside-down chart", () => {
  const frame = samplePatches(paintChart(cameraRgb(0.85)));
  expect(calibrateChart([frame], "x")).toEqual({ error: "frames" });
  const bright = samplePatches(paintChart(cameraRgb(1.6)));
  expect(calibrateChart([bright, bright, bright], "x")).toEqual({ error: "clipping" });
  const flipped = samplePatches(paintChart(cameraRgb(0.85).toReversed()));
  expect(calibrateChart([flipped, flipped, flipped], "x")).toEqual({ error: "orientation" });
});
