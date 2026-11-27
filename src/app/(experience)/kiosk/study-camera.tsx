"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Station } from "@/domains/color-analysis/stations";
import type { ColorResultInput, TrialResult } from "@/domains/color-analysis/result";
import type { CaptureFailure } from "@/domains/color-analysis/measurement";
import type { experience } from "@/domains/sessions/palette";
import { CameraVideo, useCamera } from "./camera-runtime";

export function StudyCamera({ station, copy, onFailure, onResult, onTrialResult, onStop }: {
  station: Station;
  copy: ReturnType<typeof experience>;
  onFailure: (reason?: CaptureFailure) => void;
  onResult: (result?: ColorResultInput) => void;
  onTrialResult: (result: TrialResult) => void;
  onStop: () => void;
}) {
  const { stream, open, stop, capture } = useCamera();
  const video = useRef<HTMLVideoElement | null>(null);
  const alive = useRef(false);
  const [busy, busySet] = useState(false);
  const setVideo = useCallback((element: HTMLVideoElement | null) => { video.current = element; }, []);
  useEffect(() => {
    alive.current = true;
    void open(station.camera).catch(() => { if (alive.current) onFailure(); });
    return () => { alive.current = false; };
  }, [open, onFailure, station.camera]);

  async function measure() {
    if (!video.current || busy) return;
    busySet(true);
    try {
      const value = await capture(video.current, station);
      if (!alive.current) return;
      if (value.kind !== "result" || value.reason) {
        onFailure(value.kind === "result" ? value.reason : undefined);
        return;
      }
      if (station.mode === "trial") {
        if (value.trial) onTrialResult(value.trial);
        else onFailure();
      } else if (station.mode === "automatic" && value.tones && station.paletteVersion &&
        station.methodVersion && station.calibration) {
        onResult({ kind: "automatic", tones: value.tones.tones, quality: value.tones.quality,
          paletteVersion: station.paletteVersion, calibrationVersion: station.calibration.revision,
          methodVersion: station.methodVersion,
        });
      } else onResult();
    } catch { if (alive.current) onFailure(); }
    finally { if (alive.current) busySet(false); }
  }
  const label = station.mode === "trial" ? (busy ? copy.analyzingColors : copy.analyzeColors) : copy.test;
  return <section className="camera-controls" aria-label={copy.camera}>
    <p>{copy.position}</p>
    {stream && <div className="camera-preview"><CameraVideo stream={stream} videoRef={setVideo} /><span className="face-guide" aria-hidden /></div>}
    <div className="controls">
      <button className="choice" disabled={!stream || busy} onClick={() => void measure()}>
        {label}
      </button>
      <button className="text-button" onClick={() => { stop(); onStop(); }}>{copy.cameraOff}</button>
    </div>
  </section>;
}
