# Phase 6 production readiness

## Dependencies reviewed before changes

| Evidence from completed phases | Release dependency |
|---|---|
| Phases 1–2 use local Supabase with synthetic catalog and mock OpenRouter responses | Separate hosted Supabase Auth, PostgreSQL and Storage projects for UAT and production, approved roles and catalog, approved OpenRouter model/provider and spend limits |
| Phase 3 browser tests use simulated camera and viewport | Puri Mall mini PC, touchscreen, camera, lighting and phone testing. Confirm final domain, privacy notice and QR retention. Specialist validation is required before any automatic classification. |
| Phase 4 verified the mock POS, CSV and simulated QR scanner | Vendor documentation and sandbox credentials or an approved CSV operating procedure. Confirm inventory freshness, store/SKU mappings and refunds. |
| Phase 5 verified analytics and experiments on fixtures | Approved baseline/control data, uptake measures, staffing protocol and enough mature cohorts to assess targets. |
| Known hosted gaps | Approved secrets and independent environments, route-log redaction, alert delivery, backup policy, hosted restore rehearsal, regional processing and privacy review, client UAT acceptance and project-owner approval. |

## Implementation checklist

- [x] Harden credentials, API quotas, signed jobs and replay controls.
- [x] Add consent withdrawal, deletion and bounded retention with audit evidence.
- [x] Fail closed on unverified inventory and add health, error and kiosk monitoring.
- [x] Add GitHub verification and document hosted isolation, restore and rollback.
- [x] Exercise local UAT and restore scenarios and record the remaining release gates.
- [ ] Complete client UAT, hosted recovery and alerting, hardware validation and release approvals.


## Release assessment

**Production release is on hold.** The code, tests and operating guides are in the Projects checkout. The local system is synthetic. Hosted UAT, physical compatibility and approvals are open.

| Scope | Engineering evidence | Release gate |
|---|---|---|
| Credential scope and expiry | Existing kiosk, report and cashier credentials remain independently scoped. Added device expiry, bounded payloads, cross-instance rate limits and signed scheduled jobs with replay checks. Local tenant and credential tests exercise denial paths. | Verify deployed role grants and end-to-end private path/header redaction. |
| Privacy | Browser-only camera, minimal AI payloads, customer withdrawal and deletion, bounded retention, audit entries and disconnected sale and charge links. | Agree privacy notice, processing regions, providers, retention, privileged access and backup erasure handling. |
| Reliability | Deterministic fallback, inventory age check, no-store browser reads, bounded outbox replay and redacted readiness response. | Verify working store network recovery, current stock feed and supervised provider failure/fallback. |
| Backup and migration | Applied migration 007 to loopback PostgreSQL and confirmed all four new tables enable RLS and deny browser API roles. Restored the Phase 5 synthetic backup to a separate database with migration 006, 43 catalog rows and no Phase 6 tables. | Exercise hosted recovery, Auth and Storage recovery, and previous-app or forward-fix rollback with erased links preserved. |
| Monitoring | Health endpoints, authenticated aggregate collector, device heartbeats and threshold configuration. | Wire a monitor and alert receiver in UAT, verify pages reach the on-duty operator and measure actual store-hour uptime. |
| Retail operations | Existing local mock POS and CSV flows. | Verify a client-approved export process or obtain POS and inventory vendor documentation, sandbox and least-privilege credentials. |
| Physical UAT | Browser coverage uses test camera feeds, denial simulation, touchscreen emulation and synthetic data. | Confirm Puri Mall mini PC, touch, camera, lighting, phone handoff and staff scanner compatibility. |
| Approval | No hosted release executed. | Record Sinar Fajar's acceptance of UAT and separate, explicit project-owner release approval. |

See [UAT scenarios and evidence](UAT.md), [deployment and recovery](DEPLOYMENT.md) and [administrator, staff and kiosk handover](HANDOVER.md). The store-hour availability target of 99.5% requires pilot measurement, as do AI latency and cost, event delivery and staff acknowledgment.


### Security and failure evidence

The initial npm production audit flagged the CSV parser and two libraries pulled in through Prisma's configuration tooling. Upgraded `csv-parse` to 7.0.3 and pinned `deepmerge-ts` 8.0.1 and `effect` 3.22.1 under the existing Prisma 6 configuration package. The follow-up `npm audit --omit=dev --audit-level=high` reported zero vulnerabilities. [CSV advisory](https://github.com/adaltas/node-csv/security/advisories/GHSA-8cw4-87c7-c6xx) · [Deepmerge advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) · [Effect advisory](https://github.com/Effect-TS/effect/security/advisories/GHSA-7589-6fvf-x4pw)

An independent process pointed at an unreachable loopback PostgreSQL endpoint received a redacted readiness response with status 503. The working database remained available. Prisma validated the model. A direct Prisma introspection diff could not traverse the existing Supabase Auth cross-schema foreign key. PostgreSQL confirmed the applied migration, Phase 6 column nullability and browser-role denials directly. GitHub workflow YAML parsed locally and awaits its first hosted run against the release revision.


### Local verification on 26 November 2026

| Check | Result |
|---|---|
| Lint, strict TypeScript and production-mode Next.js build | Passed with the patched lockfile. The build generated 38 static pages and verified dynamic route compilation. |
| Vitest | 15 unit tests and 30 local integration tests passed. |
| Production-mode Playwright on Edge | All 5 tests passed in the final serial run. Coverage includes offline inventory on discovery and product details, restoration on reconnect, QR and kiosk reset, staff operations, catalog import, dashboard and mock POS. |
| Advisory and workflow validation | Production npm audit reported zero vulnerabilities. The final GitHub workflow YAML and local Supabase gateway health endpoint were verified. Hosted CI has not yet run. |
| Readiness and recovery | Live local responses, an unreachable PostgreSQL readiness failure and an isolated restore of the synthetic Phase 5 database were verified. Hosted rollback remains open. |

The first browser run under concurrent test load hit one dashboard navigation timeout. The focused follow-up reached the dashboard and the final full browser run passed without a timeout change. OpenRouter tests used controlled mock responses. There was no client hardware, provider billing, store-hour uptime or production alert delivery evidence in the local run.
