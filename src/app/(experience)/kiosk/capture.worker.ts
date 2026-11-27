import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { scoreTones, summarizeCapture, type AcceptedFrame, type CaptureFailure } from "@/domains/color-analysis/measurement";
import { sampleFace } from "@/domains/color-analysis/regions";
import type { Station } from "@/domains/color-analysis/stations";
import type { TrialResult } from "@/domains/color-analysis/result";
import { rankTrial } from "@/domains/color-analysis/trial-ranking";

export type CaptureResponse =
  | { kind: "ready" }
  | { kind: "sample"; accepted: boolean; reason?: CaptureFailure }
  | { kind: "result"; tones?: ReturnType<typeof scoreTones>; trial?: TrialResult; reason?: CaptureFailure }
  | { kind: "error" };
type Command = { kind: "init"; station: Station } | { kind: "frame"; bitmap: ImageBitmap } | { kind: "finish" };
let model: FaceLandmarker | undefined;
let station: Station | undefined;
const frames: AcceptedFrame[] = [];
const canvas = new OffscreenCanvas(640, 480);
const context = canvas.getContext("2d", { willReadFrequently: true });
let lastFailure: CaptureFailure = "capture_unavailable";
const send = (payload: CaptureResponse) => self.postMessage(payload);

self.onmessage = async ({ data }: MessageEvent<Command>) => {
  try {
    if (data.kind === "init") {
      station = data.station;
      const files = await FilesetResolver.forVisionTasks(self.location.origin + "/vision/wasm");
      model = await FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: self.location.origin + "/vision/face_landmarker-v1.task", delegate: "CPU" },
        canvas: new OffscreenCanvas(1, 1), runningMode: "IMAGE", numFaces: 2,
      });
      send({ kind: "ready" });
      return;
    }
    if (data.kind === "finish") {
      const summary = station?.limits && summarizeCapture(frames, station.limits);
      const classified = summary && station?.rule && (station.mode === "automatic" || station.mode === "trial")
        ? scoreTones(summary.contrast, station.rule) : undefined;
      const reason = !summary ? (frames.length >= (station?.limits?.minFrames ?? 1) ? "unstable" : lastFailure) : undefined;
      const trial = station?.mode === "trial" && station.calibration && station.paletteVersion &&
        summary && summary.lightness !== null && classified
        ? rankTrial([summary.lightness, ...summary.skinAB], station.calibration, station.paletteVersion, classified)
        : undefined;
      frames.length = 0;
      model?.close();
      send({ kind: "result", reason, tones: classified, trial });
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
      const landmarks = model.detect(canvas).faceLandmarks;
      const image = context.getImageData(0, 0, width, height);
      try {
        const sampled = sampleFace(image, landmarks, station.calibration, station.limits);
        if ("frame" in sampled) {
          if (frames.length < 24) frames.push(sampled.frame);
          send({ kind: "sample", accepted: true });
        } else {
          lastFailure = sampled.error;
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
