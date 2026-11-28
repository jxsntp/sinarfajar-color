"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import {
  calibrateChart, calibrationRevision, chartColumns, chartGuide, chartRows, chartTargets, d65, patchRegion,
  samplePatches, stationEntry, type ChartFailure, type ChartResult, type PatchReading, type StationEntry, type StationMode,
} from "@/domains/color-analysis/chart";
import { labToXyz } from "@/domains/color-analysis/measurement";
import type { CameraSettings } from "@/domains/color-analysis/stations";
import type { Lab } from "@/domains/color-analysis/swatches";
import { CameraVideo, useCamera } from "@/app/(experience)/kiosk/camera-runtime";

type Control = "exposureTime" | "exposureCompensation" | "colorTemperature";
const controls: { key: Control; label: string }[] = [
  { key: "exposureTime", label: "Exposure time" },
  { key: "exposureCompensation", label: "Exposure compensation" },
  { key: "colorTemperature", label: "Color temperature (K)" },
];
const failures: Record<ChartFailure | "camera", string> = {
  frames: "Not enough frames were captured. Keep the camera running and try again.",
  clipping: "Some patches are blown out or black. Lower the exposure or the light level and measure again.",
  orientation: "The bottom row does not run from white to black. Turn the chart so the brown patch is at the top left.",
  fit: "The chart could not be fitted. Check that every patch sits inside its guide cell.",
  camera: "The camera could not apply these settings. Use values within the reported range.",
};
const percent = (value: number) => value * 100 + "%";
const toHex = (rgb: Lab) => "#" + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
/** D65 Lab to an sRGB display color. */
function labHex(lab: Lab) {
  const [x, y, z] = labToXyz(lab, d65);
  const linear = [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ];
  return toHex(linear.map((v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055)) as unknown as Lab);
}
const round = (value: number, digits = 2) => Number(value.toFixed(digits));

export function CalibrationStudio({ kiosk }: { kiosk: { id: string; label: string } | null }) {
  const { stream, open, stop } = useCamera();
  const video = useRef<HTMLVideoElement | null>(null);
  const setVideo = useCallback((element: HTMLVideoElement | null) => { video.current = element; }, []);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [values, setValues] = useState<Partial<Record<Control, string>>>({});
  const [locked, setLocked] = useState<CameraSettings | null>(null);
  const [stationId, setStationId] = useState(kiosk?.id ?? "");
  const [whiteReference, setWhiteReference] = useState(false);
  const [mode, setMode] = useState<StationMode>("manual");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<{ chart: ChartResult; entry: StationEntry } | null>(null);
  const [copied, setCopied] = useState(false);
  const track = stream?.getVideoTracks()[0];
  const capabilities = useMemo(() => (track?.getCapabilities?.() ?? {}) as Partial<Record<Control, { min: number; max: number; step?: number }>>, [track]);
  const current = useMemo(() => (track?.getSettings() ?? {}) as Partial<Record<Control, number>>, [track]);

  useEffect(() => {
    if (!stream) return;
    void navigator.mediaDevices.enumerateDevices().then((devices) =>
      setCameras(devices.filter(({ kind }) => kind === "videoinput")));
  }, [stream]);

  async function start(settings?: CameraSettings) {
    setError(undefined);
    setResult(null);
    try {
      await open(settings);
      setLocked(settings && Object.keys(settings).length ? settings : null);
    } catch {
      setLocked(null);
      setError(settings ? failures.camera : "The camera is unavailable. Allow camera access and use localhost or HTTPS.");
      if (settings) await open().catch(() => {});
    }
  }
  function lock() {
    const settings: CameraSettings = cameraId ? { deviceId: cameraId } : {};
    for (const { key } of controls) {
      const value = Number(values[key]);
      if (values[key] && Number.isFinite(value)) settings[key] = value;
    }
    void start(settings);
  }

  async function measure() {
    const source = video.current;
    if (!source?.videoWidth || busy) return;
    setBusy(true);
    setError(undefined);
    setResult(null);
    const scale = Math.min(1, 640 / source.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(source.videoWidth * scale);
    canvas.height = Math.round(source.videoHeight * scale);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const frames: PatchReading[][] = [];
    try {
      for (let i = 0; i < 15 && context; i++) {
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        frames.push(samplePatches(context.getImageData(0, 0, canvas.width, canvas.height)));
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      const now = new Date();
      const chart = calibrateChart(frames, calibrationRevision(now));
      if ("error" in chart) setError(failures[chart.error]);
      else setResult({ chart, entry: stationEntry(chart.calibration, now, locked ?? undefined, whiteReference, mode) });
    } finally {
      canvas.width = 0;
      canvas.height = 0;
      setBusy(false);
    }
  }

  const json = result && stationId ? JSON.stringify({ [stationId]: result.entry }, null, 2) : "";
  return (
    <section className="calibration-studio">
      <div className="controls">
        {!stream ? <Button onClick={() => void start()}>Start camera</Button>
          : <button className="text-button" onClick={() => { stop(); setLocked(null); }}>Stop camera</button>}
      </div>
      {stream && <>
        <fieldset>
          <legend>Camera settings</legend>
          <p>Lock exposure and white balance so the chart and every customer capture use identical settings.</p>
          <label>
            Camera
            <select value={cameraId} onChange={(event) => setCameraId(event.target.value)}>
              <option value="">Front camera (default)</option>
              {cameras.map(({ deviceId, label }, i) => <option key={deviceId || i} value={deviceId}>{label || "Camera " + (i + 1)}</option>)}
            </select>
          </label>
          {controls.map(({ key, label }) => {
            const range = capabilities[key];
            if (!range || !Number.isFinite(range.min) || range.min >= range.max) return null;
            return <label key={key}>
              {label} ({range.min}–{range.max}, now {current[key] ?? "auto"})
              <input type="number" min={range.min} max={range.max} step={range.step || "any"} value={values[key] ?? ""}
                onChange={(event) => setValues({ ...values, [key]: event.target.value })} />
            </label>;
          })}
          {!controls.some(({ key }) => capabilities[key]) &&
            <p>This camera reports no manual exposure or white balance controls in this browser.</p>}
          <Button onClick={lock} disabled={busy}>Apply and lock settings</Button>
          <p role="status">{locked ? "Locked: " + JSON.stringify(locked) : "Settings are automatic and not locked."}</p>
        </fieldset>

        <div className="camera-preview calibration-preview">
          <CameraVideo stream={stream} videoRef={setVideo} />
          <span className="chart-guide" aria-hidden style={{
            left: percent(chartGuide[0]), top: percent(chartGuide[1]), width: percent(chartGuide[2]), height: percent(chartGuide[3]),
            "--columns": chartColumns, "--rows": chartRows,
          } as CSSProperties} />
          {Array.from({ length: chartColumns * chartRows }, (_, i) => {
            const [x, y, w, h] = patchRegion(i);
            return <span key={i} className="chart-sample" aria-hidden
              style={{ left: percent(x), top: percent(y), width: percent(w), height: percent(h) }} />;
          })}
        </div>
        <label>
          <input type="checkbox" checked={whiteReference} onChange={(event) => setWhiteReference(event.target.checked)} />
          Require a gray card in the reference square for every customer capture
        </label>
        <label>
          Station mode
          <select value={mode} onChange={(event) => setMode(event.target.value as StationMode)}>
            <option value="manual">Manual draping, with this calibration in the localhost camera trial</option>
            <option value="research">Blinded research capture (development and UAT)</option>
          </select>
        </label>
        <Button onClick={() => void measure()} disabled={busy}>{busy ? "Measuring…" : "Measure chart"}</Button>
      </>}
      {error && <p role="alert">{error}</p>}

      {result && <>
        <h3>{result.chart.passed ? "Within the provisional targets" : "Outside the provisional targets"}</h3>
        <p>
          Held-out patches: mean ΔE₀₀ {round(result.chart.heldOut.mean)}, max {round(result.chart.heldOut.max)}
          {" "}(provisional targets {chartTargets.mean} and {chartTargets.max}). All patches: mean {round(result.chart.all.mean)},
          max {round(result.chart.all.max)}. {!locked && "Settings were not locked, so automatic camera adjustment can invalidate this fit."}
        </p>
        <table>
          <thead><tr><th>Patch</th><th>Camera</th><th>Corrected</th><th>Reference</th><th>ΔE₀₀</th><th>Use</th></tr></thead>
          <tbody>
            {result.chart.patches.map((patch) => <tr key={patch.name}>
              <td>{patch.name}</td>
              <td><span className="chart-chip" style={{ background: toHex(patch.rgb) }} /></td>
              <td><span className="chart-chip" style={{ background: labHex(patch.measured) }} /></td>
              <td><span className="chart-chip" style={{ background: labHex(patch.reference) }} /></td>
              <td>{round(patch.error)}</td>
              <td>{patch.heldOut ? "check" : "fit"}</td>
            </tr>)}
          </tbody>
        </table>
        <label>
          Kiosk device ID
          <input value={stationId} onChange={(event) => setStationId(event.target.value.trim())}
            placeholder="Device UUID" aria-describedby="station-hint" />
        </label>
        <p id="station-hint">{kiosk ? "This browser is enrolled as " + kiosk.label + "." : "This browser is not an enrolled kiosk. Enter the kiosk's device ID."}</p>
        {json && <>
          <p>
            Add this entry to <code>COLOR_STATIONS</code> and restart the server. It expires 24 hours after
            {" "}<code>checkedAt</code>, so measure again each day. Research mode is rejected in production.
          </p>
          <pre className="calibration-json">{json}</pre>
          <Button onClick={() => void navigator.clipboard.writeText(json).then(() => setCopied(true))}>
            {copied ? "Copied" : "Copy entry"}
          </Button>
        </>}
      </>}
    </section>
  );
}
