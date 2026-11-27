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

### Kiosk session transaction deadline

A live session-start request with a diagnostic device returned HTTP 500 after 6.6 seconds and committed no session. The diagnostic device was revoked. Session startup now allows up to 15 seconds in its transaction for the device lock, experiment assignment, and event write. Server logs include Prisma error codes when database failures cause a 500. The integration regression holds the device lock past Prisma's five-second default and verifies that the new session persists.
