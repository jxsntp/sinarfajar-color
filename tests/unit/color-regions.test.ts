import { describe, expect, it } from "vitest";
import { deltaE00 } from "@/domains/color-analysis/delta-e";
import {
  balanceCalibration, labToXyz, linear, pixelLab, regionContrast, skinFeatures, summarizeCapture, xyzToLab,
  type AcceptedFrame, type Calibration, type QualityLimits,
} from "@/domains/color-analysis/measurement";
import { sampleFace, type WhiteReference } from "@/domains/color-analysis/regions";
import { grayReferenceRegion } from "@/domains/color-analysis/stations";
import type { Lab } from "@/domains/color-analysis/swatches";

const srgb: Calibration = {
  revision: "test-srgb",
  matrix: [0.4124564, 0.3575761, 0.1804375, 0, 0.2126729, 0.7151522, 0.072175, 0, 0.0193339, 0.119192, 0.9503041, 0],
  white: [0.95047, 1, 1.08883],
};
const limits: QualityLimits = {
  minFrames: 3, maxContrastDeviation: 0.065, minSharpness: 9, maxClipped: 0.09, maxSkinDifference: 14,
  browFraction: 0.5, maxSkinDeviation: 6, maxReferenceDrift: 3,
};
const size = 240;
type Point = { x: number; y: number };
type RGB = readonly [number, number, number];
const ellipse = (cx: number, cy: number, rx: number, ry: number, count: number): Point[] =>
  Array.from({ length: count }, (_, i) => ({
    x: cx + rx * Math.cos((2 * Math.PI * i) / count), y: cy + ry * Math.sin((2 * Math.PI * i) / count),
  }));
const shapes = {
  leftBrow: [0.4, 0.38, 0.06, 0.015], rightBrow: [0.6, 0.38, 0.06, 0.015],
  leftCheek: [0.39, 0.63, 0.045, 0.04], rightCheek: [0.61, 0.63, 0.045, 0.04], forehead: [0.5, 0.27, 0.07, 0.035],
} as const;
const indexes = {
  leftBrow: [46, 53, 52, 65, 55, 107, 66, 105, 63, 70],
  rightBrow: [276, 283, 282, 295, 285, 336, 296, 334, 293, 300],
  leftCheek: [117, 118, 101, 36, 205, 187, 123, 116],
  rightCheek: [346, 347, 330, 266, 425, 411, 352, 345],
  forehead: [108, 151, 337, 299, 9, 69],
};
function face(edges: Partial<Record<number, Point>> = {}): Point[] {
  const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  Object.assign(points, {
    10: { x: 0.5, y: 0.18 }, 152: { x: 0.5, y: 0.86 }, 234: { x: 0.29, y: 0.5 }, 454: { x: 0.71, y: 0.5 },
    33: { x: 0.4, y: 0.45 }, 263: { x: 0.6, y: 0.45 }, 1: { x: 0.5, y: 0.58 },
    54: { x: 0.33, y: 0.22 }, 284: { x: 0.67, y: 0.22 }, 172: { x: 0.32, y: 0.72 }, 397: { x: 0.68, y: 0.72 },
    176: { x: 0.42, y: 0.83 }, 400: { x: 0.58, y: 0.83 }, 129: { x: 0.46, y: 0.6 }, 358: { x: 0.54, y: 0.6 },
    2: { x: 0.5, y: 0.63 }, 133: { x: 0.46, y: 0.45 }, 362: { x: 0.54, y: 0.45 }, 159: { x: 0.43, y: 0.44 },
    145: { x: 0.43, y: 0.46 }, 386: { x: 0.57, y: 0.44 }, 374: { x: 0.57, y: 0.46 },
    468: { x: 0.43, y: 0.45 }, 473: { x: 0.57, y: 0.45 },
  });
  // Lip outlines: outer edge left to right, then inner edge right to left.
  const lip = (outer: number[], inner: number[], height: number) => [
    ...outer.map((index, i) => [index, 0.44 + (0.12 * i) / 10, 0.75 + height * Math.sin((Math.PI * i) / 10)] as const),
    ...inner.map((index, i) => [index, 0.555 - (0.11 * i) / 10, 0.75 + Math.sign(height) * 0.003 * Math.sin((Math.PI * i) / 10)] as const),
  ];
  for (const [index, x, y] of [
    ...lip([61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291], [308, 415, 310, 311, 312, 13, 82, 81, 80, 191, 78], -0.018),
    ...lip([61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291], [308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78], 0.02),
  ]) points[index] = { x, y };
  Object.assign(points, edges);
  for (const [name, [cx, cy, rx, ry]] of Object.entries(shapes)) {
    const ring = ellipse(cx, cy, rx, ry, indexes[name as keyof typeof indexes].length);
    indexes[name as keyof typeof indexes].forEach((index, i) => { points[index] = ring[i]; });
  }
  return points;
}
const encode = (v: number) => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
const cast = (rgb: RGB, gains: RGB): RGB =>
  rgb.map((v, i) => Math.min(255, encode(linear(v / 255) * gains[i]))) as unknown as RGB;
type Scene = {
  skin?: RGB; brow?: [RGB, RGB]; card?: RGB; rightCheek?: RGB; hair?: boolean; gains?: RGB; lips?: RGB;
};
function paint({
  skin = [196, 150, 126], brow = [[52, 40, 36], [120, 92, 80]], card = [128, 128, 128], rightCheek, hair, gains = [1, 1, 1],
  lips = [168, 92, 96],
}: Scene = {}) {
  const data = new Uint8ClampedArray(size * size * 4);
  const inside = (x: number, y: number, [cx, cy, rx, ry]: readonly number[], grow = 1.15) =>
    ((x / size - cx) / (rx * grow)) ** 2 + ((y / size - cy) / (ry * grow)) ** 2 <= 1;
  const [left, top, width, height] = grayReferenceRegion;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const checker = (x + y) % 2 === 0;
      let rgb: RGB = skin;
      if (inside(x, y, shapes.leftBrow) || inside(x, y, shapes.rightBrow)) rgb = checker ? brow[0] : brow[1];
      else if (rightCheek && inside(x, y, shapes.rightCheek)) rgb = rightCheek;
      else if (hair && inside(x, y, shapes.forehead)) rgb = checker ? [30, 24, 20] : skin;
      else if (inside(x, y, [0.5, 0.75, 0.065, 0.022], 1)) rgb = lips;
      else if (x / size >= left && x / size <= left + width && y / size >= top && y / size <= top + height) rgb = card;
      const out = cast(rgb, gains);
      data.set([...out, 255], (y * size + x) * 4);
    }
  }
  return { width: size, height: size, data, colorSpace: "srgb" } as ImageData;
}
const frameOf = (result: ReturnType<typeof sampleFace>) => {
  if (!("frame" in result)) throw new Error("expected a frame, got " + result.error);
  return result.frame;
};
const auto: WhiteReference = { region: grayReferenceRegion, mode: "auto" };
const required: WhiteReference = { region: grayReferenceRegion, mode: "required" };

describe("color measurement", () => {
  it("round-trips Lab through XYZ and derives skin features", () => {
    const lab: Lab = [62, 11.5, 19.25];
    const back = xyzToLab(labToXyz(lab, srgb.white), srgb.white);
    back.forEach((value, i) => expect(value).toBeCloseTo(lab[i], 9));
    const features = skinFeatures([65, 10, 20]);
    expect(features.chroma).toBeCloseTo(Math.hypot(10, 20), 12);
    expect(features.hue).toBeCloseTo(63.4349, 4);
    expect(features.ita).toBeCloseTo(36.8699, 4);
    expect(skinFeatures([40, -5, -5]).hue).toBeCloseTo(225, 9);
  });

  it("white-balances a calibration so the measured reference becomes neutral", () => {
    const warm = pixelLab([150, 128, 104], srgb);
    const balanced = balanceCalibration(srgb, warm)!;
    const [l, a, b] = pixelLab([150, 128, 104], balanced);
    expect(l).toBeCloseTo(warm[0], 4);
    expect(Math.hypot(a, b)).toBeLessThan(1e-4);
    const neutral = balanceCalibration(srgb, pixelLab([128, 128, 128], srgb))!;
    neutral.matrix.forEach((value, i) => expect(value).toBeCloseTo(srgb.matrix[i], 4));
    expect(balanceCalibration(srgb, [0, 0, 0])).toBeNull();
  });

  it("summarizes skin, rejects drifting skin and never mixes balanced with unbalanced frames", () => {
    const frame = (skin: Lab, reference?: Lab): AcceptedFrame => ({ sides: [0.2, 0.22], skin, ...(reference ? { reference } : {}) });
    const plain = [frame([60, 12, 18]), frame([61, 12, 19]), frame([60, 13, 18])];
    const summary = summarizeCapture(plain, limits)!;
    expect(summary).toMatchObject({ balanced: false, frames: 3, skinLab: [60, 12, 18] });
    expect(summary.skin.chroma).toBeCloseTo(Math.hypot(12, 18), 9);
    expect(summarizeCapture([...plain, frame([70, 20, 30])], limits)).toBeNull();

    const card: Lab = [54, 1, 3];
    const referenced = [frame([58, 10, 16], card), frame([58, 10, 16], card), frame([58, 11, 16], card)];
    expect(summarizeCapture([...referenced, ...plain], limits, "auto")).toMatchObject({ balanced: true, frames: 3 });
    expect(summarizeCapture([...referenced, ...plain], limits, "off")).toMatchObject({ balanced: false, frames: 3 });
    expect(summarizeCapture(plain, limits, "auto")).toMatchObject({ balanced: false });
    expect(summarizeCapture(plain, limits, "required")).toBeNull();
    expect(summarizeCapture([...referenced.slice(0, 2), ...plain.slice(0, 2)], limits, "auto")).toBeNull();
    const drifted = [...referenced, frame([58, 10, 16], [54, 9, 14])];
    expect(summarizeCapture(drifted, limits, "required")).toMatchObject({ balanced: true, frames: 3 });
  });
});

describe("face regions", () => {
  it("measures brow contrast from the darkest brow pixels and skin from the cheeks", () => {
    const skin: RGB = [196, 150, 126];
    // The checker brow is half dark pixels, so 40% keeps only the dark ones.
    const frame = frameOf(sampleFace(paint({ skin }), [face()], srgb, { ...limits, browFraction: 0.4 }));
    const skinLab = pixelLab(skin, srgb);
    const dark = pixelLab([52, 40, 36], srgb)[0];
    frame.sides.forEach((side) => expect(side).toBeCloseTo(regionContrast(skinLab[0], dark)!, 2));
    expect(deltaE00(frame.skin, skinLab)).toBeLessThan(0.01);
    expect(frame.reference).toBeUndefined();
    const whole = frameOf(sampleFace(paint({ skin }), [face()], srgb, { ...limits, browFraction: 1 }));
    expect(whole.sides[0]).toBeLessThan(frame.sides[0] - 0.05);
  });

  it("rejects missing, extra and turned faces and uneven cheek lighting", () => {
    const image = paint();
    expect(sampleFace(image, [], srgb, limits)).toEqual({ error: "no_face" });
    expect(sampleFace(image, [face(), face()], srgb, limits)).toEqual({ error: "multiple_faces" });
    expect(sampleFace(image, [face({ 1: { x: 0.58, y: 0.58 } })], srgb, limits)).toMatchObject({ error: "pose" });
    expect(sampleFace(paint({ rightCheek: [120, 90, 80] }), [face()], srgb, limits)).toMatchObject({ error: "lighting" });
  });

  it("skips a forehead covered by hair", () => {
    const covered = frameOf(sampleFace(paint({ hair: true }), [face()], srgb, limits));
    expect(deltaE00(covered.skin, pixelLab([196, 150, 126], srgb))).toBeLessThan(0.01);
  });

  it("uses a gray card to undo a color cast and requires it when configured", () => {
    const truth = pixelLab([196, 150, 126], srgb);
    const gains: RGB = [1.2, 1, 0.75];
    const raw = frameOf(sampleFace(paint({ gains }), [face()], srgb, limits));
    const balanced = frameOf(sampleFace(paint({ gains }), [face()], srgb, limits, auto));
    expect(balanced.reference).toBeDefined();
    expect(deltaE00(raw.skin, truth)).toBeGreaterThan(4);
    expect(deltaE00(balanced.skin, truth)).toBeLessThan(deltaE00(raw.skin, truth) / 3);

    const noCard = paint({ card: [200, 40, 40] });
    expect(frameOf(sampleFace(noCard, [face()], srgb, limits, auto)).reference).toBeUndefined();
    expect(sampleFace(noCard, [face()], srgb, limits, required)).toMatchObject({ error: "reference" });
    const wide = [face({ 454: { x: 0.78, y: 0.5 } })];
    expect(sampleFace(paint(), wide, srgb, limits, required)).toMatchObject({ error: "reference" });
  });
});

it("reports what it measured, including for a rejected frame", () => {
  const uneven = sampleFace(paint({ rightCheek: [120, 90, 80] }), [face()], srgb, limits);
  expect(uneven).toMatchObject({ error: "lighting" });
  const detail = uneven.detail!;
  expect(detail.cheeks).toHaveLength(2);
  expect(detail.cheeks[0].lab[0] - detail.cheeks[1].lab[0]).toBeGreaterThan(limits.maxSkinDifference);
  expect(detail.brows).toHaveLength(2);
  expect(detail.skin).toBeUndefined();
  expect(detail.geometry).toMatchObject({ rollDegrees: 0, faceWidth: expect.closeTo(0.42, 6) });
  expect(detail.geometry!.lengthToWidth).toBeCloseTo(0.68 / 0.42, 6);
  const accepted = sampleFace(paint(), [face()], srgb, limits, auto);
  expect(accepted).toMatchObject({ detail: { reference: { used: true, overlapsFace: false } } });
  expect(accepted.detail?.skin?.ita).toBeGreaterThan(0);
  const plain = sampleFace(paint(), [face()], srgb, limits);
  const skin = pixelLab([196, 150, 126], srgb), lip = pixelLab([168, 92, 96], srgb);
  expect(plain.detail?.lips?.contrast).toBeCloseTo(regionContrast(skin[0], lip[0])!, 1);
  expect(plain.detail?.lips?.redness).toBeCloseTo(lip[1] - skin[1], 0);
  expect(plain.detail?.geometry?.eyes.spacing).toBeCloseTo(0.08 / 0.06, 6);
});
