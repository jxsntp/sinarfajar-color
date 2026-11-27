import { pixelLab, regionContrast, type AcceptedFrame, type Calibration, type CaptureFailure, type QualityLimits } from "./measurement";

type Point = { x: number; y: number };
const browMasks = [
  [46, 53, 52, 65, 55, 107, 66, 105, 63, 70],
  [276, 283, 282, 295, 285, 336, 296, 334, 293, 300],
] as const;

function measureRegion(
  image: ImageData, mask: Point[], calibration: Calibration, limits: QualityLimits, minSharpness: number,
) {
  const { width, height, data } = image;
  const left = Math.max(1, Math.floor(Math.min(...mask.map((p) => p.x))));
  const right = Math.min(width - 2, Math.ceil(Math.max(...mask.map((p) => p.x))));
  const top = Math.max(1, Math.floor(Math.min(...mask.map((p) => p.y))));
  const bottom = Math.min(height - 2, Math.ceil(Math.max(...mask.map((p) => p.y))));
  let pixels = 0, clipped = 0, l = 0, a = 0, b = 0, sharpness = 0, lSquared = 0;
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
      l += lab[0]; a += lab[1]; b += lab[2]; lSquared += lab[0] ** 2;
      const laplacian = 4 * gray(i) - gray(i - 4) - gray(i + 4) - gray(i - width * 4) - gray(i + width * 4);
      sharpness += laplacian ** 2;
    }
  }
  if (pixels < 24) return { error: "region" as const };
  if (clipped / pixels > limits.maxClipped) return { error: "clipping" as const };
  const count = pixels - clipped;
  if (sharpness / count < minSharpness) return { error: "blur" as const };
  const mean = l / count;
  return { l: mean, a: a / count, b: b / count, variation: Math.sqrt(Math.max(0, lSquared / count - mean ** 2)) };
}

export function sampleFace(
  image: ImageData, faces: Point[][], calibration: Calibration, limits: QualityLimits,
): { frame: AcceptedFrame } | { error: CaptureFailure } {
  if (faces.length !== 1) return { error: faces.length ? "multiple_faces" : "no_face" };
  const points = faces[0].map(({ x, y }) => ({ x: x * image.width, y: y * image.height }));
  const faceWidth = Math.abs(points[454]?.x - points[234]?.x);
  const faceHeight = points[152]?.y - points[10]?.y;
  const eyeSpan = Math.abs(points[263]?.x - points[33]?.x);
  const roll = Math.abs(points[263]?.y - points[33]?.y) / eyeSpan;
  const yaw = Math.abs((points[263]?.x + points[33]?.x) / 2 - points[1]?.x) / eyeSpan;
  if (!Number.isFinite(roll + yaw + faceWidth + faceHeight) || faceWidth < image.width / 5 ||
      faceHeight < image.height / 4 || faceHeight > image.height * 0.9 || roll > 0.16 || yaw > 0.14 ||
      points[10].y < 2 || points[152].y > image.height - 2 ||
      Math.min(points[234].x, points[454].x) < 2 || Math.max(points[234].x, points[454].x) > image.width - 2) {
    return { error: "pose" };
  }
  const [left, right] = browMasks.map((indexes) => {
    const brow = indexes.map((i) => points[i]);
    const skin = brow.map(({ x, y }) => ({ x, y: y - faceHeight * 0.055 }));
    return {
      brow: measureRegion(image, brow, calibration, limits, limits.minSharpness),
      skin: measureRegion(image, skin, calibration, limits, 0),
    };
  });
  for (const region of [left.brow, right.brow, left.skin, right.skin]) {
    if (region.error) return { error: region.error };
  }
  if (left.skin.l === undefined || right.skin.l === undefined ||
      left.brow.l === undefined || right.brow.l === undefined) return { error: "region" };
  if (Math.abs(left.skin.l - right.skin.l) > limits.maxSkinDifference) return { error: "lighting" };
  if (left.skin.variation > 14 || right.skin.variation > 14) return { error: "region" };
  const a = regionContrast(left.skin.l, left.brow.l);
  const b = regionContrast(right.skin.l, right.brow.l);
  if (a === null || b === null) return { error: "region" };
  return { frame: {
    sides: [a, b], skinAB: [(left.skin.a + right.skin.a) / 2, (left.skin.b + right.skin.b) / 2],
    skinLightness: (left.skin.l + right.skin.l) / 2,
  } };
}
