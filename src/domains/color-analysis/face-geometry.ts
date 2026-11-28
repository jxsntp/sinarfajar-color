import { median } from "./measurement";

/**
 * Approximate facial proportions from Face Landmarker mesh points (pixel x and y, with z in the same scale as x).
 * These are descriptive measurements for research. No face shape or jewelry rule is derived from them.
 */
export type Point3 = { x: number; y: number; z?: number };

// Mesh indices. Pairs are image-left then image-right.
const mesh = {
  top: 10, chin: 152, glabella: 9, subnasale: 2, noseTip: 1,
  cheekbones: [234, 454], forehead: [54, 284], jawCorners: [172, 397], chinSides: [176, 400], mouth: [61, 291],
  nose: [129, 358], cheekCentres: [116, 345],
  eyeOuter: [33, 263], eyeInner: [133, 362], eyeTop: [159, 386], eyeBottom: [145, 374], irises: [468, 473],
  upperLipTop: 0, upperLipBottom: 13, lowerLipTop: 14, lowerLipBottom: 17,
  // Lower face outline from the left jaw corner, through the chin, to the right jaw corner.
  chinArc: [172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397],
  // Upper brow edges from the inner end outward.
  browTops: [[107, 66, 105, 63, 70], [336, 296, 334, 293, 300]],
} as const;

export type FaceGeometry = {
  /** Face height from the top mesh point to the chin, divided by cheekbone width. The top point sits below the hairline. */
  lengthToWidth: number;
  /** Widths divided by cheekbone width. */
  widths: { forehead: number; jaw: number; chin: number; nose: number; mouth: number };
  /** Mean angle in degrees at the jaw corners, between the line up to the cheekbone and the line down to the chin. */
  jawAngle: number;
  /** Depth of the chin arc below the line between the jaw corners, divided by that line's length. */
  chinDepth: number;
  /** Brow line to nose base, divided by nose base to chin. The upper third needs the hairline. */
  middleToLowerThird: number;
  /** Cheekbone height between the eye line (0) and the mouth line (1). */
  cheekboneHeight: number;
  /** Approximate forward depth of the cheek centres relative to the nose tip, divided by cheekbone width. */
  cheekProminence: number | null;
  eyes: {
    /** Mean eye width divided by cheekbone width. */
    width: number;
    /** Mean eye opening divided by eye width. */
    openness: number;
    /** Distance between the inner eye corners divided by mean eye width. */
    spacing: number;
    /** Distance between the iris centres divided by cheekbone width. */
    irisDistance: number | null;
  };
  /** Mean brow arch height divided by brow length. */
  browArch: number;
  /** Lip heights divided by mouth width. */
  lips: { upper: number; lower: number };
  /** Fraction of frame width covered by the cheekbones. */
  faceWidth: number;
  /** Eye-line tilt in degrees. */
  rollDegrees: number;
  /** Nose offset from the eye midpoint, divided by eye span. */
  yaw: number;
};

const distance = (a: Point3, b: Point3) => Math.hypot(b.x - a.x, b.y - a.y);
/** Perpendicular distance of a point from the line through a and b. */
function offset(point: Point3, a: Point3, b: Point3) {
  const length = distance(a, b);
  return length ? Math.abs((b.x - a.x) * (a.y - point.y) - (a.x - point.x) * (b.y - a.y)) / length : NaN;
}
function angle(vertex: Point3, a: Point3, b: Point3) {
  const u = [a.x - vertex.x, a.y - vertex.y], v = [b.x - vertex.x, b.y - vertex.y];
  const cos = (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]));
  return Math.acos(Math.min(1, Math.max(-1, cos))) * 180 / Math.PI;
}
/** Vertical position of y between two reference heights, as a 0–1 fraction. */
const between = (y: number, from: number, to: number) => (y - from) / (to - from);

export function faceGeometry(points: Point3[], frameWidth: number): FaceGeometry | null {
  if (points.length < 478) return null;
  const p = (index: number) => points[index];
  const pair = ([left, right]: readonly [number, number]) => distance(p(left), p(right));
  const cheekbones = pair(mesh.cheekbones);
  if (!(cheekbones > 0)) return null;
  const [eyeLeft, eyeRight] = [distance(p(33), p(133)), distance(p(362), p(263))];
  const eyeWidth = (eyeLeft + eyeRight) / 2;
  const openness = (distance(p(159), p(145)) / eyeLeft + distance(p(386), p(374)) / eyeRight) / 2;
  const eyeLine = (p(33).y + p(263).y) / 2;
  const mouthLine = (p(61).y + p(291).y) / 2;
  const [jawLeft, jawRight] = mesh.jawCorners.map((corner, side) => angle(p(corner), p(mesh.cheekbones[side]), p(mesh.chin)));
  const arch = mesh.browTops.map((indexes) => {
    const brow = indexes.map(p);
    const ends = [brow[0], brow[brow.length - 1]];
    return Math.max(...brow.slice(1, -1).map((point) => offset(point, ends[0], ends[1]))) / distance(ends[0], ends[1]);
  });
  const zValues = [...mesh.cheekCentres, mesh.noseTip].map((index) => p(index).z);
  const cheekProminence = zValues.every((z): z is number => Number.isFinite(z))
    ? ((zValues[0] + zValues[1]) / 2 - zValues[2]) / cheekbones : null;
  const irisDistance = Number.isFinite(p(468)?.x + p(473)?.x) ? pair(mesh.irises) / cheekbones : null;
  const geometry: FaceGeometry = {
    lengthToWidth: distance(p(mesh.top), p(mesh.chin)) / cheekbones,
    widths: {
      forehead: pair(mesh.forehead) / cheekbones, jaw: pair(mesh.jawCorners) / cheekbones,
      chin: pair(mesh.chinSides) / cheekbones, nose: pair(mesh.nose) / cheekbones, mouth: pair(mesh.mouth) / cheekbones,
    },
    jawAngle: (jawLeft + jawRight) / 2,
    chinDepth: offset(p(mesh.chin), p(mesh.jawCorners[0]), p(mesh.jawCorners[1])) / pair(mesh.jawCorners),
    middleToLowerThird: distance(p(mesh.glabella), p(mesh.subnasale)) / distance(p(mesh.subnasale), p(mesh.chin)),
    cheekboneHeight: between((p(234).y + p(454).y) / 2, eyeLine, mouthLine),
    cheekProminence,
    eyes: {
      width: eyeWidth / cheekbones, openness,
      spacing: distance(p(133), p(362)) / eyeWidth, irisDistance,
    },
    browArch: (arch[0] + arch[1]) / 2,
    lips: {
      upper: distance(p(mesh.upperLipTop), p(mesh.upperLipBottom)) / pair(mesh.mouth),
      lower: distance(p(mesh.lowerLipTop), p(mesh.lowerLipBottom)) / pair(mesh.mouth),
    },
    faceWidth: Math.abs(p(454).x - p(234).x) / frameWidth,
    rollDegrees: Math.atan2(p(263).y - p(33).y, p(263).x - p(33).x) * 180 / Math.PI,
    yaw: Math.abs((p(263).x + p(33).x) / 2 - p(1).x) / distance(p(33), p(263)),
  };
  return finite(geometry) ? geometry : null;
}
function finite(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "object" && Object.values(value as object).every(finite);
}

/** Expression scores from Face Landmarker blendshapes, 0–1. */
export type Expression = { jawOpen: number; smile: number; blink: number; neutral: boolean };
export const neutralLimits = { jawOpen: 0.15, smile: 0.3, blink: 0.5 } as const;
export function expressionFrom(categories: readonly { categoryName: string; score: number }[] | undefined): Expression | null {
  if (!categories?.length) return null;
  const score = (name: string) => categories.find((item) => item.categoryName === name)?.score ?? 0;
  const jawOpen = score("jawOpen");
  const smile = (score("mouthSmileLeft") + score("mouthSmileRight")) / 2;
  const blink = Math.max(score("eyeBlinkLeft"), score("eyeBlinkRight"));
  return {
    jawOpen, smile, blink,
    neutral: jawOpen <= neutralLimits.jawOpen && smile <= neutralLimits.smile && blink <= neutralLimits.blink,
  };
}

/** Flattens nested numeric fields into dotted keys. */
export function flatten(value: unknown, prefix = ""): Record<string, number> {
  if (typeof value === "number") return Number.isFinite(value) ? { [prefix]: value } : {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.assign({}, ...Object.entries(value).map(([key, item]) => flatten(item, prefix ? prefix + "." + key : key)));
}
export type FeatureSummary = Record<string, { median: number; spread: number; frames: number }>;
/** Median and median absolute deviation for each feature across frames. */
export function summarizeFeatures(frames: readonly Record<string, number>[]): FeatureSummary {
  const keys = [...new Set(frames.flatMap((frame) => Object.keys(frame)))].sort();
  return Object.fromEntries(keys.flatMap((key) => {
    const values = frames.flatMap((frame) => key in frame ? [frame[key]] : []);
    const center = median(values);
    if (center === null) return [];
    return [[key, { median: center, spread: median(values.map((value) => Math.abs(value - center)))!, frames: values.length }]];
  }));
}
