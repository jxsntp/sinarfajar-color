"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import QRCode from "qrcode";
import Image from "next/image";
import type { messages } from "@/domains/organizations/branding";
import { experience, palettes, type Tone } from "@/domains/sessions/palette";
import { visibleEvent, recoverEvents } from "@/lib/client-events";
import { Button } from "@/components/ui/button";
import { Camera, type Quality } from "./camera";
import { Draping, NamedPalette, Swatches, Gold } from "@/components/palette";
import { comparableDrapes, drapeChoice, paletteFor, paletteSnapshot, swatchFor, toneLabels, type Tone as DrapeTone } from "@/domains/color-analysis/swatches";
import type { Station } from "@/domains/color-analysis/stations";
import type { CaptureFailure } from "@/domains/color-analysis/measurement";
import type { ColorResultInput } from "@/domains/color-analysis/result";
import { StudyCamera } from "./study-camera";

type Session = {
  sessionId: string;
  credential: string;
  expiresAt: string;
  variant: string;
  station: Station;
  trialStation?: Station;
  cameraNotice: string;
};

async function post<T>(
  path: string,
  credential?: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch("/api/kiosk/" + path, {
    method: "POST",
    signal,
    headers: credential
      ? {
          Authorization: "Bearer " + credential,
          "Content-Type": "application/json",
        }
      : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()).data;
}

function reportKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return (
    "report_" +
    btoa(String.fromCharCode(...bytes))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "")
  );
}

export function Studio({
  t,
  enrolled,
  locale,
  showTestReportLink,
}: {
  t: ReturnType<typeof messages>;
  enrolled: boolean;
  locale: string;
  showTestReportLink: boolean;
}) {
  const copy = experience(locale);
  const [connected, setConnected] = useState(enrolled);
  const [session, setSession] = useState<Session | null>(null);
  const [step, setStep] = useState<"privacy" | "compare" | "result">("privacy");
  const [tone, choose] = useState<Tone | null>(null);
  const [votes, setVotes] = useState<(DrapeTone | null)[]>([]);
  const [result, setResult] = useState<ColorResultInput | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [researchReady, setResearchReady] = useState(false);
  const [captureFailure, setCaptureFailure] = useState<CaptureFailure>();
  const [recoverable, setRecoverable] = useState(false);
  const [camera, setCamera] = useState(false);
  const [trial, setTrial] = useState(false);
  const [assisted, assist] = useState(false);
  const [consent, setConsent] = useState<string>();
  const [quality, setQuality] = useState<Quality>("manual");
  const [qr, setQr] = useState<{ image: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const pendingReport = useRef<string | null>(null);
  const settings = useRef<HTMLDetailsElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const qrRef = useRef<HTMLImageElement>(null);
  const handoffRef = useRef<HTMLElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const began = useRef(false);
  const version = session?.station.paletteVersion;
  const cameraStation = trial ? session?.trialStation : session?.station;
  const pairs = useMemo(() => version ? comparableDrapes(version) : [], [version]);
  const pair = pairs[votes.length];
  const lang = locale === "en-US" ? "en" : "id";
  const groups = result && "tones" in result
    ? result.tones : result?.kind === "manual" ? [result.paletteId.slice(6) as DrapeTone] : [];
  const named = result?.kind === "trial"
    ? paletteSnapshot(result.swatchIds.flatMap((id) => swatchFor(result.paletteVersion, id) ?? []))
    : version && result ? paletteSnapshot(paletteFor(version, groups)) : [];
  const headingText = result?.kind === "trial" ? copy.trialPalette : groups.length
    ? (groups.length > 1 ? copy.mixed : result?.kind === "automatic" ? copy.automatic : copy.own)
      + " · " + groups.map((group) => toneLabels[group][lang]).join(" / ")
    : !tone || tone === "uncertain" ? t.uncertain : copy.own + " · " + t[tone];
  const markStarted = useCallback(() => {
    if (!session || began.current) return;
    began.current = true;
    void visibleEvent(session.credential, "color_analysis_started", undefined, session.sessionId);
  }, [session]);
  const reportQuality = useCallback((value: Quality) => {
    if (value === "unavailable") setCamera(false);
    setQuality(value);
  }, []);
  const studyFailed = useCallback((reason?: CaptureFailure) => {
    setCaptureFailure(reason);
    reportQuality("unavailable");
  }, [reportQuality]);
  useEffect(() => {
    if (!session || quality !== "unavailable") return;
    void visibleEvent(session.credential, "camera_capture_failed", undefined, session.sessionId);
    if (attempts >= 2) void visibleEvent(session.credential, "camera_manual_fallback", undefined, session.sessionId);
  }, [session, quality, attempts]);

  function clear() {
    request.current?.abort();
    request.current = null;
    pendingReport.current = null;
    setSession(null);
    setCamera(false);
    setTrial(false);
    setConsent(undefined);
    setQuality("manual");
    assist(false);
    began.current = false;
    choose(null);
    setVotes([]);
    setResult(null);
    setAttempts(0);
    setResearchReady(false);
    setCaptureFailure(undefined);
    setRecoverable(false);
    setQr(null);
    setStep("privacy");
    setBusy(false);
    setError("");
  }
  useEffect(() => {
    if (!connected) return;
    const ping = () => {
      void post("heartbeat", undefined, undefined, AbortSignal.timeout(5000)).catch((error: unknown) => {
        if (error instanceof Error && ["401", "403"].includes(error.message)) setConnected(false);
      });
    };
    ping();
    const timer = window.setInterval(ping, 60000);
    window.addEventListener("online", ping);
    return () => { window.clearInterval(timer); window.removeEventListener("online", ping); };
  }, [connected]);
  useEffect(() => {
    heading.current?.focus();
  }, [session, step]);
  useEffect(() => {
    if (!session) return;
    let timer: ReturnType<typeof setTimeout>;
    const expire = () => {
      clear();
      void post("reset", session.credential).catch(() => {});
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(
        expire,
        Math.max(
          0,
          Math.min(
            Date.parse(session.expiresAt) - Date.now(),
            step === "result" ? 60000 : 90000,
          ),
        ),
      );
    };
    schedule();
    const actions = ["pointerdown", "keydown"] as const;
    for (const action of actions) window.addEventListener(action, schedule);
    return () => {
      clearTimeout(timer);
      for (const action of actions)
        window.removeEventListener(action, schedule);
    };
  }, [session, step]);
  useEffect(() => {
    void recoverEvents();
    const recover = () => {
      void recoverEvents();
    };
    window.addEventListener("online", recover);
    return () => window.removeEventListener("online", recover);
  }, []);
  useEffect(() => {
    if (!session || step !== "result") return;
    const visibleToken = qr ? new URL(qr.url).pathname.split("/").at(-1) ?? "" : "";
    const stop: (() => void)[] = [];
    const observe = (element: HTMLElement | null, name: string) => {
      if (!element) return;
      let inView = false;
      let seen = false;
      let disposed = false;
      let retries = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const notify = () => {
        if (seen || !inView || document.visibilityState !== "visible") return;
        if (element instanceof HTMLImageElement && !element.naturalWidth)
          return;
        seen = true;
        const publish = () => {
          if (!disposed) void visibleEvent(session.credential, name, undefined, session.sessionId);
        };
        if (name !== "qr_displayed") { publish(); return; }
        void post("report/visible", session.credential, { token: visibleToken }).then(publish).catch(() => {
          seen = false;
          if (disposed || retries++ >= 2) return;
          timer = setTimeout(notify, 700);
        });
      };
      const observer = new IntersectionObserver((entries) => {
        inView = entries.some((entry) => entry.isIntersecting);
        notify();
      });
      observer.observe(element);
      element.addEventListener("load", notify);
      document.addEventListener("visibilitychange", notify);
      const reconnect = () => { retries = 0; if (name === "qr_displayed" && !disposed) notify(); };
      window.addEventListener("online", reconnect);
      stop.push(() => {
        disposed = true;
        clearTimeout(timer);
        observer.disconnect();
        element.removeEventListener("load", notify);
        document.removeEventListener("visibilitychange", notify);
        window.removeEventListener("online", reconnect);
      });
    };
    if (qr) {
      handoffRef.current?.focus({ preventScroll: true });
      handoffRef.current?.scrollIntoView({ block: "nearest" });
    }
    observe(
      qr ? qrRef.current : resultRef.current,
      qr ? "qr_displayed" : "color_result_viewed",
    );
    return () => stop.forEach((done) => done());
  }, [qr, session, step]);

  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      await action(controller.signal);
    } catch {
      if (!controller.signal.aborted) setError(t.offline);
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }
  function start() {
    if (!connected) {
      if (settings.current) {
        settings.current.open = true;
        settings.current.querySelector("input")?.focus();
      }
      return;
    }
    void run(async (signal) => {
      const next = await post<Session>(
        "sessions",
        undefined,
        undefined,
        signal,
      );
      if (!signal.aborted) setSession(next);
    });
  }
  function enter(useCamera: boolean, useTrial = false) {
    if (!session) return;
    void run(async (signal) => {
      const data = await post<{ consentId: string }>(
        "consent",
        session.credential,
        { assisted, camera: useCamera, version: session.cameraNotice },
        signal,
      ).catch((error) => {
        if (useCamera) throw error;
        return undefined;
      });
      if (signal.aborted) return;
      setConsent(data?.consentId);
      setCamera(useCamera);
      setTrial(useCamera && useTrial);
      setCaptureFailure(undefined);
      setQuality(useCamera ? "unchecked" : "manual");
      setStep("compare");
      if (useCamera) {
        if (attempts) void visibleEvent(session.credential, "camera_retake", undefined, session.sessionId);
        setAttempts(attempts + 1);
        markStarted();
      }
    });
  }
  function reveal(value?: ColorResultInput) {
    if (value) setResult(value);
    setCamera(false);
    setStep("result");
  }
  function compareDrapes(vote: DrapeTone | null) {
    if (!version) return;
    markStarted();
    const next = [...votes, vote];
    setVotes(next);
    if (next.length !== pairs.length) { setResult(null); return; }
    const selected = drapeChoice(next);
    reveal(selected.length === 1
      ? { kind: "manual", paletteId: "drape-" + selected[0], paletteVersion: version }
      : selected.length === 2 ? { kind: "mixed", tones: selected, paletteVersion: version }
        : { kind: "uncertain", reason: "no_clear_match" });
  }

  function handoff(recover = false, analysis = result) {
    if (!session || (!analysis && !tone)) return;
    pendingReport.current ??= reportKey();
    const payload = analysis
      ? { result: analysis, reportCredential: pendingReport.current, cameraConsentId: consent, assisted }
      : { profile: tone!, palette: palettes[tone!].colors, reportCredential: pendingReport.current, cameraConsentId: consent, quality, assisted };
    void run(async (signal) => {
      try {
        const { reportUrl } = await post<{ reportUrl: string }>(
          recover ? "report/recover" : "report", session.credential, recover ? undefined : payload, signal,
        );
        const image = await QRCode.toDataURL(reportUrl, { width: 250, margin: 4 });
        if (!signal.aborted) {
          setQr({ image, url: reportUrl });
          setRecoverable(false);
        }
      } catch (error) {
        if (!signal.aborted) setRecoverable(true);
        throw error;
      }
    });
  }
  function reset() {
    if (!session) return;
    clear();
    void post("reset", session.credential).catch(() => {});
  }

  return (
    <>
      <section
        className={"studio phase3-studio " + (!session ? "attract" : "")}
      >
        <div>
          <h1 tabIndex={-1} ref={heading}>
            {!session
              ? t.studio
              : step === "privacy"
                ? copy.privacy
                : step === "compare"
                  ? t.compare
                  : t.result}
          </h1>
          {!session && (
            <>
              <p>{copy.intro}</p>
              <Button onClick={start} disabled={busy}>
                {t.begin}
              </Button>
            </>
          )}
          {session && step === "privacy" && (
            <>
              <p>{copy.notice}</p>
              {session.trialStation && <p>{copy.trialNotice}</p>}
              <label className="inline-option">
                <input
                  type="checkbox"
                  checked={assisted}
                  onChange={(event) => assist(event.target.checked)}
                />
                {copy.assisted}
              </label>
              <div className="controls">
                {session.trialStation && <Button onClick={() => enter(true, true)} disabled={busy}>
                  {copy.tryAnalysis}
                </Button>}
                <Button onClick={() => enter(false)} disabled={busy}>
                  {copy.manual}
                </Button>
                {session.station.preview && <button
                  className="choice"
                  onClick={() => enter(true)}
                  disabled={busy}
                >
                  {copy.camera}
                </button>}
              </div>
            </>
          )}
          {session && step === "compare" && (
            <>
              {researchReady && <p role="status">{copy.researchReady}</p>}
              {!camera && quality === "unavailable" && <p role="status">
                {captureFailure === "no_face" ? copy.noFace
                  : trial && captureFailure ? copy.trialCaptureHelp : copy.unavailable}
              </p>}
              {!camera && quality === "unavailable" && attempts < 2 && session.station.preview &&
                <button className="choice" disabled={busy} onClick={() => enter(true, trial)}>{copy.retake}</button>}
              {camera && cameraStation?.mode !== "manual" ? null : <>
                {pair ? <>
                  <p>{copy.drapeStep} {votes.length + 1} / {pairs.length}. {t.choose}</p>
                  <div className="drape-options">
                    {pair.map((swatch) => <button key={swatch.id} className="choice drape-option"
                      onClick={() => compareDrapes(swatch.tone)}>
                      <span className="drape-sample" style={{ "--drape": swatch.display } as CSSProperties} aria-hidden />
                      {swatch.label[lang]} <small>{toneLabels[swatch.tone!][lang]}</small>
                    </button>)}
                  </div>
                  <button className="text-button" onClick={() => compareDrapes(null)}>{copy.both}</button>
                </> : <>
                  <p>{t.choose}</p>
                  <div className="choices" aria-label={t.compare}>
                    {(["warm", "cool", "neutral"] as const).map((option) => (
                      <button className="choice" key={option} aria-pressed={tone === option}
                        onClick={() => { markStarted(); choose(option); setResult(null); }}>{t[option]}</button>
                    ))}
                  </div>
                </>}
                <button className="text-button" aria-pressed={result?.kind === "uncertain"} onClick={() => {
                  markStarted();
                  choose(null);
                  setResult({ kind: "uncertain", reason: quality === "unavailable" ? "capture_unavailable" : "no_clear_match" });
                }}>{t.uncertain}</button>
                {(result || tone) && <Button onClick={() => reveal()}>{t.select}</Button>}
              </>}
            </>
          )}
          {session && step === "result" && (
            <div className="palette-reveal" ref={resultRef}>
              <h2>{headingText}</h2>
              {session.variant === "metals-first" && result?.kind !== "trial" && <Gold locale={locale} />}
              {named.length ? <NamedPalette swatches={named} locale={locale} />
                : <Swatches tone={tone ?? "uncertain"} colors={palettes[tone ?? "uncertain"].colors} locale={locale} />}
              <p>{result?.kind === "trial" ? copy.trialExplanation
                : result?.kind === "uncertain" && version ? copy.guidedUnsure
                : result?.kind === "uncertain" ? copy.unsure : copy.guidance}</p>
              {(session.variant !== "metals-first" || result?.kind === "trial") &&
                <Gold locale={locale} suggested={result?.kind === "trial" ? result.gold : undefined} />}
              {!qr && <div className="controls">
                <Button onClick={() => handoff()} disabled={busy}>
                  {busy ? t.waiting : error ? copy.retry : copy.report}
                </Button>
                {recoverable && <button className="text-button" disabled={busy} onClick={() => handoff(true)}>{copy.recoverQr}</button>}
              </div>}
            </div>
          )}
          {session && (
            <div className="controls">
              <button className="text-button" onClick={reset}>
                {t.reset}
              </button>
              <small>{copy.elapsed}</small>
            </div>
          )}
          {error && <p role="alert">{error}</p>}
        </div>
        {qr && session ? (
          <section
            className="kiosk-qr-stage"
            tabIndex={-1}
            ref={handoffRef}
            aria-label={t.scan}
          >
            <Picture data={qr.image} label={t.scan} imageRef={qrRef} />
            <p>{result?.kind === "trial" ? copy.trialDetails : session.variant === "metals-first" ? copy.scanAlt : t.scan}</p>
            {showTestReportLink && (
              <a className="action mobile-action" href={qr.url} target="_blank" rel="noopener noreferrer">
                {copy.openTestReport}
              </a>
            )}
          </section>
        ) : (
          <div className="draping-stage">
            {camera && step === "compare" && session && cameraStation ? (
              cameraStation.mode === "manual"
                ? <Camera copy={copy} colors={pair ? pair.map(({ display }) => display) : undefined}
                    onQuality={reportQuality} onStop={() => {
                      setCamera(false);
                      void visibleEvent(session.credential, "camera_manual_fallback", undefined, session.sessionId);
                    }} />
                : <StudyCamera station={cameraStation} copy={copy} onFailure={studyFailed}
                    onTrialResult={(suggestion) => { reveal(suggestion); handoff(false, suggestion); }}
                    onStop={() => setCamera(false)} onResult={(measured) => {
                      setCamera(false);
                      if (measured) reveal(measured);
                      else setResearchReady(true);
                    }} />
            ) : (
              <figure><Draping tone={tone ?? "neutral"} /></figure>
            )}
          </div>
        )}
      </section>
      {!session && (
        <details ref={settings}>
          <summary>{t.enroll}</summary>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const key = String(new FormData(form).get("key"));
              void run(async (signal) => {
                await post("enroll", key, undefined, signal);
                if (signal.aborted) return;
                setConnected(true);
                form.reset();
                if (settings.current) settings.current.open = false;
              });
            }}
          >
            <label>
              {t.key}
              <input name="key" type="password" required autoComplete="off" />
            </label>
            <Button type="submit" disabled={busy}>
              {t.enroll}
            </Button>
          </form>
        </details>
      )}
    </>
  );
}
function Picture({
  data,
  label,
  imageRef,
}: {
  data: string;
  label: string;
  imageRef: React.Ref<HTMLImageElement>;
}) {
  return (
    <Image
      unoptimized
      ref={imageRef}
      className="qr"
      src={data}
      width={250}
      height={250}
      alt={label}
    />
  );
}
