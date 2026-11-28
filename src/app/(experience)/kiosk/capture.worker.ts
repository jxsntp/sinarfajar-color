import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { scoreTones, summarizeCapture, type AcceptedFrame, type CaptureFailure } from "@/domains/color-analysis/measurement";
import { sampleFace, type FrameDetail } from "@/domains/color-analysis/regions";
import { expressionFrom, flatten, summarizeFeatures, type FeatureSummary } from "@/domains/color-analysis/face-geometry";
import type { Station } from "@/domains/color-analysis/stations";
import type { TrialResult } from "@/domains/color-analysis/result";
import { rankTrial } from "@/domains/color-analysis/trial-ranking";
import type { ColorStyle } from "@/domains/color-analysis/swatches";

export type CaptureResponse =
  | { kind: "ready" }
  | { kind: "sample"; accepted: boolean; reason?: CaptureFailure }
  | {
      kind: "result"; tones?: ReturnType<typeof scoreTones>; trial?: TrialResult; reason?: CaptureFailure;
      diagnostics?: TrialDiagnostics;
    }
  | { kind: "error" };
type Command = { kind: "init"; station: Station; style?: ColorStyle } | { kind: "frame"; bitmap: ImageBitmap } | { kind: "finish" };
let model: FaceLandmarker | undefined;
let station: Station | undefined;
let style: ColorStyle = "both";
const frames: AcceptedFrame[] = [];
const canvas = new OffscreenCanvas(640, 480);
const context = canvas.getContext("2d", { willReadFrequently: true });
let lastFailure: CaptureFailure = "capture_unavailable";
/** Development-only trial readout. Never sent to the server. */
export type TrialDiagnostics = {
  accepted: number; referenced: number; rejected: Partial<Record<CaptureFailure, number>>;
  summary: ReturnType<typeof summarizeCapture>;
  frames: ({ result: "accepted" | CaptureFailure } & Partial<FrameDetail>)[];
  /** Accepted frames with a neutral expression, used for the feature summary. */
  neutralFrames: number;
  features: FeatureSummary;
};
function featureSummary(frames: TrialDiagnostics["frames"]) {
  const usable = frames.filter((frame) => frame.result === "accepted" && frame.expression?.neutral !== false);
  return {
    neutralFrames: usable.length,
    features: summarizeFeatures(usable.map(({ geometry, lips, skin }) => flatten({
      geometry, skin, lips: lips && { lightness: lips.lab[0], a: lips.lab[1], b: lips.lab[2], contrast: lips.contrast, redness: lips.redness },
    }))),
  };
}
const details: TrialDiagnostics["frames"] = [];
const rejected: Partial<Record<CaptureFailure, number>> = {};
const send = (payload: CaptureResponse) => self.postMessage(payload);

self.onmessage = async ({ data }: MessageEvent<Command>) => {
  try {
    if (data.kind === "init") {
      station = data.station;
      style = data.style ?? "both";
      const files = await FilesetResolver.forVisionTasks(self.location.origin + "/vision/wasm");
      model = await FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: self.location.origin + "/vision/face_landmarker-v1.task", delegate: "CPU" },
        canvas: new OffscreenCanvas(1, 1), runningMode: "IMAGE", numFaces: 2, outputFaceBlendshapes: data.station.mode === "trial",
      });
      send({ kind: "ready" });
      return;
    }
    if (data.kind === "finish") {
      const summary = station?.limits && summarizeCapture(frames, station.limits, station.reference?.mode);
      const classified = summary && station?.rule && (station.mode === "automatic" || station.mode === "trial")
        ? scoreTones(summary.contrast, station.rule) : undefined;
      const reason = !summary ? (frames.length >= (station?.limits?.minFrames ?? 1) ? "unstable" : lastFailure) : undefined;
      const trial = station?.mode === "trial" && station.calibration && station.paletteVersion && summary && classified
        ? rankTrial(summary.skinLab, station.paletteVersion, classified, style)
        : undefined;
      const diagnostics = station?.mode === "trial" ? {
        accepted: frames.length, referenced: frames.filter((frame) => frame.reference).length,
        rejected: { ...rejected }, summary: summary ?? null, ...featureSummary(details), frames: details.splice(0),
      } : undefined;
      frames.length = 0;
      for (const key of Object.keys(rejected)) delete rejected[key as CaptureFailure];
      model?.close();
      send({ kind: "result", reason, tones: classified, trial, diagnostics });
      return;
    }
    const { bitmap } = data;
    try {
      if (!station?.calibration || !station.limits || !context || !model) throw new Error("capture unavailable");
      const scale = Math.min(1, 640 / bitmap.width, 480 / bitmap.height);
      const width = Math.round(bitmap.width * scale), height = Math.round(bitmap.height * scale);
      canvas.width = width;
      canvas.height = height;
      context.drawImage(bitmap, 0, 0, width, height);
      const detected = model.detect(canvas);
      const landmarks = detected.faceLandmarks;
      const image = context.getImageData(0, 0, width, height);
      try {
        const sampled = sampleFace(image, landmarks, station.calibration, station.limits, station.reference);
        if (station.mode === "trial" && details.length < 48) {
          details.push({
            result: "frame" in sampled ? "accepted" : sampled.error, ...sampled.detail,
            expression: landmarks.length === 1 ? expressionFrom(detected.faceBlendshapes[0]?.categories) : null,
          });
        }
        if ("frame" in sampled) {
          if (frames.length < 24) frames.push(sampled.frame);
          send({ kind: "sample", accepted: true });
        } else {
          lastFailure = sampled.error;
          rejected[lastFailure] = (rejected[lastFailure] ?? 0) + 1;
          send({ kind: "sample", accepted: false, reason: lastFailure });
        }
      } finally {
        image.data.fill(0);
      }
    } finally {
      context?.clearRect(0, 0, canvas.width, canvas.height);
      bitmap.close();
    }
  } catch {
    frames.length = 0;
    model?.close();
    send({ kind: "error" });
  }
};
