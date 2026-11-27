"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CameraSettings, Station } from "@/domains/color-analysis/stations";
import type { CaptureResponse } from "./capture.worker";

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

export function useCamera() {
  const [stream, setStream] = useState<MediaStream | null>(null);
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
  const stop = useCallback(() => { release(); setStream(null); }, [release]);
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
    next.getVideoTracks().forEach((track) => track.addEventListener("ended", stop, { once: true }));
    setStream(next);
  }, [stop]);

  async function capture(video: HTMLVideoElement, station: Station) {
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
      await exchange({ kind: "init", station });
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
  return { stream, open, stop, capture };
}
