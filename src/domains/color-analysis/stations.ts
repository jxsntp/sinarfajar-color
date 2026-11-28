import { z } from "zod";
import { env } from "@/lib/env";
import { methodVersion, paletteVersion } from "./swatches";
import { assumedSrgb, type Calibration, type QualityLimits, type ToneRule } from "./measurement";
export { assumedSrgb };
import type { FrameRegion, WhiteReference } from "./regions";

export const cameraNotice = "camera-local-v1";
export const trialMethod = "camera-harmony-trial-v2";
/** Matches the `.gray-reference` overlay in globals.css. */
export const grayReferenceRegion: FrameRegion = [0.72, 0.69, 0.125, 0.125];
const cameraSettings = z.object({
  deviceId: z.string().min(1).max(256).optional(),
  exposureTime: z.number().positive().optional(),
  exposureCompensation: z.number().min(-8).max(8).optional(),
  colorTemperature: z.number().positive().optional(),
}).strict();
export type CameraSettings = z.infer<typeof cameraSettings>;
export type Station = {
  mode: "manual" | "research" | "automatic" | "trial";
  preview: boolean;
  paletteVersion: string | null;
  methodVersion: string | null;
  calibration?: Calibration;
  limits?: QualityLimits;
  rule?: ToneRule;
  camera?: CameraSettings;
  reference?: WhiteReference;
};
const stationInput = z.object({
  mode: z.enum(["manual", "research", "automatic"]),
  preview: z.boolean().optional(), // Accept values from earlier station configurations.
  checkedAt: z.iso.datetime().optional(),
  camera: cameraSettings.optional(),
  whiteReference: z.boolean().optional(),
  calibration: z.object({
    revision: z.string().regex(/^[a-z0-9-]{1,64}$/),
    matrix: z.array(z.number().min(-5).max(5)).length(12),
    white: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]),
  }).strict().optional(),
}).strict();
const stationRegistry = z.record(z.uuid(), stationInput);
const fixtureLimits: QualityLimits = {
  minFrames: 8, maxContrastDeviation: 0.065, minSharpness: 9, maxClipped: 0.09, maxSkinDifference: 14,
  browFraction: 0.5, maxSkinDeviation: 6, maxReferenceDrift: 3,
};
const fixtureRule: ToneRule = {
  low: 0.10, high: 0.38, mixedWidth: 0.10, tieOrder: ["vivid", "dark", "pale", "dull"],
};
type ConfiguredStation = z.infer<typeof stationInput> & { calibration: Calibration };
/** The device's `COLOR_STATIONS` entry when its calibration was checked within the last 24 hours. */
export function currentStation(deviceId: string | undefined, now = Date.now()): ConfiguredStation | undefined {
  if (!deviceId) return;
  let configured: z.infer<typeof stationInput> | undefined;
  try {
    const stations = stationRegistry.safeParse(JSON.parse(process.env.COLOR_STATIONS ?? "{}"));
    if (stations.success) configured = stations.data[deviceId];
  } catch {
    // An invalid station registry falls back to manual operation.
  }
  const age = now - Date.parse(configured?.checkedAt ?? "");
  return configured?.calibration && age >= 0 && age < 86400000 ? configured as ConfiguredStation : undefined;
}
/**
 * The localhost development trial. A manual-mode station entry with a current calibration supplies the
 * camera calibration and settings; otherwise the camera is assumed to be sRGB.
 */
export function localCameraTrial(
  host: string | null,
  environment: ReturnType<typeof env>["APP_ENV"],
  configured?: ConfiguredStation,
): Station | undefined {
  if (environment !== "development" || !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host ?? "")) return;
  const calibrated = configured?.mode === "manual" ? configured : undefined;
  return {
    mode: "trial", preview: true, paletteVersion, methodVersion: trialMethod,
    calibration: calibrated?.calibration ?? assumedSrgb,
    limits: fixtureLimits, rule: fixtureRule,
    reference: { region: grayReferenceRegion, mode: calibrated?.whiteReference ? "required" : "auto" },
    ...(calibrated?.camera ? { camera: calibrated.camera } : {}),
  };
}

// A method may be registered here only after the specialist, held-out study and hardware release review.
const releasedMethods: ReadonlySet<string> = new Set();
export function stationFor(deviceId: string, now = Date.now()): Station {
  const config = env();
  const production = config.APP_ENV === "production";
  const base: Station = {
    mode: "manual", preview: true, paletteVersion: production ? null : paletteVersion, methodVersion: null,
  };
  const configured = currentStation(deviceId, now);
  if (!configured) return base;
  const approved = configured.mode === "automatic" && releasedMethods.has(methodVersion);
  const research = !production && configured.mode === "research";
  if (approved || research) {
    return {
      mode: approved ? "automatic" : "research", preview: true,
      paletteVersion, methodVersion, calibration: configured.calibration,
      limits: fixtureLimits, rule: fixtureRule, camera: configured.camera,
      ...(configured.whiteReference ? { reference: { region: grayReferenceRegion, mode: "required" as const } } : {}),
    };
  }
  return base;
}
