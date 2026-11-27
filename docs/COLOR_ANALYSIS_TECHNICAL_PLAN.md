# Phase 3 color analysis technical implementation plan

**Status** — Proposed implementation plan for the Sinar Fajar kiosk. Use the [engine and validation plan](COLOR_ANALYSIS_ENGINE_PLAN.md) for the studies, algorithm rationale and Puri Mall acceptance criteria. This plan covers the browser engine, result persistence, QR handoff and the changes needed to keep mobile jewelry ranking independent. Use the [Phase 3 prompt](Sinar_Fajar_Development_Plan_v2.md#prompt-03--kiosk-qr-handoff-and-mobile-experience) for the rest of the Phase 3 deliverables.

## 1. Integration points

| Area | Existing entry point | Proposed work |
| --- | --- | --- |
| Kiosk | [`studio.tsx`](../src/app/(experience)/kiosk/studio.tsx) owns enrollment, manual preset selection, reveal, QR and reset. The current session starts with Warm selected. | Replace the preset default with a deliberate comparison choice. Add capture, retake and mixed-result states. Keep the result visible on the kiosk while QR issuance completes. |
| Color engine | A new `src/domains/color-analysis/` module | Put calibration math, region measurements, quality evaluation, four-tone scoring, palette resolution and result schemas here. Use browser-independent TypeScript with synthetic test inputs. |
| Browser capture | New capture hook and worker beside the kiosk studio | Own the video track, local facial landmarks, neutral frame sampling, cancellation and cleanup. The worker sends quality states and derived measurements to the kiosk UI. |
| Authorization and persistence | [`/api/kiosk/sessions`](../src/app/api/kiosk/sessions/route.ts), [`/api/kiosk/report`](../src/app/api/kiosk/report/route.ts) and the [session service](../src/domains/sessions/service.ts) | Resolve the station's permitted mode when the session starts. Add a versioned camera consent operation. Validate the result variant, current configuration and palette references under the existing kiosk session lock. |
| Mobile report and discovery | [Report page](../src/app/(mobile)/results/%5Btoken%5D/page.tsx) and [discovery service](../src/domains/recommendations/discovery.ts) | Render manual and contrast-based reports from their stored versions. Pass only the existing manual preference, where applicable, or the shopper's explicit preferences into jewelry discovery. |
| Measurements | [Event service](../src/domains/analytics/events.ts) and [`client-events.ts`](../src/lib/client-events.ts) | Preserve canonical funnel events and add a small set of camera outcomes with stable event IDs. Keep research comparisons outside the retail funnel. |

## 2. Browser processing and interaction

1. **Offer the route.** Launch the existing anonymous kiosk session. Offer manual visual comparisons immediately. Ask for camera consent before requesting video, in the kiosk's configured language. Use a secure browser context and request video only. [W3C Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/)
2. **Acquire and calibrate.** Use one approved camera, browser capture configuration, fixed station lighting and a neutral screen during metering. Fit a first-order mapping from the browser's explicitly documented color representation to reference XYZ using the physical chart. Convert XYZ to Lab with the documented reference white. Reserve independent patches for ΔE₀₀ checks. Record the browser, negotiated video settings, chart, expected white point, mapping revision and patch error. Require a passing daily chart check for automated scoring. A station or camera change invalidates the existing calibration until rechecked. [He et al., 2022](https://doi.org/10.1002/col.22737) · [ISO/CIE Lab](https://www.iso.org/standard/74166.html)
3. **Locate the sampling regions.** Pin the MediaPipe Tasks Vision package, model and WASM assets together and serve them from the application origin. Use Face Landmarker for geometry and browser Canvas for pixel sampling. Run synchronous landmark processing in a worker with one frame in flight. Fix and test the landmark masks for both brows and the surrounding skin. Exclude the eyelids, hairline, shadows from glasses and other unusable pixels where detectable. Treat insufficient usable area as a failed capture. [MediaPipe Face Landmarker guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker?tab=Web) · [MediaPipe JavaScript API](https://developers.google.com/edge/api/mediapipe/js/tasks-vision.facelandmarker)
4. **Check stability.** Reject zero faces, multiple faces, poor alignment, blur, clipping, uneven illumination, occlusion and excessive frame-to-frame contrast variation. Use exposure and clipping measurements for the gate and evaluate its coverage across skin-lightness bands. Start the bench spike at roughly 5–10 sampled frames per second and aim for eight accepted frames in a three-second window. These are provisional performance settings. Check the actual brow region resolution and adjust from bench results. Offer one guided retake, then manual comparison.
5. **Score and reveal.** Average calibrated L\* within each brow and adjacent skin mask. Use the absolute adapted Michelson ratio per valid region and the median across accepted frames and sides. Score the four fixed tones with the rule from the research plan. The population baseline and fitted Bradley–Terry candidate run in the offline evaluation pipeline. The kiosk runs only the selected, versioned scorer. Show a clear result, a mixed result or a manual comparison as allowed by the active mode. Use localized swatch names, keyboard-accessible controls and reduced-motion support. [Published facial contrast method](https://pmc.ncbi.nlm.nih.gov/articles/PMC5524771/)

The kiosk state flow is `idle → choose → consent/position → capture → local result → save → QR`. Manual comparison branches from `choose`, camera denial or failed retakes. Start the capture and worker on demand. Stop the track, clear the preview and canvas, close frame objects, cancel pending work and discard all frame data when capture finishes, on reset, on session expiry, on page exit and after a terminal camera error. Bind pending work to the current session so permission responses, worker messages and save callbacks from a previous session cannot affect the next customer.

Resolve named shades through the [swatch library and hue-ranking design](COLOR_ANALYSIS_ENGINE_PLAN.md#4-named-shades-and-personalized-hue-ranking). Each swatch has a stable ID, localized name, role, physical reference and measured color. For a tone-based result, resolve several different hue families and a small curated neutral set from the versioned library. Use the same camera view on both sides of a local drape comparison so only the drape changes. Present names and swatches on the phone. If the optional hue model passes independent validation, version its coefficients alongside the tone method and extend the automatic request with optional `rankedSwatchIds`. Accept those IDs only for the approved method and its allowed tone groups. Preserve the resolved order and snapshot for existing reports.

## 3. Versioning, consent and rollout modes

Use a server-owned station configuration keyed by authenticated device ID for the first store. Keep the configuration small and version-controlled. Track the method and parameters, palette revision, calibration revision, the latest passing station check and permitted mode. Publish only the configuration needed for local processing in the existing session-start response. Resolve organization, store and device on the server from the session credential. Recheck the active mode and calibration at report issuance so disabling a method also affects active sessions.

| Effective mode | Kiosk behavior | Server behavior |
| --- | --- | --- |
| `manual` | Show interactive manual draping. Enable local camera preview only by consent and when configured. | Default in all environments. Accept manual and explicitly uncertain results. |
| `research` | Allow capture and derived measurements on a named development or UAT station. Keep predictions hidden while volunteers record drape choices. | Reject automatic retail reports. Use separately approved study collection and research consent. Reject research mode in production. |
| `automatic` | Show the approved automatic result on an eligible device and offer manual comparison for failure or mixed results. | Accept automatic results only for an approved method and station with current calibration, approved camera consent and compatible version IDs. Public enablement requires the [v2 validation gate](Sinar_Fajar_Development_Plan_v2.md#3-local-computer-vision-and-validation). |

Use the existing `Consent` table for the session-scoped camera decision and notice version. Add a kiosk-bearer operation for that decision. Check its scope and the current grant on the server before accepting automatic reports. Treat a previously granted browser permission as independent of the current customer's consent. Record a separate research consent through the study workflow.

## 4. Report contract and data changes

The [color recommendation variables](COLOR_RECOMMENDATION_VARIABLES.md) define the palette, shopping preferences and verified catalog attributes that the mobile ranker can use after activation.

Keep the existing `POST /api/kiosk/report` route and response envelope. Continue accepting the current `{ profile, palette }` body as the legacy manual variant during the rollout. Add a strict discriminated request for the new kiosk. The following shapes describe the intended wire contract.

```ts
type Tone = 'vivid' | 'dark' | 'pale' | 'dull'
type ToneSelection = [Tone] | [Tone, Tone]

type ColorResultInput =
  | { kind: 'manual'; paletteId: string; paletteVersion: string }
  | {
      kind: 'automatic'
      tones: ToneSelection
      quality: 'stable' | 'mixed'
      methodVersion: string
      paletteVersion: string
      calibrationVersion: string
    }
  | { kind: 'uncertain'; reason: 'no_clear_match' | 'capture_unavailable' }
```

- Use strict Zod objects, enum validation and bounded IDs. Resolve swatch values server-side. Require unique tones and a valid tone selection for the approved method. Map the submission to `ColorSource`, quality and uncertainty server-side. This validates the allowed output of managed kiosks. Local capture measurements are trusted only as a signal from that station and the server never needs the underlying face data.
- Add nullable `paletteVersion` and `calibrationVersion` fields and a `toneGroups` array with an empty default to `ColorAnalysis`. Make `profile` nullable for contrast-based reports. Keep its existing values for historical and legacy manual results. Continue storing the resolved swatch snapshot so older reports retain their original appearance. For a new manual PCCS palette, store its selected tone and leave `profile` empty. Explicit uncertainty keeps the existing uncertain result semantics. Use `AUTOMATIC` only for an accepted automatic submission. Additive changes and null-safe readers should ship before automatic writes are enabled.
- Derive `methodVersion` and the effective report source from the permitted variant. Store the analysis, token hash and server-authored completion event together. Keep the existing opaque server-generated random report token, expiry and independent kiosk reset. Build the QR URL using a configured, validated HTTPS origin in UAT and production.
- Serialize submission on the client and retain the successful response in memory until reset. Handle a duplicate report explicitly. For a lost first response, provide an explicit kiosk-authorized QR recovery action that reissues the same saved analysis while the kiosk session is active and before handoff. Keep one active token hash and the original expiry. Use a handoff timestamp on `MobileReportToken` written on QR visibility acknowledgment or first authorized report access. Serialize stamping and recovery on the report row. Authorized link previews can prevent rotation, while human-open analytics still require the existing visibility signal. Drop any stale first response in the client and verify recovery without another analysis or completion event.
- Render tone labels from stored tone groups on mobile. Pass null as the existing `color` ranking input for contrast-only or uncertain results. Keep the customer's explicit metal preference on mobile and the existing recommendation authorization and inventory checks. Four-tone results provide drape guidance only during this phase.

The runtime report and events carry no frames, portraits, landmarks, brow/skin Lab readings or continuous contrast values. Timing, fit and calibration records used for engineering can reference the station and versions. The study uses only its separately approved, pseudonymous fields and retention policy.

## 5. Instrumentation and study artifacts

- Keep `color_analysis_started`, `color_analysis_completed`, `color_result_viewed`, `qr_displayed` and `mobile_report_opened`. Move start to the first actual comparison or capture. The server writes completion after saving the analysis. Visibility events fire when the relevant view becomes visible. Reuse the same event UUID when retrying delivery and keep QR handoff and mobile product CTR independent.
- Add bounded kiosk outcomes for capture failure, retake and fallback. Use enums for reasons and record only the needed duration or station version. Enforce allowed producer and payload shape on `/api/events`. Use `ColorAnalysis` to count manual, uncertain and automatic reports consistently. Record method quality alongside the funnel without mixing usability metrics with preference-prediction evidence.
- For the study, use a simple station workflow on UAT and one versioned table of randomized physical drape pairs. Keep the primary tone comparisons within each hue family. Use a separate block matched on lightness and chroma when testing personalized hue ranking. Capture the two repositioned measurements and choices under a random study ID after consent. Mark the assigned development or holdout split at participant level. Store the approved derived values, swatch IDs, order and choices in an access-limited study dataset outside production analytics. The study operator records choices before seeing a result. Raw media stays ephemeral.
- Keep the analysis script, synthetic fixtures and configuration format in the repository. Archive the protocol revision, swatch references, development coefficients, frozen cutoffs, calibration and holdout aggregate results. Run the primary comparison against the population baseline and report whole-participant confidence intervals, coverage and repeat-capture agreement using the [research scorecard](COLOR_ANALYSIS_ENGINE_PLAN.md#proposed-acceptance-criteria-for-the-research-result).

## 6. Implementation order and acceptance

| Order | Work package | Completion evidence |
| --- | --- | --- |
| 1 | **Bench spike.** Try MediaPipe and the neutral capture workflow on the intended kiosk. Establish reference swatches, calibration and acceptable capture conditions. | Recorded device setup, held-out chart errors, repeat captures, track teardown and a responsive touchscreen. |
| 2 | **Pure engine and manual flow.** Implement palette registry, color conversion, region contrast, quality gates and scoring. Replace the Warm default with explicit visual selection. | Vitest fixtures verify conversion and contrast values, non-finite inputs, degenerate anchors, ties, mixed outcomes and version selection. Manual flow works with camera denied. |
| 3 | **Device-scoped modes and study workflow.** Add camera consent and browser worker integration. Capture approved study data in development/UAT. | Integration and browser tests show consent and mode enforcement, deterministic capture outcomes through fixtures, local cleanup and no camera payload leaving the station. |
| 4 | **Compatible report and handoff.** Add the migration, versioned request and null-safe mobile reader. Verify legacy and new reports and pre-display recovery. | Integration tests cover roll-forward from seeded data, invalid or stale IDs, duplicate writes, recovery, reset, expiry, revocation and tenant scope. Playwright verifies manual and mixed views, QR visibility and retained mobile access after reset. |
| 5 | **Scientific and release review.** Run the registered holdout, publish evidence and enforce the public release decision. | Puri Mall scorecard, hardware UAT, mobile activation boundary tests, release approval and a tested server switch back to manual. |

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run build` and `npm run test:e2e` in the supported development environment. Reuse the [journey test](../tests/browser/journey.spec.ts) to confirm zero provider calls on the kiosk, QR views and link previews and to verify explicit mobile activation still works. Include synthetic fixtures for branch coverage and separate evidence from the real kiosk camera and display. Log implementation progress and acceptance evidence in [Development progress](DEVELOPMENT_PROGRESS.md) and update [API](API.md), [Database](DATABASE.md) and [KPI definitions](KPI_DEFINITIONS.md) as contracts change. Keep this work within Phase 3.

## Inputs to resolve during Phase 3

- Confirm the target camera, lighting, kiosk display, reference chart and the source of the 20 swatches. The bench spike determines supported camera controls and the station tolerances.
- Approve the camera notice, volunteer research consent, allowed study fields and retention. Confirm the display wording and UAT procedure with Sinar Fajar.
- Keep public automation disabled while the current specialist review is outstanding. If the intended release is a volunteer-validated styling predictor without specialist review, record an explicit revision to the v2 release criterion through the project decision process.
