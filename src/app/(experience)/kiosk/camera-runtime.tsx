"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CameraSettings, Station } from "@/domains/color-analysis/stations";
import type { ColorStyle } from "@/domains/color-analysis/swatches";
import type { CaptureResponse } from "./capture.worker";
import {
  exposureStep, faceMeter, regionLuma, type ExposureCapabilities, type ExposureSettings,
} from "@/domains/color-analysis/exposure";

/** Face-metered exposure state: off, steering, settled in the band, or at the camera's limit. */
export type ExposureState = "off" | "adjusting" | "ok" | "limit";
const meterInterval = 500;

export function CameraVideo({ stream, videoRef }: {
  stream: MediaStream;
  videoRef?: (video: HTMLVideoElement | null) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    videoRef?.(video);
    return () => { video.srcObject = null; videoRef?.(null); };
  }, [stream, videoRef]);
  return <video ref={ref} autoPlay muted playsInline aria-hidden="true" />;
}

export function useCamera({ onEnded, meterFace = false }: {
  onEnded?: () => void;
  /** Steer exposure from the face guide region when the station has not locked camera settings. */
  meterFace?: boolean;
} = {}) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [exposure, setExposure] = useState<ExposureState>("off");
  const metering = useRef(false);
  const ended = useRef(onEnded);
  useEffect(() => { ended.current = onEnded; }, [onEnded]);
  const media = useRef<MediaStream | null>(null);
  const operation = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const release = useCallback(() => {
    generation.current++;
    operation.current?.abort();
    operation.current = null;
    media.current?.getTracks().forEach((track) => track.stop());
    media.current = null;
  }, []);
  const stop = useCallback(() => { release(); metering.current = false; setStream(null); setExposure("off"); }, [release]);
  /** Stops face metering, for example when staff set exposure by hand. */
  const holdExposure = useCallback(() => { metering.current = false; setExposure("off"); }, []);

  // Samples the face region and nudges exposure until the stream changes or metering is held.
  const meter = useCallback(async (next: MediaStream, version: number) => {
    const track = next.getVideoTracks()[0];
    const caps = (track.getCapabilities?.() ?? {}) as ExposureCapabilities;
    const source = document.createElement("video");
    source.muted = true;
    source.playsInline = true;
    source.srcObject = next;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 48;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    metering.current = true;
    setExposure("adjusting");
    try {
      await source.play().catch(() => {});
      while (context && metering.current && version === generation.current && track.readyState === "live") {
        await new Promise((resolve) => setTimeout(resolve, meterInterval));
        // A capture needs stable exposure across its frames.
        if (operation.current || source.readyState < 2) continue;
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        const [x, y, w, h] = faceMeter.map((value, i) => Math.round(value * (i % 2 ? canvas.height : canvas.width)));
        const step = exposureStep(regionLuma(context.getImageData(x, y, w, h).data), caps,
          track.getSettings() as ExposureSettings);
        if (!metering.current || version !== generation.current) break;
        if (step.kind === "adjust") {
          setExposure("adjusting");
          await track.applyConstraints({ advanced: [step.constraints as MediaTrackConstraintSet] }).catch(() => {});
        } else setExposure(step.kind);
      }
    } finally {
      source.srcObject = null;
      canvas.width = 0;
      canvas.height = 0;
    }
  }, []);
  useEffect(() => {
    window.addEventListener("pagehide", stop);
    return () => { window.removeEventListener("pagehide", stop); release(); };
  }, [release, stop]);

  const open = useCallback(async (camera?: CameraSettings) => {
    stop();
    const version = generation.current;
    if (!window.isSecureContext || !navigator.mediaDevices) throw new Error("Camera unavailable");
    const next = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { width: { ideal: 1280 }, height: { ideal: 720 },
        ...(camera?.deviceId ? { deviceId: { exact: camera.deviceId } } : { facingMode: "user" }),
      },
    });
    try {
      const track = next.getVideoTracks()[0];
      if (!track) throw new Error("Video track unavailable");
      const { exposureTime, exposureCompensation, colorTemperature } = camera ?? {};
      const controls = { exposureTime, exposureCompensation, colorTemperature };
      if (Object.values(controls).some((value) => value !== undefined)) {
        await track.applyConstraints({ advanced: [{
          ...controls,
          ...(exposureTime === undefined ? {} : { exposureMode: "manual" }),
          ...(colorTemperature === undefined ? {} : { whiteBalanceMode: "manual" }),
        } as MediaTrackConstraintSet] });
        const actual = track.getSettings() as Record<string, unknown>;
        for (const [key, expected] of Object.entries(controls)) {
          const observed = actual[key];
          if (expected !== undefined && (typeof observed !== "number" ||
              Math.abs(observed - expected) > Math.max(0.01, Math.abs(expected) * 0.025))) {
            throw new Error("Station camera settings did not match calibration");
          }
        }
      }
    } catch (error) {
      next.getTracks().forEach((track) => track.stop());
      throw error;
    }
    if (version !== generation.current) {
      next.getTracks().forEach((track) => track.stop());
      return;
    }
    media.current = next;
    // A calibrated station locks exposure; only an unlocked camera is steered from the face.
    if (meterFace && camera?.exposureTime === undefined && camera?.exposureCompensation === undefined)
      void meter(next, version);
    next.getVideoTracks().forEach((track) => track.addEventListener("ended", () => {
      if (version !== generation.current) return;
      stop();
      ended.current?.();
    }, { once: true }));
    setStream(next);
  }, [stop, meter, meterFace]);

  async function capture(video: HTMLVideoElement, station: Station, style: ColorStyle = "both") {
    if (!media.current || operation.current) throw new Error("Capture unavailable");
    const controller = new AbortController();
    operation.current = controller;
    const worker = new Worker(new URL("./capture.worker.ts", import.meta.url));
    const signal = controller.signal;
    const exchange = (message: unknown, transfer: Transferable[] = []) => new Promise<CaptureResponse>((resolve, reject) => {
      const finish = (result?: CaptureResponse) => {
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
        worker.onmessage = null;
        worker.onerror = null;
        if (result && result.kind !== "error") resolve(result);
        else reject(new Error("Capture unavailable"));
      };
      const abort = () => finish();
      const timeout = setTimeout(abort, 12000);
      signal.addEventListener("abort", abort, { once: true });
      worker.onmessage = (event: MessageEvent<CaptureResponse>) => finish(event.data);
      worker.onerror = abort;
      worker.postMessage(message, transfer);
    });
    try {
      await exchange({ kind: "init", station, style });
      const until = performance.now() + 3000;
      let lastTime = -1;
      while (!signal.aborted && performance.now() < until) {
        if (video.readyState >= 2 && video.currentTime !== lastTime) {
          lastTime = video.currentTime;
          const bitmap = await createImageBitmap(video);
          if (signal.aborted) { bitmap.close(); break; }
          await exchange({ kind: "frame", bitmap }, [bitmap]);
        }
        await new Promise((resolve) => setTimeout(resolve, 125));
      }
      if (signal.aborted) throw new Error("Capture cancelled");
      return await exchange({ kind: "finish" });
    } finally {
      worker.terminate();
      if (operation.current === controller) stop();
    }
  }
  return { stream, open, stop, capture, exposure, holdExposure };
}
