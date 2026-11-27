"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  palettes,
  type experience,
} from "@/domains/sessions/palette";

export type Quality =
  | "manual"
  | "ready"
  | "dark"
  | "bright"
  | "uneven"
  | "unavailable"
  | "unchecked";
type Control = "exposureCompensation" | "colorTemperature";
type Range = { min: number; max: number; step: number; initial?: number };

function sample(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  gains: number[],
) {
  const pixels = context.getImageData(x, y, size, size).data;
  const rgb = [0, 0, 0];
  for (let offset = 0; offset < pixels.length; offset += 4) {
    for (let axis = 0; axis < 3; axis++) rgb[axis] += pixels[offset + axis];
  }
  pixels.fill(0);
  return rgb.map((value, axis) => (value * gains[axis]) / (size * size));
}
function luma([r, g, b]: number[]) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function Camera({
  copy,
  colors,
  onQuality,
  onStop,
}: {
  copy: ReturnType<typeof experience>;
  colors?: string[];
  onQuality: (quality: Quality) => void;
  onStop: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const track = useRef<MediaStreamTrack | null>(null);
  const gains = useRef([1, 1, 1]);
  const [status, setStatus] = useState<Quality>("unchecked");
  const [controls, setControls] = useState<Partial<Record<Control, Range>>>({});
  const [calibrated, setCalibrated] = useState(false);
  const [controlError, setControlError] = useState(false);
  useEffect(() => {
    let disposed = false;
    let stream: MediaStream | undefined;
    const element = video.current;
    async function connect() {
      try {
        const acquired = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
        if (disposed || !element) {
          acquired.getTracks().forEach((item) => item.stop());
          return;
        }
        stream = acquired;
        track.current = acquired.getVideoTracks()[0];
        track.current.addEventListener("ended", () => { if (!disposed) onQuality("unavailable"); }, { once: true });
        element.srcObject = acquired;
        const caps = (track.current.getCapabilities?.() ?? {}) as Partial<
          Record<Control, Range>
        >;
        const values = track.current.getSettings() as Partial<
          Record<Control, number>
        >;
        setControls({
          exposureCompensation: caps.exposureCompensation && {
            ...caps.exposureCompensation,
            initial: values.exposureCompensation,
          },
          colorTemperature: caps.colorTemperature && {
            ...caps.colorTemperature,
            initial: values.colorTemperature,
          },
        });
      } catch {
        if (!disposed) {
          setStatus("unavailable");
          onQuality("unavailable");
        }
      }
    }
    void connect();
    return () => {
      disposed = true;
      stream?.getTracks().forEach((item) => item.stop());
      track.current = null;
      if (element) element.srcObject = null;
    };
  }, [onQuality]);

  function inspect(calibrate: boolean) {
    const source = video.current;
    if (!source?.videoWidth || source.readyState < 2) return;
    const frame = document.createElement("canvas");
    frame.width = 64;
    frame.height = 64;
    const context = frame.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    try {
      context.drawImage(source, 0, 0, 64, 64);
      if (calibrate) {
        const reference = sample(context, 46, 44, 8, [1, 1, 1]);
        const target = reference.reduce((sum, value) => sum + value, 0) / 3;
        if (target < 45 || target > 220) {
          setCalibrated(false);
          setControlError(true);
          return;
        }
        gains.current = reference.map((value) =>
          Math.max(0.7, Math.min(1.4, target / Math.max(1, value))),
        );
        setCalibrated(true);
        setControlError(false);
      }
      const left = luma(sample(context, 22, 25, 8, gains.current));
      const right = luma(sample(context, 34, 25, 8, gains.current));
      const light = (left + right) / 2;
      const next =
        light < 55
          ? "dark"
          : light > 220
            ? "bright"
            : Math.abs(left - right) > 46
              ? "uneven"
              : "ready";
      setStatus(next);
      onQuality(next);
    } finally {
      frame.width = 0;
      frame.height = 0;
    }
  }
  return (
    <section className="camera-controls" aria-label={copy.camera}>
      {status !== "unavailable" && (
        <>
          <p>{copy.guide}</p>
          <div className="camera-preview">
            <video ref={video} autoPlay muted playsInline />
            <span className="face-guide" aria-hidden />
            <span className="gray-reference" aria-hidden />
            <span
              className="camera-drape"
              aria-hidden
              style={
                {
                  "--left": colors?.[0] ?? palettes.neutral.colors[1],
                  "--right": colors?.[1] ?? palettes.neutral.colors[2],
                } as CSSProperties
              }
            />
          </div>
          <div className="controls">
            <button className="choice" onClick={() => inspect(false)}>
              {status === "unchecked" ? copy.test : copy.retake}
            </button>
            <button
              className="choice"
              aria-pressed={calibrated}
              onClick={() => inspect(true)}
            >
              {copy.calibrate}
            </button>
          </div>
          {(Object.keys(controls) as Control[]).map((key) => {
            const range = controls[key];
            if (!range || !Number.isFinite(range.min) || range.min >= range.max)
              return null;
            return (
              <label key={key}>
                {key === "exposureCompensation"
                  ? copy.exposure
                  : copy.temperature}
                <input
                  type="range"
                  min={range.min}
                  max={range.max}
                  step={range.step || "any"}
                  defaultValue={range.initial ?? (range.min + range.max) / 2}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    const setting =
                      key === "colorTemperature"
                        ? {
                            whiteBalanceMode: "manual",
                            colorTemperature: value,
                          }
                        : { exposureCompensation: value };
                    void track.current
                      ?.applyConstraints({
                        advanced: [setting as MediaTrackConstraintSet],
                      })
                      .then(
                        () => {
                          setControlError(false);
                          setCalibrated(false);
                          gains.current = [1, 1, 1];
                          setStatus("unchecked");
                          onQuality("unchecked");
                        },
                        () => setControlError(true),
                      );
                  }}
                />
              </label>
            );
          })}
        </>
      )}
      {status !== "unchecked" && (
        <p role="status">
          {
            copy[
              status as "ready" | "dark" | "bright" | "uneven" | "unavailable"
            ]
          }
        </p>
      )}
      {controlError && <p role="alert">{copy.retake}</p>}
      <button className="text-button" onClick={onStop}>
        {copy.cameraOff}
      </button>
    </section>
  );
}
