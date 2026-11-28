import {
  balanceCalibration, medianLab, pixelLab, regionContrast, skinFeatures, type SkinFeatures,
  type AcceptedFrame, type Calibration, type CaptureFailure, type QualityLimits, type WhiteReferenceMode,
} from "./measurement";
import type { Lab } from "./swatches";
import { faceGeometry, type Expression, type FaceGeometry, type Point3 } from "./face-geometry";

type Point = Point3;
/** Normalized [left, top, width, height] of a frame region. */
export type FrameRegion = readonly [number, number, number, number];
export type WhiteReference = { region: FrameRegion; mode: Exclude<WhiteReferenceMode, "off"> };
// Face Landmarker mesh indices. Cheek pairs mirror each other across the face.
const browMasks = [
  [46, 53, 52, 65, 55, 107, 66, 105, 63, 70],
  [276, 283, 282, 295, 285, 336, 296, 334, 293, 300],
] as const;
const cheekMasks = [
  [117, 118, 101, 36, 205, 187, 123, 116],
  [346, 347, 330, 266, 425, 411, 352, 345],
] as const;
const foreheadMask = [108, 151, 337, 299, 9, 69] as const;
// Each lip runs along its outer edge from the left mouth corner, then back along the inner edge.
const lipMasks = [
  [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191, 78],
  [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78],
] as const;
/** Share of the lightest and of the darkest skin pixels discarded as highlights and shadows. */
export const skinTrim = 0.1;
const maxSkinVariation = 14;
export const referenceLimits = { minLightness: 20, maxLightness: 95, maxChroma: 15, maxVariation: 6 } as const;

type Pixels = { l: number[]; a: number[]; b: number[] };
function collect(
  image: ImageData, mask: Point[], calibration: Calibration, limits: QualityLimits, minSharpness: number,
): Pixels | { error: "region" | "clipping" | "blur" } {
  const { width, height, data } = image;
  const left = Math.max(1, Math.floor(Math.min(...mask.map((p) => p.x))));
  const right = Math.min(width - 2, Math.ceil(Math.max(...mask.map((p) => p.x))));
  const top = Math.max(1, Math.floor(Math.min(...mask.map((p) => p.y))));
  const bottom = Math.min(height - 2, Math.ceil(Math.max(...mask.map((p) => p.y))));
  let pixels = 0, clipped = 0, sharpness = 0;
  const l: number[] = [], a: number[] = [], b: number[] = [];
  const gray = (i: number) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      let inside = false;
      for (let j = 0, k = mask.length - 1; j < mask.length; k = j++) {
        const u = mask[j], v = mask[k];
        if ((u.y > y) !== (v.y > y) && x < (v.x - u.x) * (y - u.y) / (v.y - u.y) + u.x) inside = !inside;
      }
      if (!inside) continue;
      const i = (y * width + x) * 4;
      pixels++;
      const rgb = [data[i], data[i + 1], data[i + 2]] as const;
      if (Math.max(...rgb) < 8 || Math.min(...rgb) > 247) {
        clipped++;
        continue;
      }
      const lab = pixelLab(rgb, calibration);
      l.push(lab[0]); a.push(lab[1]); b.push(lab[2]);
      const laplacian = 4 * gray(i) - gray(i - 4) - gray(i + 4) - gray(i - width * 4) - gray(i + width * 4);
      sharpness += laplacian ** 2;
    }
  }
  if (pixels < 24) return { error: "region" };
  if (clipped / pixels > limits.maxClipped) return { error: "clipping" };
  if (sharpness / l.length < minSharpness) return { error: "blur" };
  return { l, a, b };
}

const byLightness = ({ l }: Pixels) => l.map((_, i) => i).sort((p, q) => l[p] - l[q]);
/** Trimmed median color and lightness spread of a skin or reference region. */
export function trimmedColor(pixels: Pixels, trim = skinTrim) {
  const order = byLightness(pixels);
  const cut = Math.floor(order.length * trim);
  const kept = order.slice(cut, order.length - cut);
  const lab = medianLab(kept.map((i) => [pixels.l[i], pixels.a[i], pixels.b[i]] as const));
  if (!lab || kept.length < 12) return null;
  const mean = kept.reduce((sum, i) => sum + pixels.l[i], 0) / kept.length;
  const variation = Math.sqrt(kept.reduce((sum, i) => sum + (pixels.l[i] - mean) ** 2, 0) / kept.length);
  return { lab, variation };
}
/** Mean lightness of the darkest share of brow pixels. */
export function browLightness(pixels: Pixels, fraction: number) {
  const order = byLightness(pixels);
  const kept = order.slice(0, Math.max(1, Math.ceil(order.length * Math.min(1, Math.max(0, fraction)))));
  return kept.reduce((sum, i) => sum + pixels.l[i], 0) / kept.length;
}

const rectangle = ([x, y, w, h]: FrameRegion, image: ImageData): Point[] => [
  { x: x * image.width, y: y * image.height }, { x: (x + w) * image.width, y: y * image.height },
  { x: (x + w) * image.width, y: (y + h) * image.height }, { x: x * image.width, y: (y + h) * image.height },
];
/** Measures a neutral card in a fixed frame region under the base calibration. */
export function sampleReference(
  image: ImageData, region: FrameRegion, calibration: Calibration, limits: QualityLimits,
): { lab: Lab } | null {
  const pixels = collect(image, rectangle(region, image), calibration, limits, 0);
  if ("error" in pixels) return null;
  const color = trimmedColor(pixels);
  if (!color) return null;
  const [l, a, b] = color.lab;
  const { minLightness, maxLightness, maxChroma, maxVariation } = referenceLimits;
  if (l < minLightness || l > maxLightness || Math.hypot(a, b) > maxChroma || color.variation > maxVariation) return null;
  return { lab: color.lab };
}

type Region = { lab: Lab; variation: number };
/** Everything measured in a frame, including values that led to rejection. Diagnostic use only. */
export type FrameDetail = {
  geometry?: FaceGeometry;
  reference?: { lab: Lab | null; used: boolean; overlapsFace: boolean };
  brows: { browLightness: number; skin: Region; contrast: number | null }[];
  cheeks: Region[];
  forehead?: Region | null;
  /** Combined lip color and its lightness contrast and a* (redness) difference against the skin. */
  lips?: (Region & { contrast: number | null; redness: number }) | null;
  skin?: SkinFeatures;
  /** Added by the capture worker from the landmark model's expression scores. */
  expression?: Expression | null;
};
export type FrameSample =
  | { frame: AcceptedFrame; detail: FrameDetail }
  | { error: CaptureFailure; detail?: FrameDetail };

export function sampleFace(
  image: ImageData, faces: Point[][], calibration: Calibration, limits: QualityLimits, reference?: WhiteReference,
): FrameSample {
  if (faces.length !== 1) return { error: faces.length ? "multiple_faces" : "no_face" };
  const points: Point[] = faces[0].map(({ x, y }) => ({ x: x * image.width, y: y * image.height }));
  const faceWidth = Math.abs(points[454]?.x - points[234]?.x);
  const faceHeight = points[152]?.y - points[10]?.y;
  const eyeSpan = Math.abs(points[263]?.x - points[33]?.x);
  const roll = Math.abs(points[263]?.y - points[33]?.y) / eyeSpan;
  const yaw = Math.abs((points[263]?.x + points[33]?.x) / 2 - points[1]?.x) / eyeSpan;
  const detail: FrameDetail = { brows: [], cheeks: [] };
  const geometry = faceGeometry(faces[0].map(({ x, y, z }) => ({ x: x * image.width, y: y * image.height,
    ...(z === undefined ? {} : { z: z * image.width }) })), image.width);
  if (geometry) detail.geometry = geometry;
  if (!Number.isFinite(roll + yaw + faceWidth + faceHeight) || faceWidth < image.width / 5 ||
      faceHeight < image.height / 4 || faceHeight > image.height * 0.9 || roll > 0.16 || yaw > 0.14 ||
      points[10].y < 2 || points[152].y > image.height - 2 ||
      Math.min(points[234].x, points[454].x) < 2 || Math.max(points[234].x, points[454].x) > image.width - 2) {
    return { error: "pose", detail };
  }

  let measured = calibration;
  let referenceLab: Lab | undefined;
  if (reference) {
    const [rx, ry, rw, rh] = reference.region;
    const faceLeft = Math.min(points[234].x, points[454].x) / image.width;
    const faceRight = Math.max(points[234].x, points[454].x) / image.width;
    const overlapsFace = faceLeft < rx + rw && faceRight > rx && points[10].y / image.height < ry + rh &&
      points[152].y / image.height > ry;
    const card = overlapsFace ? null : sampleReference(image, reference.region, calibration, limits);
    const balanced = card && balanceCalibration(calibration, card.lab);
    detail.reference = { lab: card?.lab ?? null, used: Boolean(card && balanced), overlapsFace };
    if (card && balanced) {
      measured = balanced;
      referenceLab = card.lab;
    } else if (reference.mode === "required") return { error: "reference", detail };
  }

  const at = (indexes: readonly number[]) => indexes.map((i) => points[i]);
  const sides: number[] = [];
  for (const indexes of browMasks) {
    const brow = at(indexes);
    const browPixels = collect(image, brow, measured, limits, limits.minSharpness);
    if ("error" in browPixels) return { ...browPixels, detail };
    const strip = collect(image, brow.map(({ x, y }) => ({ x, y: y - faceHeight * 0.055 })), measured, limits, 0);
    if ("error" in strip) return { ...strip, detail };
    const skin = trimmedColor(strip);
    if (!skin) return { error: "region", detail };
    const browL = browLightness(browPixels, limits.browFraction);
    const contrast = regionContrast(skin.lab[0], browL);
    detail.brows.push({ browLightness: browL, skin, contrast });
    if (skin.variation > maxSkinVariation || contrast === null) return { error: "region", detail };
    sides.push(contrast);
  }

  for (const indexes of cheekMasks) {
    const pixels = collect(image, at(indexes), measured, limits, 0);
    if ("error" in pixels) return { ...pixels, detail };
    const color = trimmedColor(pixels);
    if (!color) return { error: "region", detail };
    detail.cheeks.push(color);
    if (color.variation > maxSkinVariation) return { error: "region", detail };
  }
  const cheeks = detail.cheeks.map(({ lab }) => lab);
  if (Math.abs(cheeks[0][0] - cheeks[1][0]) > limits.maxSkinDifference) return { error: "lighting", detail };
  // The forehead is optional because hair or glasses often cover it.
  const foreheadPixels = collect(image, at(foreheadMask), measured, limits, 0);
  const forehead = "error" in foreheadPixels ? null : trimmedColor(foreheadPixels);
  detail.forehead = forehead;
  const regions = forehead && forehead.variation <= maxSkinVariation ? [...cheeks, forehead.lab] : cheeks;
  const skin = [0, 1, 2].map((axis) => regions.reduce((sum, lab) => sum + lab[axis], 0) / regions.length) as unknown as Lab;
  detail.skin = skinFeatures(skin);
  // Lip color is optional; an open mouth or a beard can make it unusable.
  const lipPixels = lipMasks.map((indexes) => collect(image, at(indexes), measured, limits, 0));
  const lip = lipPixels.every((pixels): pixels is Pixels => !("error" in pixels))
    ? trimmedColor({ l: lipPixels.flatMap(({ l }) => l), a: lipPixels.flatMap(({ a }) => a), b: lipPixels.flatMap(({ b }) => b) })
    : null;
  detail.lips = lip && { ...lip, contrast: regionContrast(skin[0], lip.lab[0]), redness: lip.lab[1] - skin[1] };
  return {
    frame: { sides: [sides[0], sides[1]], skin, ...(referenceLab ? { reference: referenceLab } : {}) },
    detail,
  };
}
