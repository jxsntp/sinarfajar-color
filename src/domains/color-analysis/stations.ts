import { z } from "zod";
import { env } from "@/lib/env";
import { methodVersion, paletteVersion } from "./swatches";
import type { Calibration, QualityLimits, ToneRule } from "./measurement";

export const cameraNotice = "camera-local-v1";
export const trialMethod = "camera-harmony-trial-v1";
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
};
const stationInput = z.object({
  mode: z.enum(["manual", "research", "automatic"]),
  preview: z.boolean().optional(), // Accept values from earlier station configurations.
  checkedAt: z.iso.datetime().optional(),
  camera: cameraSettings.optional(),
  calibration: z.object({
    revision: z.string().regex(/^[a-z0-9-]{1,64}$/),
    matrix: z.array(z.number().min(-5).max(5)).length(12),
    white: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]),
  }).strict().optional(),
}).strict();
const stationRegistry = z.record(z.uuid(), stationInput);
const fixtureLimits: QualityLimits = {
  minFrames: 8, maxContrastDeviation: 0.065, minSharpness: 9, maxClipped: 0.09, maxSkinDifference: 14,
};
const fixtureRule: ToneRule = {
  low: 0.10, high: 0.38, mixedWidth: 0.10, tieOrder: ["vivid", "dark", "pale", "dull"],
};
export function cameraTrialFor(
  station: Station,
  host?: string | null,
): Station | undefined {
  if (station.mode !== "manual" || !host) return;
  const { APP_ENV, APP_ORIGIN } = env();
  const developmentHost = APP_ENV === "development" && /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
  const hostedOrigin = APP_ORIGIN && new URL(APP_ORIGIN);
  const hostedHost = hostedOrigin && hostedOrigin.protocol === "https:" && hostedOrigin.host === host.toLowerCase();
  if (!developmentHost && !hostedHost) return;
  return {
    mode: "trial", preview: true, paletteVersion, methodVersion: trialMethod,
    calibration: {
      revision: "assumed-srgb-d65",
      matrix: [
        0.4124564, 0.3575761, 0.1804375, 0,
        0.2126729, 0.7151522, 0.0721750, 0,
        0.0193339, 0.1191920, 0.9503041, 0,
      ],
      white: [0.95047, 1, 1.08883],
    },
    limits: fixtureLimits, rule: fixtureRule,
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
  let configured: z.infer<typeof stationInput> | undefined;
  try {
    const stations = stationRegistry.safeParse(JSON.parse(process.env.COLOR_STATIONS ?? "{}"));
    if (stations.success) configured = stations.data[deviceId];
  } catch {
    // An invalid station registry falls back to manual operation.
  }
  if (!configured) return base;
  const age = now - Date.parse(configured.checkedAt ?? "");
  const currentCalibration = configured.calibration && age >= 0 && age < 86400000;
  const approved = configured.mode === "automatic" && releasedMethods.has(methodVersion);
  const research = !production && configured.mode === "research";
  if (currentCalibration && (approved || research)) {
    return {
      mode: approved ? "automatic" : "research", preview: true,
      paletteVersion, methodVersion, calibration: configured.calibration,
      limits: fixtureLimits, rule: fixtureRule, camera: configured.camera,
    };
  }
  return base;
}
