import type { Lab } from "./swatches";

const radians = (degrees: number) => degrees * Math.PI / 180;
const degrees = (rad: number) => rad * 180 / Math.PI;
const seventh = (c: number) => c ** 7 / (c ** 7 + 25 ** 7);
const hue = (a: number, b: number) => (degrees(Math.atan2(b, a)) + 360) % 360;

// Sharma, Wu and Dalal supplementary CIEDE2000 test pairs use unit parametric factors.
export function deltaE00([l1, a1, b1]: Lab, [l2, a2, b2]: Lab) {
  const meanC = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const gain = 1 + (1 - Math.sqrt(seventh(meanC))) / 2;
  const c1 = Math.hypot(a1 * gain, b1);
  const c2 = Math.hypot(a2 * gain, b2);
  const h1 = c1 ? hue(a1 * gain, b1) : 0;
  const h2 = c2 ? hue(a2 * gain, b2) : 0;
  const chromatic = c1 * c2 !== 0;
  const rawHue = h2 - h1;
  const diffHue = !chromatic ? 0 : rawHue > 180 ? rawHue - 360 : rawHue < -180 ? rawHue + 360 : rawHue;
  const sumHue = h1 + h2;
  const meanH = !chromatic ? sumHue : Math.abs(rawHue) <= 180 ? sumHue / 2
    : (sumHue + (sumHue < 360 ? 360 : -360)) / 2;
  const meanL = (l1 + l2) / 2;
  const meanCp = (c1 + c2) / 2;
  const shape = 1 - 0.17 * Math.cos(radians(meanH - 30))
    + 0.24 * Math.cos(radians(2 * meanH)) + 0.32 * Math.cos(radians(3 * meanH + 6))
    - 0.20 * Math.cos(radians(4 * meanH - 63));
  const lightScale = 1 + 0.015 * (meanL - 50) ** 2 / Math.sqrt(20 + (meanL - 50) ** 2);
  const chromaScale = 1 + 0.045 * meanCp;
  const hueScale = 1 + 0.015 * meanCp * shape;
  const rotation = -2 * Math.sqrt(seventh(meanCp))
    * Math.sin(radians(60 * Math.exp(-(((meanH - 275) / 25) ** 2))));
  const light = (l2 - l1) / lightScale;
  const chroma = (c2 - c1) / chromaScale;
  const hueDiff = 2 * Math.sqrt(c1 * c2) * Math.sin(radians(diffHue / 2)) / hueScale;
  return Math.sqrt(Math.max(0, light ** 2 + chroma ** 2 + hueDiff ** 2 + rotation * chroma * hueDiff));
}
