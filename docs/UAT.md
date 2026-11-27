# Phase 6 UAT plan and evidence

Record the revision, environment, operator, store, hardware, browser, time, expected behavior, observed result and sanitized evidence on each run. Evidence from local automation is listed separately from required client sign-off.

| Scenario | Local evidence source | Client UAT gate |
|---|---|---|
| Staff authentication, roles, organization/store isolation and direct object access | Foundation, browser journey, operations and release tests | Verify real role matrix and hosted RLS/runtime roles |
| Catalog management, product import, product photo restrictions | Catalog browser and discovery integration | Sample approved catalog and hosted Storage policy |
| Anonymous session, attract, manual/optional camera and result reveal | Browser journey and kiosk resilience | Store touchscreen, camera, lighting and independent observers |
| Human QR and no-login report, preview, reset and report expiry | Browser journey, kiosk resilience and release/foundation suites | Independent iOS and Android cameras with approved HTTPS origin |
| Questionnaire, explicit activation and rule outcome | Browser journey and discovery integration | Real phone with in-store network and catalog |
| Valid OpenRouter, invalid output, failure, timeout and duplicate activation | Mocked discovery integration | Approved model/provider, scoped credentials and a supervised live run |
| No paid calls on kiosk, report or preview | Browser journey and release suite | Check provider billing and monitor in hosted UAT |
| Automatic classification gate and manual fallback | Kiosk UI camera-denial scenario and source audit | Expert sign-off before automatically classifying, manual path accepted independently |
| Mobile inquiry, staff assignment, fulfillment and physical try-on | Operations browser/integration and browser journey | Staff rehearses assigned devices, actual scanner and cabinet retrieval |
| POS attribution, refund/cancel, duplicates and stock freshness | Mock/CSV operations tests and stale-stock integration | Cashier rehearses approved POS or CSV process and inventory source |
| Management dashboard and experiments | Analytics browser/integration and discovery | Manager reviews realistic reports and experiment guardrails |
| Privacy withdrawal, deletion, ledger unlinking and report invalidation | Release integration and journey token checks | Approved notice, record workflow, backup handling and hosted trace review |
| Database, browser offline and event recovery | Readiness probe, browser network scenarios, dedupe tests and local restore | Hosted failover, monitor routing and store network test |

## Defect severity

- **P0 Critical** includes cross-tenant exposure, credential leakage, unauthorized inference or data corruption. Block release and escalate on discovery.
- **P1 High** includes inability to finish an essential customer or staff flow, unsafe stale inventory or failed restore. Block release until fixed or until the release scope is explicitly agreed and re-tested.
- **P2 Medium** covers a degraded workflow with a documented safe workaround. Assign an owner, evidence and target date.
- **P3 Low** covers cosmetic or wording issues with no workflow impact. Track and prioritize with the pilot owner.

Sinar Fajar must accept the actual UAT results and the responsible project owner must separately approve production deployment. Local or mocked tests provide engineering evidence only.


## Executed local evidence

The final Windows Edge run on 26 November 2026 passed five scenarios against the production-mode Next build. Vitest passed 15 unit tests and 30 integration tests with local PostgreSQL, Supabase Auth fixtures and controlled provider outcomes. An initial dashboard navigation assertion under parallel load exceeded its five-second timeout. The focused check and serial full run passed. Track any recurrence as P2 until the pilot establishes its load and responsiveness baseline.

The browser run used emulated mobile and touch inputs and synthetic camera data. The readiness failure used a separate process pointed at an unreachable loopback service. The restore was made into a distinct synthetic database. Collect independent evidence for physical hardware, hosted environment recovery and live monitoring before sign-off.
