import { deltaE00 } from "./delta-e";
import { linear, pixelLab, xyzToLab, type Calibration } from "./measurement";
import type { Lab } from "./swatches";

export type ChartPatch = { rgb: Lab; xyz: Lab };
export function fitChart(fit: ChartPatch[], revision: string, white: Lab): Calibration | null {
  if (fit.length < 4 || !white.every((n) => Number.isFinite(n) && n > 0) ||
      !fit.every(({ rgb, xyz }) => rgb.every((v) => v >= 0 && v <= 255) && xyz.every((v) => v >= 0 && Number.isFinite(v))))
    return null;
  const design = fit.map(({ rgb }) => [...rgb.map((value) => linear(value / 255)), 1]);
  // Form and solve XᵀX * coefficients = XᵀXYZ with pivoting.
  const augmented = Array.from({ length: 4 }, (_, col) => Array.from({ length: 7 }, (_, axis) =>
    design.reduce((sum, row, index) => sum + row[col] * (axis < 4 ? row[axis] : fit[index].xyz[axis - 4]), 0)));
  for (let col = 0; col < 4; col++) {
    let pivot = col;
    for (let row = col + 1; row < 4; row++) if (Math.abs(augmented[row][col]) > Math.abs(augmented[pivot][col])) pivot = row;
    const divisor = augmented[pivot][col];
    if (Math.abs(divisor) < 1e-8) return null;
    [augmented[pivot], augmented[col]] = [augmented[col], augmented[pivot]];
    augmented[col] = augmented[col].map((value) => value / divisor);
    for (let row = 0; row < 4; row++) if (row !== col) {
      const factor = augmented[row][col];
      augmented[row] = augmented[row].map((value, axis) => value - factor * augmented[col][axis]);
    }
  }
  return { revision, white, matrix: [4, 5, 6].flatMap((axis) => augmented.map((row) => row[axis])) };
}

export function checkChart(calibration: Calibration, heldOut: ChartPatch[]) {
  const errors = heldOut.map(({ rgb, xyz }) => deltaE00(pixelLab(rgb, calibration), xyzToLab(xyz, calibration.white)));
  return errors.length ? { patchCount: errors.length, mean: errors.reduce((a, b) => a + b, 0) / errors.length, max: Math.max(...errors) } : null;
}
