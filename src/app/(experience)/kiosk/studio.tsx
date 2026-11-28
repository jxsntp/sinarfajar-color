"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import QRCode from "qrcode";
import Image from "next/image";
import type { messages } from "@/domains/organizations/branding";
import { experience, metalColors, palettes, type Tone } from "@/domains/sessions/palette";
import { visibleEvent, recoverEvents } from "@/lib/client-events";
import { Button } from "@/components/ui/button";
import { Camera, type Quality } from "./camera";
import { Draping, NamedPalette, PaletteArch, Swatches, Gold } from "@/components/palette";
import { colorStyles, drapeChoice, paletteFor, paletteSnapshot, styleLabels, swatchFor, toneLabels, type ColorStyle, type Tone as DrapeTone } from "@/domains/color-analysis/swatches";
import type { Station } from "@/domains/color-analysis/stations";
import type { CaptureFailure } from "@/domains/color-analysis/measurement";
import type { ColorResultInput, TrialResult } from "@/domains/color-analysis/result";
import {
  checkDrapes, drapeDimension, drapeSteps, engineCheck, metalChoices, nextDrapes, type EngineCheck, type MetalChoice,
} from "@/domains/color-analysis/draping";
import { StudyCamera } from "./study-camera";
import { DrapeHero, type DrapeOption } from "./drape-hero";

type Session = {
  sessionId: string;
  credential: string;
  expiresAt: string;
  variant: string;
  station: Station;
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
  trialStation,
  showTestReportLink,
}: {
  t: ReturnType<typeof messages>;
  enrolled: boolean;
  locale: string;
  trialStation?: Station;
  showTestReportLink: boolean;
}) {
  const copy = experience(locale);
  const [connected, setConnected] = useState(enrolled);
  const [session, setSession] = useState<Session | null>(null);
  const [step, setStep] = useState<"privacy" | "compare" | "result">("privacy");
  const [tone, choose] = useState<Tone | null>(null);
  const [votes, setVotes] = useState<(DrapeTone | null)[]>([]);
  // Swatches the customer chose during comparison, shown first in the result.
  const [picked, setPicked] = useState<string[]>([]);
  // Gold against silver runs first. Undefined until answered, null for "both".
  const [metal, setMetal] = useState<MetalChoice | null>();
  // A camera trial suggestion waiting for the comparison to confirm or overrule it.
  const [proposal, setProposal] = useState<TrialResult | null>(null);
  const [checks, setChecks] = useState<(string | null)[]>([]);
  const [check, setCheck] = useState<EngineCheck>();
  const [style, setStyle] = useState<ColorStyle>("both");
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
  const cameraStation = trial ? trialStation : session?.station;
  const lang = locale === "en-US" ? "en" : "id";
  const checkPairs = useMemo(() => proposal ? checkDrapes(proposal, style) : [], [proposal, style]);
  const checking = proposal !== null && checks.length < checkPairs.length;
  const pair = !version ? undefined : checking ? checkPairs[checks.length] : metal === undefined ? undefined : nextDrapes(version, votes);
  const asOption = (swatch: (typeof checkPairs)[number][number]): DrapeOption =>
    ({ id: swatch.id, name: swatch.label[lang], note: swatch.tone ? toneLabels[swatch.tone][lang] : undefined, display: swatch.display });
  // The current comparison: the camera check, the metal step, or the analyst sequence.
  const options: DrapeOption[] | undefined = !version || step !== "compare" ? undefined
    : pair ? pair.map(asOption)
    : !checking && metal === undefined && !(proposal && check !== "overruled")
      ? metalChoices.map((choice) => ({ id: "metal-" + choice, name: copy.metals[choice === "yellow" ? 0 : 2],
          display: metalColors[choice === "yellow" ? 0 : 2] }))
      : undefined;
  const totalSteps = checking ? checkPairs.length : 1 + drapeSteps;
  const stepIndex = checking ? checks.length : metal === undefined ? 0 : 1 + votes.length;
  const stepLabel = checking ? copy.dimensions.check : metal === undefined ? copy.dimensions.metal
    : copy.dimensions[drapeDimension(votes.length)];
  // Only someone who can see the face, in the camera preview or with physical drapes, can judge the effect.
  const question = camera ? copy.lookQuestion : assisted ? copy.staffQuestion : copy.preferenceQuestion;
  const groups = result && "tones" in result
    ? result.tones : result?.kind === "manual" ? [result.paletteId.slice(6) as DrapeTone] : [];
  const named = result?.kind === "trial"
    ? paletteSnapshot(result.swatchIds.flatMap((id) => swatchFor(result.paletteVersion, id) ?? []))
    : version && result ? paletteSnapshot(paletteFor(version, groups, style)) : [];
  const headingText = result?.kind === "trial" ? copy.trialPalette + (check === "confirmed" ? " · " + copy.confirmed : "") : groups.length
    ? (groups.length > 1 ? copy.mixed : result?.kind === "automatic" ? copy.automatic : copy.own)
      + " · " + groups.map((group) => toneLabels[group][lang]).join(" / ")
    : !tone || tone === "uncertain" ? t.uncertain : copy.own + " · " + t[tone];
  const styledHeading = version && style !== "both" ? headingText + " · " + styleLabels[style][lang] : headingText;
  const markStarted = useCallback(() => {
    if (!session || began.current) return;
    began.current = true;
    void visibleEvent(session.credential, "color_analysis_started", undefined, session.sessionId);
  }, [session]);
  const reportQuality = useCallback((value: Quality) => {
    if (value === "unavailable") setCamera(false);
    setQuality(value);
  }, [setCamera]);
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
    setPicked([]);
    setMetal(undefined);
    setProposal(null);
    setChecks([]);
    setCheck(undefined);
    setStyle("both");
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
    heading.current?.focus({ preventScroll: true });
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
  /** Records one comparison. `id` is the chosen option, null when both look the same. */
  function compareDrapes(id: string | null) {
    if (!version) return;
    markStarted();
    if (checking && proposal) {
      const next = [...checks, id];
      setChecks(next);
      if (next.length < checkPairs.length) return;
      const outcome = engineCheck(proposal, next);
      setCheck(outcome);
      // Overruled: keep the preview on and continue with the full analyst sequence.
      if (outcome === "overruled") return;
      reveal(proposal);
      handoff(false, proposal, outcome);
      return;
    }
    if (metal === undefined) {
      setMetal(id ? id.slice(6) as MetalChoice : null);
      return;
    }
    const swatch = id ? pair?.find((option) => option.id === id) : undefined;
    if (swatch) setPicked((current) => [...current, swatch.id]);
    const next: (DrapeTone | null)[] = [...votes, swatch?.tone ?? null];
    setVotes(next);
    if (next.length !== drapeSteps) { setResult(null); return; }
    const selected = drapeChoice(next);
    reveal(selected.length === 1
      ? { kind: "manual", paletteId: "drape-" + selected[0], paletteVersion: version }
      : selected.length === 2 ? { kind: "mixed", tones: selected, paletteVersion: version }
        : { kind: "uncertain", reason: "no_clear_match" });
  }

  function handoff(recover = false, analysis = result, outcome = check) {
    if (!session || (!analysis && !tone)) return;
    pendingReport.current ??= reportKey();
    const payload = analysis
      ? {
          result: analysis, style, reportCredential: pendingReport.current, cameraConsentId: consent, assisted,
          ...(metal && analysis.kind !== "trial" ? { metal } : {}), ...(outcome ? { check: outcome } : {}),
        }
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
              {/* One primary path: camera analysis where it is available, otherwise manual comparison. */}
              <div className="controls">
                {trialStation && session.station.mode === "manual"
                  ? <Button onClick={() => enter(true, true)} disabled={busy}>{copy.tryAnalysis}</Button>
                  : <Button onClick={() => enter(false)} disabled={busy}>{copy.manual}</Button>}
              </div>
              <div className="secondary-paths">
                {trialStation && session.station.mode === "manual" &&
                  <button className="text-button" onClick={() => enter(false)} disabled={busy}>{copy.manual}</button>}
                {session.station.preview &&
                  <button className="text-button" onClick={() => enter(true)} disabled={busy}>{copy.camera}</button>}
              </div>
            </>
          )}
          {session && step === "compare" && (
            <>
              {version && <fieldset className="style-choice">
                <legend>{copy.styleQuestion}</legend>
                <div className="choices">
                  {colorStyles.map((option) => <button key={option} className="choice" aria-pressed={style === option}
                    onClick={() => setStyle(option)}>{styleLabels[option][lang]}</button>)}
                </div>
              </fieldset>}
              {researchReady && <p role="status">{copy.researchReady}</p>}
              {!camera && quality === "unavailable" && <p role="status">
                {captureFailure === "no_face" ? copy.noFace
                  : captureFailure === "reference" ? copy.referenceFailed
                  : trial && captureFailure ? copy.trialCaptureHelp : copy.unavailable}
              </p>}
              {!camera && quality === "unavailable" && attempts < 2 && session.station.preview &&
                <button className="choice" disabled={busy} onClick={() => enter(true, trial)}>{copy.retake}</button>}
              {camera && cameraStation?.mode !== "manual" && !proposal ? null : <>
                {options ? <>
                  <p className="drape-progress" aria-live="polite">
                    <span>{stepLabel} · {copy.drapeStep} {stepIndex + 1} / {totalSteps}</span>
                    <span className="progress-dots" aria-hidden>
                      {Array.from({ length: totalSteps }, (_, i) => <i key={i} data-done={i < stepIndex || undefined} />)}
                    </span>
                  </p>
                  {checking && <p>{copy.checkIntro}</p>}
                  {check === "overruled" && <p role="status">{copy.overruled}</p>}
                  <p className="drape-question">{question}</p>
                  {(camera || assisted) && <p className="drape-hint">{copy.lookHint}</p>}
                  {/* With the camera preview the drapes are overlaid on the video, so the choices stay here. */}
                  {camera && <div className="drape-options">
                    {options.map((option) => <button key={option.id} className="choice drape-option"
                      onClick={() => compareDrapes(option.id)}>
                      <span className="drape-sample" style={{ "--drape": option.display } as CSSProperties} aria-hidden />
                      {option.name} {option.note && <small>{option.note}</small>}
                    </button>)}
                  </div>}
                </> : <>
                  <p>{t.choose}</p>
                  <div className="choices" aria-label={t.compare}>
                    {(["warm", "cool", "neutral"] as const).map((option) => (
                      <button className="choice" key={option} aria-pressed={tone === option}
                        onClick={() => { markStarted(); choose(option); setResult(null); }}>{t[option]}</button>
                    ))}
                  </div>
                </>}
                <div className="secondary-paths">
                  {options && <button className="text-button" onClick={() => compareDrapes(null)}>{copy.both}</button>}
                  <button className="text-button" aria-pressed={result?.kind === "uncertain"} onClick={() => {
                    markStarted();
                    choose(null);
                    setResult({ kind: "uncertain", reason: quality === "unavailable" ? "capture_unavailable" : "no_clear_match" });
                  }}>{t.uncertain}</button>
                </div>
                {(result || tone) && <Button onClick={() => reveal()}>{t.select}</Button>}
              </>}
            </>
          )}
          {session && step === "result" && (
            <div className="palette-reveal" ref={resultRef}>
              <h2>{styledHeading}</h2>
              {session.variant === "metals-first" && result?.kind !== "trial" && <Gold locale={locale} suggested={metal ?? undefined} />}
              {named.length ? <NamedPalette swatches={named} locale={locale}
                  featured={result?.kind === "trial" ? result.swatchIds : picked} />
                : <Swatches tone={tone ?? "uncertain"} colors={palettes[tone ?? "uncertain"].colors} locale={locale} />}
              {result?.kind === "trial" && check === "split" && <p role="status">{copy.split}</p>}
              <p>{result?.kind === "trial" ? copy.trialExplanation
                : result?.kind === "uncertain" && version ? copy.guidedUnsure
                : result?.kind === "uncertain" ? copy.unsure : copy.guidance}</p>
              {(session.variant !== "metals-first" || result?.kind === "trial") &&
                <Gold locale={locale} suggested={result?.kind === "trial" ? result.gold : metal ?? undefined} />}
              {!qr && <div className="controls">
                <Button onClick={() => handoff()} disabled={busy}>
                  {busy ? t.waiting : error ? copy.retry : copy.report}
                </Button>
                {recoverable && <button className="text-button" disabled={busy} onClick={() => handoff(true)}>{copy.recoverQr}</button>}
              </div>}
            </div>
          )}
          {session && (
            <div className="controls session-footer">
              <button className="text-button" onClick={reset}>
                {t.reset}
              </button>
              {step === "privacy" && <label className="inline-option">
                <input type="checkbox" checked={assisted} onChange={(event) => assist(event.target.checked)} />
                {copy.assisted}
              </label>}
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
              cameraStation.mode === "manual" || proposal
                ? <Camera copy={copy} colors={options?.map(({ display }) => display)}
                    onQuality={reportQuality} onStop={() => {
                      setCamera(false);
                      void visibleEvent(session.credential, "camera_manual_fallback", undefined, session.sessionId);
                    }} />
                : <StudyCamera station={cameraStation} style={style} copy={copy} onFailure={studyFailed}
                    onTrialResult={(suggestion) => {
                      // The engine proposes; the comparison confirms or overrules it before it becomes a result.
                      if (checkDrapes(suggestion, style).length) { setChecks([]); setProposal(suggestion); }
                      else { reveal(suggestion); handoff(false, suggestion); }
                    }}
                    onStop={() => setCamera(false)} onResult={(measured) => {
                      setCamera(false);
                      if (measured) reveal(measured);
                      else setResearchReady(true);
                    }} />
            ) : step === "result" && named.some(({ tone }) => tone !== null) ? (
              <PaletteArch colors={[
                ...named.filter(({ id, tone }) => tone !== null && (result?.kind === "trial" || picked.includes(id))),
                ...named.filter(({ id, tone }) => tone !== null && !(result?.kind === "trial" || picked.includes(id))),
              ].map(({ display }) => display)} />
            ) : step === "compare" && session && options ? (
              <DrapeHero options={options} step={stepIndex + (checking ? 100 : 0)}
                onChoose={(option) => compareDrapes(option.id)} />
            ) : (
              <figure><Draping tone={tone ?? "neutral"} /></figure>
            )}
          </div>
        )}
      </section>
      {!session && !connected && (
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
