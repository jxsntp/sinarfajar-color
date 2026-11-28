import { expect, it } from "vitest";
import {
  expressionFrom, faceGeometry, flatten, summarizeFeatures, type Point3,
} from "@/domains/color-analysis/face-geometry";

// A symmetric pixel-space face with a 100 px cheekbone width and round numbers.
function layout(overrides: Record<number, Point3> = {}): Point3[] {
  const points: Point3[] = Array.from({ length: 478 }, () => ({ x: 50, y: 50 }));
  const set: Record<number, Point3> = {
    234: { x: 0, y: 40 }, 454: { x: 100, y: 40 }, 10: { x: 50, y: -40 }, 152: { x: 50, y: 120 },
    54: { x: 15, y: -20 }, 284: { x: 85, y: -20 }, 172: { x: 10, y: 80 }, 397: { x: 90, y: 80 },
    176: { x: 35, y: 115 }, 400: { x: 65, y: 115 }, 61: { x: 30, y: 90 }, 291: { x: 70, y: 90 },
    129: { x: 40, y: 60 }, 358: { x: 60, y: 60 }, 9: { x: 50, y: 10 }, 2: { x: 50, y: 70 }, 1: { x: 50, y: 55 },
    33: { x: 15, y: 20 }, 133: { x: 35, y: 20 }, 362: { x: 65, y: 20 }, 263: { x: 85, y: 20 },
    159: { x: 25, y: 16 }, 145: { x: 25, y: 24 }, 386: { x: 75, y: 16 }, 374: { x: 75, y: 24 },
    468: { x: 25, y: 20 }, 473: { x: 75, y: 20 },
    0: { x: 50, y: 84 }, 13: { x: 50, y: 88 }, 14: { x: 50, y: 92 }, 17: { x: 50, y: 98 },
    107: { x: 40, y: 8 }, 66: { x: 33, y: 5 }, 105: { x: 25, y: 4 }, 63: { x: 18, y: 5 }, 70: { x: 10, y: 8 },
    336: { x: 60, y: 8 }, 296: { x: 67, y: 5 }, 334: { x: 75, y: 4 }, 293: { x: 82, y: 5 }, 300: { x: 90, y: 8 },
    116: { x: 20, y: 45, z: -4 }, 345: { x: 80, y: 45, z: -4 },
    ...overrides,
  };
  for (const [index, point] of Object.entries(set)) points[Number(index)] = point;
  points[1] = { ...points[1], z: -14 };
  return points;
}

it("measures facial proportions from landmarks", () => {
  const geometry = faceGeometry(layout(), 400)!;
  expect(geometry.lengthToWidth).toBeCloseTo(1.6, 9);
  expect(geometry.widths).toEqual({
    forehead: expect.closeTo(0.7, 9), jaw: expect.closeTo(0.8, 9), chin: expect.closeTo(0.3, 9),
    nose: expect.closeTo(0.2, 9), mouth: expect.closeTo(0.4, 9),
  });
  // At (10, 80): up to (0, 40) is (-10, -40), down to (50, 120) is (40, 40).
  const jaw = Math.acos((-10 * 40 + -40 * 40) / (Math.hypot(10, 40) * Math.hypot(40, 40))) * 180 / Math.PI;
  expect(geometry.jawAngle).toBeCloseTo(jaw, 9);
  expect(geometry.chinDepth).toBeCloseTo(40 / 80, 9);
  expect(geometry.middleToLowerThird).toBeCloseTo(60 / 50, 9);
  expect(geometry.cheekboneHeight).toBeCloseTo((40 - 20) / (90 - 20), 9);
  expect(geometry.cheekProminence).toBeCloseTo((-4 - -14) / 100, 9);
  expect(geometry.eyes).toEqual({
    width: expect.closeTo(0.2, 9), openness: expect.closeTo(0.4, 9), spacing: expect.closeTo(1.5, 9),
    irisDistance: expect.closeTo(0.5, 9),
  });
  expect(geometry.browArch).toBeCloseTo(4 / 30, 9);
  expect(geometry.lips).toEqual({ upper: expect.closeTo(0.1, 9), lower: expect.closeTo(0.15, 9) });
  expect(geometry).toMatchObject({ faceWidth: 0.25, rollDegrees: 0, yaw: 0 });
});

it("rejects incomplete meshes and reports missing depth as unavailable", () => {
  expect(faceGeometry(layout().slice(0, 468), 400)).toBeNull();
  expect(faceGeometry(layout({ 454: { x: 0, y: 40 } }), 400)).toBeNull();
  const flat = layout().map(({ x, y }) => ({ x, y }));
  expect(faceGeometry(flat, 400)?.cheekProminence).toBeNull();
});

it("classifies a neutral expression from blendshape scores", () => {
  const scores = (values: Record<string, number>) => Object.entries(values).map(([categoryName, score]) => ({ categoryName, score }));
  expect(expressionFrom(undefined)).toBeNull();
  expect(expressionFrom(scores({ jawOpen: 0.05, mouthSmileLeft: 0.1, mouthSmileRight: 0.2, eyeBlinkLeft: 0.1 })))
    .toEqual({ jawOpen: 0.05, smile: expect.closeTo(0.15, 9), blink: 0.1, neutral: true });
  expect(expressionFrom(scores({ mouthSmileLeft: 0.6, mouthSmileRight: 0.5 }))?.neutral).toBe(false);
  expect(expressionFrom(scores({ jawOpen: 0.4 }))?.neutral).toBe(false);
  expect(expressionFrom(scores({ eyeBlinkRight: 0.9 }))?.neutral).toBe(false);
});

it("summarizes features with median and spread across frames", () => {
  expect(flatten({ a: 1, b: { c: 2, d: null, e: NaN }, f: [3] })).toEqual({ a: 1, "b.c": 2 });
  const summary = summarizeFeatures([{ jaw: 120, chin: 0.5 }, { jaw: 124 }, { jaw: 130, chin: 0.7 }]);
  expect(summary.jaw).toEqual({ median: 124, spread: 4, frames: 3 });
  expect(summary.chin).toEqual({ median: expect.closeTo(0.6, 9), spread: expect.closeTo(0.1, 9), frames: 2 });
});
