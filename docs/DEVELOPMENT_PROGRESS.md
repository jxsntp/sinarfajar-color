# Development progress

## 2026-11-25 — Repository setup

The repository began with an empty working tree and no application history on the current branch. The project context and v2 development plan were copied from the Sinar Fajar project folder. The master engineering instructions, architecture, database responsibilities, API boundaries, KPI definitions and v2 decision record are in place.

## Phase 1 — Implementation and verification

Implement in dependency order from the checklist below. The database and role matrix support the credential services, which supply trusted scope for the event API and route layouts. Use an isolated development database for verification. Phase 1 was verified before the separately requested catalog work.

- [x] Initialize the strict TypeScript application, route groups and domain modules.
- [x] Define the Prisma schema, tenant constraints, migrations and synthetic pilot seeds.
- [x] Implement staff authentication, role permissions, device registration and store scope.
- [x] Implement anonymous kiosk sessions and independent expiring, revocable report tokens.
- [x] Add environment validation, branding, feature flags, structured logging and idempotent event ingestion.
- [x] Verify migrations and seeds in development, tenant isolation, reset and report access, event persistence and route layouts.
- [x] Run unit and integration tests, browser checks, lint, type checking and a production build. Record results and outstanding acceptance criteria before phase review.

Phase 1 passed seven unit tests, six PostgreSQL and Supabase Auth integration tests, one production browser journey, lint, strict type checking and a production build. Both migrations applied and the synthetic seed ran twice. The browser journey covered real login, role-scoped navigation, device enrollment, the QR handoff, reset, event history and report revocation. Client inputs still include approved branding, representative inventory, privacy and retention decisions, and POS integration details. The [project context](PROJECT_CONTEXT.md) identifies the responsible parties and when these inputs are needed.

## Phase 2 — Catalog and mobile recommendation implementation

- [x] Extend the Phase 1 catalog, inventory, recommendation run and item records with an additive migration and tenant constraints.
- [x] Implement audited catalog administration and transactional mapped CSV preview/import.
- [x] Share SQL eligibility and bounded candidates between deterministic ranking, the provider adapter and the admin laboratory.
- [x] Implement explicit report-authorized activation, durable request deduplication, cost reservations, validation, fallback and current-inventory rendering.
- [x] Exercise mocked provider failures and concurrency, browser flows, database migrations, lint, types and the production build. Record live-provider verification separately.

### Implementation report — 26 November 2026

| Acceptance area | Evidence |
|---|---|
| Catalog management | The admin browser journey signed in, mapped a CSV column, imported a product, edited its store inventory and retrieved the exact image bytes uploaded to local Supabase Storage. Integration tests verified duplicate detection, atomic rejection of a mixed batch, archive behavior, partner management and audit records. |
| Eligibility and ranking | PostgreSQL tests exercised organization, store, stock, category, brand, purity, gold color and exact budget filters. Unit tests covered deterministic ranking, missing preferences, tie-breaking and structured output validation. |
| Inference boundary | The customer browser journey completed a kiosk session, reset the device, fetched a private report as a preview and opened it on a phone. Passive GETs created zero recommendation runs. The API rejected kiosk credentials. Explicit mobile activation produced an eligible selection and a working product detail link. |
| Reliability and accounting | Controlled OpenRouter responses exercised successful ranking, invalid SKUs, timeout, usage and cost capture, bounded rate-limit retries, cost limits and daily quotas. Concurrent equivalent activations dispatched once. Cached reads refreshed prices and excluded unavailable items. A simulated sellout during inference produced zero published items. |
| Administration and evaluation | The restricted lab ran a deterministic evaluation from the store catalog. Staff permission changes took effect on the next protected request. |
| Local validation | Eleven unit tests, twelve database/auth integration tests and two production-browser journeys passed. The additive migration applied to the seeded Phase 1 database. Lint, strict TypeScript and the production build passed. |
| Live provider and pilot targets | Pending. The environment has no OpenRouter API key, approved model or provider allowlist. Commercial model quality, live p95 latency below five seconds and actual cost below USD 0.02 per completed recommendation require representative pilot traffic. |

Rules are the default strategy. The current database contains synthetic development fixtures. Phase 3 builds on the synthetic development fixtures. UAT and production deployment remain pending.

## Local demo staff account

The local setup script generates a password in the ignored `.env` file. The seed provisions the demo identity and its Sinar Fajar Organization Admin membership on the loopback Docker stack. Two consecutive seed runs succeeded. The demo account signed in through `/login` and reached device registration in `/admin`. Lint, TypeScript, all 11 unit tests and all 12 integration tests passed. The Next.js production build passed with the existing Prisma client after Windows blocked replacement of the engine file during generation.

## Phase 3 — Experience-first kiosk and mobile discovery

- [x] Build the manual-first kiosk flow, optional local camera checks and timed reset.
- [x] Persist scoped report and consent data, issue a trusted-origin QR and build the mobile color guide.
- [x] Complete localized discovery, voluntary inquiries, try-on, feedback and sharing.
- [x] Add experiment assignments, measurement and offline event recovery.
- [x] Verify schema, local browser journeys and production build. Record pilot validation separately.

### Implementation report

| Acceptance area | Local evidence |
|---|---|
| Standalone kiosk | Browser tests reached the palette and gold guidance without a report, exercised camera denial and sampled a synthetic camera feed. Camera tracks stopped at reveal. A lost response left the result visible and QR issuance resumed with the original credential. |
| Secure handoff | A browser opened the trusted-origin report after kiosk reset. Tests verified no-store and no-referrer headers, revocation, expiry, hashed credentials and a separate store-scoped cashier code. |
| Explicit shopping | Preview traffic and unscanned sessions created zero recommendation runs. Tests rejected kiosk credentials and validated duplicate activation, live stock filtering, fallback and durable mobile experiment assignment. |
| Voluntary actions | The phone-sized Edge journey exercised keyboard navigation, palette-card download, explicit marketing consent and later contact. Integration tests verified in-store try-on and isolation of later contact from that queue. |
| Measurement | Visible QR and first mobile open use separate events. A simulated network failure replayed the QR event after reset. Repeated clicks on the same run and SKU recorded once. |
| Build and database | The additive migration applied locally. Lint, strict TypeScript within the production build, 11 unit tests, 15 integration tests and 3 Edge browser tests passed. |

### Pilot validation still pending

- Benchmark camera quality repeatability, kiosk rendering and average session length on the actual touchscreen and lighting setup. Record touch usability in both orientations.
- Confirm report handoff and accessible navigation on physical iOS and Android browsers and with a screen reader.
- Keep automatic color classification disabled until a qualified specialist validates it with representative participants.
- Use an approved OpenRouter key, model and provider to validate live model ranking, latency and cost. Local tests use controlled provider responses.
- Validate the actual public HTTPS handoff origin, approved social profile and store follow-up process in UAT.

### Personal color engine and catalog evidence

The guided kiosk uses 20 named fixture swatches across four tone groups and five hue families, plus three neutrals. The default studio requires a deliberate comparison. An enrolled development or UAT station can allow preview or consented research capture. The versioned research worker keeps frames and landmarks local and reports a coarse capture outcome. Public automatic classification is disabled.

Mobile reports keep the legacy palette presentation and display named snapshots for new guided results. Duplicate saves, token recovery before handoff, reset, expiry and revocation were exercised. Catalog edits and CSV imports accept optional verified visual components. Shared ranking scores all filtered store candidates before retaining up to 24 and keeps explicit gold preference separate from drape tone. Both engines use supported reasons and current inventory. Provider tests used synthetic responses.

The additive migration applied to the local Docker database. Lint, TypeScript, the production build, 21 unit tests, 32 integration tests and six Edge Playwright tests passed. The browser tests exercised camera denial, a same-origin Face Landmarker no-face result, track teardown, named and uncertain draping, failed QR saves, retries and the kiosk-to-phone journey. No production deployment was performed.

Development and UAT can use the fixture drapes, QR reports, rules, and named-station research capture. Physical references, approved SF inventory, representative kiosk hardware, real provider benchmarks and specialist-reviewed volunteer evaluation are pending. The [color pilot guide](COLOR_ENGINE_PILOT.md) records dependencies and the holdout procedure.

## Phase 4 — Retail operations and POS

- [x] Extend Phase 3 inquiries and try-ons with a store-scoped fulfillment workflow and operational notifications.
- [x] Add scanner input, cashier QR, POS adapter, import and reconciliation.
- [x] Add operational reporting and verify authorization, concurrency and production browser workflows.
- [x] Document local evidence and external integration blockers.

### Phase 4 implementation report

| Acceptance area | Local evidence |
|---|---|
| Correct store and single fulfillment owner | Real database integration tests routed phone requests to the originating store, blocked cross-store access and allowed one of two concurrent associates to claim the request. The browser received a new request through polling and advanced it to Ready. |
| Physical try-ons | The browser decoded a product QR from a synthetic camera feed, completed the assigned try-on and recorded independent customer confirmation on the phone. Integration tests covered numeric barcode matching, staff-recorded interactions and repeated scans or confirmations. |
| Notifications and analytics | Tests recorded new, unacknowledged, overdue and inventory-discrepancy alerts, exercised a failed external delivery with a retry lease and verified session-scoped operational events. |
| POS and reconciliation | The browser decoded the dedicated customer cashier QR and linked the mock receipt. Integration tests covered concurrent receipt replay, AI- and rules-assisted classification, recommended and non-recommended purchased items, an unmatched receipt, refund and cancellation adjustments, ordered inventory snapshots and CSV duplicate and missing references. |
| Build and migration | The additive migration applied to loopback PostgreSQL. Lint, strict TypeScript, the production build, 11 unit tests, 20 integration tests and 4 Edge browser tests passed. |

The manager report uses a seven-day view and shows pending requests at the time of viewing. The queue polls every ten seconds. The cashier code lasts 15 minutes and the configurable sale attribution window defaults to 180 minutes.

### Phase 4 pilot validation pending

The two-minute acknowledgment target requires measurement during staffed store operations. Browser camera tests used synthetic QR feeds; validate scanners and printed labels on the actual staff devices. Live n8n delivery requires an approved endpoint and credentials. Live POS and inventory integration require approved vendor documentation, a sandbox, credential and export access, store and SKU mappings, and agreed reconciliation and stock-freshness rules. See [Phase 4 setup](SETUP.md) for the CSV contract and handover details.

## Phase 5 — Retail intelligence and AI evaluation

- [x] Define timestamp, cohort, consent and missing-data rules for executive and product KPIs.
- [x] Implement scoped analytics, exports, experiment configuration and financial inputs.
- [x] Extend the AI lab with immutable prompts and historical comparisons.
- [x] Verify with known datasets, privacy checks, integration and browser tests, and the production build.

### Phase 5 implementation report

| Acceptance area | Local evidence |
|---|---|
| Executive, product and marketing dashboards | Next.js and Recharts render the kiosk-to-mobile funnel, independent marketing actions, product and category counts, experiment results and a data-quality view. Known fixtures proved distinct-session and matching-impression denominators. |
| Missing data and financial access | Tests kept unavailable sales, visitor counts and control comparisons explicit. Marketing analysts could export campaign metrics and received 403 from the financial and AI history endpoints. The financial reducer matched the approved-control fixture. |
| Evaluation lab | Admin browser tests saved a human-reviewed profile and generated historical results. The mocked provider test recorded a valid JSON shape with an invalid SKU, preserved fallback and usage, and deduplicated its evaluation batch. PostgreSQL rejected rewriting a stored prompt. |
| Experiment lifecycle and analysis | Database tests verified kiosk enrollment starts, pauses and stops, and that eligible mobile activation persists original B/C assignment despite later pause and fallback. Known fixtures checked matured sample sizes, absolute difference, relative uplift and uncertainty. |
| Build and migration | The additive migration applied locally. Strict TypeScript, lint, 15 unit tests, 23 integration tests, and 5 Edge browser tests passed. The production Next.js build used the freshly generated Phase 5 Prisma client because a Windows file handle blocked a second replacement of its DLL. |

Analysis uses Jakarta kiosk-start cohorts. Product-only filters preserve early funnel denominators. Unmatched or mock receipts do not enter verified purchase and revenue outcomes. Approved source data is required for footfall and verified marketing outcomes. Incremental contribution and projected ROI require a comparable approved control.

### Pilot validation pending

The local environment has no OpenRouter key or approved model/provider list. Live comparison, provider latency and cost remain unverified. Pilot KPI targets, uplift and financial contribution require mature cohorts, approved source coverage and comparable control data.


## Phase 6 — Security, UAT and production preparation

- [x] Implement and test credential expiry, quotas, signed jobs, privacy controls and scoped data erasure.
- [x] Implement and test stock freshness, offline reconciliation, readiness and aggregate monitoring.
- [x] Add GitHub verification and document setup, staff operations, UAT, release and recovery.
- [x] Apply the additive local migration and rehearse the synthetic backup restore in an isolated database.
- [x] Pass lint, strict TypeScript, production build, 15 unit tests, 30 integration tests and five serial Edge tests.
- [ ] Record hosted UAT, physical store hardware compatibility, external alert delivery, vendor or approved CSV operating evidence, hosted recovery and approval.

Phase 6 customer scope remains mobile activation only. The production dependency audit reported zero vulnerabilities after targeted upgrades. The environment remains a local synthetic implementation. See [the production readiness report](PRODUCTION_READINESS.md) for evidence and the release decision.


### Camera availability on registered kiosks

Manual camera preview is available on every registered kiosk after session consent and browser permission. The station registry continues to govern calibrated modes.

A smoke test on the development kiosk at localhost:3000 verified the camera option, recorded consent, displayed simulated video and stopped the track when switched off. Lint, 21 unit tests, 32 integration tests, the production build with TypeScript, and two focused Edge camera tests passed. Physical webcam testing remains pending.


### Local camera-generated palette

An enrolled manual kiosk on localhost can show an experimental palette after the user opts into camera analysis. The real MediaPipe worker returned vivid and dark swatches for a framed sample portrait and pale and muted swatches after its contrast was reduced. The unframed portrait reached the manual fallback. The browser stopped the camera after capture. Lint, 21 unit tests and all 33 integration tests passed, including the local-only exposure and automatic-report checks.


### Camera analysis to registered mobile recommendations

The development kiosk now ranks three colors and suggests one metal from the local camera capture. It saves the ranked snapshot and shows a private QR. The mobile detail page remains visible before registration. Submitting name, email and phone explicitly activates discovery using those colors and the suggested metal.

The live Edge smoke test ran the actual MediaPipe worker using a public test portrait. It verified three matching swatches on the kiosk and the mobile page, QR access after kiosk reset, a 403 before registration, exactly three form fields, and two seeded inventory recommendations after registration. Registration fields were absent from the activation payload. Lint, TypeScript, all 21 unit tests, all 34 integration tests and a production build passed. Physical phone scanning requires a trusted HTTPS report origin, and public camera ranking still requires validation.


### Four jewelry categories in camera discovery

Camera-based mobile discovery selects one eligible item each for earrings, necklaces, rings and bracelets when the store has stock. The results show a separate section for each category. A refresh reselects candidates using current stock. The local demo seed includes labeled sample earrings and a bracelet alongside the existing necklace and ring.

A live Edge test verified four populated category sections after camera analysis, QR handoff and registration. The integration test verified category aliases, one result per category, and the replacement or removal of sold-out recommendations on refresh. Lint, TypeScript, 21 unit tests, 34 integration tests and the production build passed.

### 27 November 2026 — Photo-only trial catalog

The new store-scoped photo catalog accepts batches of catalog pictures and supports reviewing, publishing, and archiving visual tags. When an approved vision model is configured, administrators can request tags from the upload screen. The registered mobile trial matches approved catalog photos to the camera palette and shows one visual pick per available category. The original images load through the report origin. Only the commercial catalog supplies specifications, price, and availability.

The additive migration ran on the isolated development database. All 21 unit tests and the 13 targeted color and discovery integration tests passed. The new integration fixture used a controlled provider response to verify proposals, multiple candidates per category, validated selections, report isolation, cached activations, archiving, and rules fallback. An Edge test verified staff upload and publication, three-field registration, all four mobile categories, the original bytes on the report origin, and one styling impression. Lint, TypeScript and the production build passed. The live provider configuration and actual Sinar Fajar catalog photos remain pending.

### Windows build with a running kiosk

Windows was holding the generated Prisma engine open while the kiosk used the database, which prevented `prisma generate` from replacing it. When the installed Prisma CLI has the matching engine revision, the Windows server loads that library so the generated copy remains available for builds. The full `npm run build` passed while the kiosk kept the same process and reported database readiness before and after the build. Lint and all 21 unit tests passed.

### Vercel configuration and Supabase readiness

Hosted builds now report all missing or invalid environment settings before compilation. The runtime uses the same validation and readiness checks that the kiosk organization and required catalog tables can be queried. A deployment can explicitly disable the inventory age cutoff with `INVENTORY_MAX_AGE_MINUTES=off`.

All 10 approved migrations applied to the initially empty Supabase application schema. The configured Sinar Fajar organization was then created and verified. The completed hosted env file passed preflight. A local production-mode server using the hosted database returned HTTP 200 for readiness, the kiosk, and the staff login page. Lint, 25 unit tests, 14 targeted integration tests, and the full local build passed. Vercel settings and deployment remain pending.

### 27 November 2026 — Camera measurement quality (color engine part A)

The capture worker now measures skin from both cheeks and, when hair or glasses leave it clear, the forehead. The thin skin strip above each brow is used only for brow contrast. Skin and reference regions use trimmed medians that drop the lightest and darkest 10% of pixels, removing highlights and shadows. Brow lightness uses the darkest half of brow pixels so skin between hairs no longer dilutes the contrast. Cheek-to-cheek lightness replaces the brow strips for the uneven-lighting check, and a capture is rejected when a frame's skin color drifts more than ΔE₀₀ 6 from the capture median.

Each capture summary derives chroma, CIELAB hue angle and individual typology angle (ITA°) from the median skin color. These remain local and are not stored in reports or events.

A gray card in the on-screen reference square now white-balances each frame using a Bradford adaptation that keeps the card's measured lightness. The localhost trial uses the card when one is detected. A research station can require it with `whiteReference: true`. Frames whose card reading drifts more than ΔE₀₀ 3 from the capture median are dropped, and balanced and unbalanced frames are never combined. A card overlapping the face bounding box or with a chroma above 15 is ignored.

The kiosk preview camera now uses the shared camera runtime, so there is one implementation of opening, stopping and track cleanup. The method revisions changed to `contrast-rule-fixture-v2` and `camera-harmony-trial-v2` because the measurement changed. The fixture tone thresholds are unchanged and remain provisional.

Lint, TypeScript, all 32 unit tests, all 35 integration tests, the production build and all 7 Playwright specs on Edge passed. The new unit tests use a synthetic face image with landmark masks to verify brow contrast, cheek skin, hair over the forehead, uneven lighting, pose and face-count failures, cast correction and the required-card failure. No real face or physical gray card has yet been tested on kiosk hardware, so the region masks and card limits still need a bench check.

### 27 November 2026 — Feminine and masculine color styles

Before drape comparison or camera analysis, the kiosk offers **Semua gaya**, **Feminin** and **Maskulin** (all styles, feminine and masculine), with all styles selected by default. The camera ranking, the drape result palette and uncertain-result neutrals use only the chosen set. The kiosk and phone headings show the chosen style, and the phone shade picker shows the same set. The new `sf-drapes-fixture-v2` revision keeps the original 23 swatches and adds 21 style-tagged display fixtures. Every style offers at least three shades for each tone pair. The additive `202611270011_color_style` migration adds the nullable `ColorAnalysis.colorStyle` column with a value check, and it was applied to the local development database.

Lint, TypeScript, the production build, all 34 unit tests, all 36 integration tests and all 7 Playwright specs on Edge passed. The new tests cover the revision's preserved swatches and lineage matching, the minimum shades for each style, style-limited camera ranking, the stored style, rejection of trial swatches outside the chosen style, and the feminine kiosk flow with its report payload. The added colors are illustrative and still need physical drapes and measurement.

### 27 November 2026 — Descriptive face measurements (data collection step 1)

The new `face-geometry.ts` module measures from the existing landmarks:
- face length-to-width ratio;
- forehead, jaw, chin, nose and mouth widths relative to the cheekbones;
- jaw angle and chin depth;
- the middle-to-lower facial third ratio;
- cheekbone height and approximate cheek prominence;
- eye width, openness, spacing and iris distance;
- brow arch and lip heights.

Frame sampling also measures lip color and its lightness contrast and redness against the skin. In the localhost trial, the landmark model's expression scores mark each frame neutral or not. The console readout lists every frame, including rejected ones, and gives the median and spread of each measurement over accepted neutral frames. The measurements do not leave the browser or affect results. The study input accepts approved values under `face`.

Lint, TypeScript, the production build, all 39 unit tests and the camera, kiosk and photo-trial Playwright specs on Edge passed. The new unit tests check each proportion against a synthetic face with hand-calculated values. They also cover missing depth, incomplete meshes, the neutral-expression limits, feature summaries, and lip contrast and redness on a painted synthetic face. The landmark choices have not yet been checked on real faces. The upper facial third, iris color and hair color are not yet measured.

### 27 November 2026 — Station chart calibration (color engine part B)

Administrators can calibrate a station camera at `/admin/calibration` on the kiosk browser. The page:
- locks the camera's exposure and color-temperature controls where the browser exposes them;
- overlays a 6 × 4 guide for a ColorChecker Classic and samples the middle of each patch over 15 frames;
- fits the camera-to-XYZ transform on 18 patches and checks six held-out patches, including light skin, with CIEDE2000;
- shows the error for every patch and rejects clipped readings and an upside-down chart;
- outputs the device's `COLOR_STATIONS` entry with its locked camera settings, without storing anything.

The reference data uses the published 2005 BabelColor averages adapted from D50 to D65. A current `manual` station entry now supplies the localhost camera trial's calibration, camera settings and gray-card requirement, and the saved trial records that calibration revision. On-screen swatches and metal samples are now always converted as sRGB. They were previously converted with the camera calibration, which would have distorted swatch scores once a real calibration was used.

Lint, TypeScript, the production build, all 42 unit tests, all 37 integration tests and all 8 Playwright specs on Edge passed. The new tests fit an ideal sRGB camera with a mean held-out error below 1.5. They cover the rejection paths, the station entry, the current and stale station lookup, and the administrator page end to end with a synthetic chart video. No physical chart or kiosk camera has yet been measured, and the provisional targets still need the hardware review.

### 27 November 2026 — Kiosk experience redesign (first pass)

- **Comparison:** the drape comparison now fills the right half of the kiosk with two large previews, each a neutral outlined figure wearing the drape color. Customers tap a preview to choose it. Progress dots show the six comparisons. When the camera preview is on, the drapes stay overlaid on the video and the choices stay in the left column.
- **Privacy screen:** one primary action. Camera analysis is primary where the trial is available, otherwise manual comparison. The other paths are secondary links, and the staff-assisted toggle moved to the session footer.
- **Result:**
  - The swatches the customer picked during comparison, or the three ranked camera colors, appear first and larger under "Pilihan Anda" (your picks), followed by "Warna lain untuk dicoba" (more colors to try) and the neutrals.
  - The result heading is now a short label instead of a large serif line.
  - The swatch grid uses fixed columns so long names no longer break the alignment.
  - The right half shows an arch built from the customer's own colors in place of the generic artwork.
- **Enrolled kiosks:** they no longer show device enrollment or the staff sign-in link to customers. Staff can still open `/login` directly.
- **Fixes:** the "Keduanya" and "Belum yakin" links had run together and are now separated, text links have 48 px touch targets, and the heading takes focus without scrolling.
- **Portrait layout:** portrait screens put the stage first and center the content.

Lint, TypeScript, the production build, all 42 unit tests and all 8 Playwright specs on Edge passed. The kiosk test now also checks the picks section and the hidden setup links on an enrolled kiosk. The screens were reviewed in screenshots at 1280 × 800 and 1080 × 1920. They have not yet been tried on the store's touchscreen.

## 28 November 2026 — Analyst-style comparison

The comparison now follows how a draping analyst works, instead of asking which tones the customer prefers.

- **Question:** with the camera preview on, the customer sees their own face, so the kiosk asks which drape makes the skin look more even and the under-eye shadows softer, with a hint to look at the face, not the fabric. In staff-assisted sessions the same question is addressed to staff holding physical drapes. Without the camera or staff, the kiosk says plainly that it is asking which color the customer would rather wear.
- **Order:** gold against silver metal first, then two light-against-deep comparisons, two clear-against-soft, and two between the leaders of each dimension. Later steps depend on earlier answers. The tone result rule is unchanged. The manual method is now `manual-drape-v2`.
- **Camera trial:** the engine's top two colors are each compared against the same hue family in the opposite tone before the result appears. Two agreements confirm the trial, a mix shows it with a note, and two opposite choices overrule it and continue into the full comparison with the preview still on.
- **Storage:** `ColorAnalysis.metal` records the metal step and `ColorAnalysis.engineCheck` records `confirmed`, `split` or `overruled` (migration `202611280012_drape_checks`, applied to the local development database only). The mobile report suggests the chosen metal.

Lint, TypeScript, the production build, 44 unit tests, 38 integration tests and all 8 Playwright specs on Edge passed. The trial confirmation is covered by unit and integration tests only, because the browser fixtures cannot produce a real face for the trial. The flow has not been tried on the store touchscreen.

## 28 November 2026 — Face-metered exposure

Webcam auto exposure meters the whole frame, so a bright background leaves the face dark. On a camera without locked station settings, the kiosk now samples the cheeks and nose inside the face guide twice a second and steers exposure compensation, then a manual exposure time, then brightness, whichever the camera exposes. It corrects only a face clearly too dark (mean luma below 95) or near clipping (above 190), so darker skin is not pushed toward one target. It pauses during a capture, stops when staff move the exposure slider, and never runs on a calibrated station. When no control can move further, the kiosk asks for front light. 47 unit tests, the build and all 8 Playwright specs passed. It has not been tried on a physical webcam yet, and whether it helps depends on which controls the webcam exposes to the browser.
