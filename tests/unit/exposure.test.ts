import { expect, it } from "vitest";
import { exposureBand, exposureStep, regionLuma } from "@/domains/color-analysis/exposure";

it("leaves a face inside the band alone, including darker skin above the floor", () => {
  expect(exposureStep(130, { exposureCompensation: { min: -2, max: 2, step: 0.1 } }, {})).toEqual({ kind: "ok" });
  expect(exposureStep(exposureBand.low, {}, {})).toEqual({ kind: "ok" });
  expect(exposureStep(NaN, {}, {})).toEqual({ kind: "ok" });
});

it("brightens a dark face with the least invasive control the camera offers", () => {
  const compensation = exposureStep(50, { exposureCompensation: { min: -2, max: 2, step: 0.5 } }, { exposureCompensation: 0 });
  expect(compensation).toEqual({ kind: "adjust", constraints: { exposureCompensation: 2 } });
  // Compensation at its limit falls through to a manual exposure time.
  const time = exposureStep(50, {
    exposureCompensation: { min: -2, max: 2, step: 0.5 }, exposureMode: ["continuous", "manual"],
    exposureTime: { min: 1, max: 1000 },
  }, { exposureCompensation: 2, exposureTime: 100 });
  expect(time.kind === "adjust" && time.constraints.exposureMode).toBe("manual");
  expect(time.kind === "adjust" && Number(time.constraints.exposureTime)).toBeGreaterThan(100);
  const brightness = exposureStep(50, { brightness: { min: 0, max: 255, step: 1 } }, { brightness: 128 });
  expect(brightness.kind === "adjust" && Number(brightness.constraints.brightness)).toBeGreaterThan(128);
  // A small correction still moves at least one step.
  expect(exposureStep(90, { exposureCompensation: { min: -2, max: 2, step: 0.5 } }, { exposureCompensation: 0 }))
    .toEqual({ kind: "adjust", constraints: { exposureCompensation: 0.5 } });
});

it("darkens a face near clipping and reports when nothing can move further", () => {
  const darker = exposureStep(240, { exposureCompensation: { min: -2, max: 2, step: 0.1 } }, { exposureCompensation: 0 });
  expect(darker.kind === "adjust" && Number(darker.constraints.exposureCompensation)).toBeLessThan(0);
  expect(exposureStep(40, {}, {})).toEqual({ kind: "limit" });
  expect(exposureStep(40, { exposureCompensation: { min: -2, max: 2, step: 0.5 } }, { exposureCompensation: 2 }))
    .toEqual({ kind: "limit" });
  expect(regionLuma(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]))).toBeCloseTo(127.5);
});
