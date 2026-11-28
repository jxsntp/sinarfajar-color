"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Station } from "@/domains/color-analysis/stations";
import type { ColorResultInput, TrialResult } from "@/domains/color-analysis/result";
import type { CaptureFailure } from "@/domains/color-analysis/measurement";
import type { experience } from "@/domains/sessions/palette";
import type { ColorStyle } from "@/domains/color-analysis/swatches";
import { CameraVideo, useCamera } from "./camera-runtime";
import type { TrialDiagnostics } from "./capture.worker";

const round = (value: number) => Math.round(value * 100) / 100;
/** Prints the development trial readout. Nothing here is sent to the server. */
function logTrial(diagnostics: TrialDiagnostics) {
  console.info("[color-trial] frames (L* 0–100, a* green–red, b* blue–yellow)");
  console.table(diagnostics.frames.map(({ result, geometry, reference, brows, cheeks, forehead, lips, skin, expression }) => ({
    result,
    "cheek L* left/right": cheeks?.map(({ lab }) => round(lab[0])).join(" / "),
    "brow contrast left/right": brows?.map(({ contrast }) => contrast === null ? "–" : round(contrast)).join(" / "),
    "forehead L*": forehead ? round(forehead.lab[0]) : "–",
    "skin L* a* b*": skin ? [skin.lightness, skin.a, skin.b].map(round).join(" ") : "–",
    "ITA°": skin ? round(skin.ita) : "–",
    "gray card": reference ? (reference.used ? "used" : reference.overlapsFace ? "covered by face" : "not found") : "off",
    "lip contrast": lips?.contrast == null ? "–" : round(lips.contrast),
    expression: expression ? (expression.neutral ? "neutral" : "not neutral") : "–",
    "roll°": geometry ? round(geometry.rollDegrees) : "–",
    "face width": geometry ? round(geometry.faceWidth) : "–",
  })));
  console.info("[color-trial] features: median and spread over " + diagnostics.neutralFrames + " accepted neutral frames");
  console.table(Object.fromEntries(Object.entries(diagnostics.features).map(([key, { median, spread, frames }]) =>
    [key, { median: round(median), spread: round(spread), frames }])));
  console.info("[color-trial] full readout", JSON.stringify(diagnostics,
    (_, value) => typeof value === "number" ? round(value) : value, 2));
}

export function StudyCamera({ station, style, copy, onFailure, onResult, onTrialResult, onStop }: {
  station: Station;
  style: ColorStyle;
  copy: ReturnType<typeof experience>;
  onFailure: (reason?: CaptureFailure) => void;
  onResult: (result?: ColorResultInput) => void;
  onTrialResult: (result: TrialResult) => void;
  onStop: () => void;
}) {
  const { stream, open, stop, capture, exposure } = useCamera({ meterFace: true });
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
      const value = await capture(video.current, station, style);
      if (!alive.current) return;
      if (value.kind === "result" && value.diagnostics) logTrial(value.diagnostics);
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
    {station.reference && <p>{station.reference.mode === "required" ? copy.referenceRequired : copy.referenceHint}</p>}
    {exposure === "limit" && <p role="status">{copy.exposureLimit}</p>}
    {stream && <div className="camera-preview">
      <CameraVideo stream={stream} videoRef={setVideo} />
      <span className="face-guide" aria-hidden />
      {station.reference && <span className="gray-reference" aria-hidden />}
    </div>}
    <div className="controls">
      <button className="choice" disabled={!stream || busy} onClick={() => void measure()}>
        {label}
      </button>
      <button className="text-button" onClick={() => { stop(); onStop(); }}>{copy.cameraOff}</button>
    </div>
  </section>;
}
