# Server interaction contracts

JSON API responses contain either `data` or `error: { code, requestId }`. API responses use private no-store caching. An operation label and request ID support diagnosis without logging credentials or request bodies.

| Endpoint | Credential and behavior |
|---|---|
| POST / DELETE `/api/devices` | Admin cookie. Register a labeled kiosk or POS device for an owned store, or revoke it by ID. Return the raw credential only at registration. |
| POST `/api/kiosk/enroll` | Registered device bearer. Set an HTTP-only, same-site device cookie on the kiosk. |
| POST `/api/kiosk/sessions` | Device bearer or enrolled kiosk cookie. Start a session, return its short-lived kiosk bearer and finalize the previous device session. |
| POST `/api/kiosk/report` / `/api/kiosk/reset` | Kiosk bearer. Save a manual palette result and issue its report path, or release the kiosk for the next customer. |
| POST `/api/reports/revoke` | Admin cookie. Revoke an organization's report by session ID. |
| POST / GET `/api/events` | Write an event with its stable ID, name and time using the producing channel's credential. Read up to 100 most recent events for a session with dashboard permission. |
| GET / POST `/api/stores` | Staff can list assigned stores. Administrators can create stores in their organization. |
| PATCH `/api/organization` | Admin cookie. Update name, accent color and locale for the selected organization. |

## Phase 2 endpoints

| Operation | Input and result |
|---|---|
| POST `/api/admin/catalog` | Admin cookie. `create` and `edit` accept a store ID and validated product. `archive` takes a SKU. `partner` creates or renames an organization brand or manufacturer. Catalog and audit writes commit together. |
| POST `/api/admin/catalog/import` | Admin cookie. Send `storeId`, CSV text, a mapping from destination field to source header and `commit`. Preview returns normalized rows and row errors. Commit repeats validation under a database lock and imports the entire file only when every row passes. Maximum 200 records per batch. |
| POST `/api/admin/catalog/photo` | Admin cookie. Multipart `file` uploads a bounded JPEG, PNG or WebP under the organization's Storage prefix. Attach the returned object path in a product edit. |
| GET / PATCH / POST `/api/admin/ai-lab` | Lab permission. Read approved settings, configure the ranking strategy, or evaluate rules and validate a supplied candidate ranking locally. |
| POST `/api/mobile/recommendations` | Report bearer and UUID `Idempotency-Key`. Body contains a strict `preferences` object. Returns a run ID, status and current eligible items. A conflicting key returns 409. A concurrent caller can receive `processing`. |
| GET `/api/mobile/discovery?runId=…` | Report bearer scoped to the run's session. Returns the current result with refreshed prices, availability and product facts. |

Example activation body

```json
{"preferences":{"category":"ring","maxBudget":"5000000.00","requiredPurity":"18K","preferredGold":"white","style":"classic"}}
```

The customer may omit all preferences. Category, maximum IDR budget, required brand, required gold and required purity are hard filters. Preferred gold, style, occasion and the optional derived profile affect ranking. Repeat an interrupted activation with the same key. After 45 seconds, an abandoned pending run can be finalized locally on a subsequent activation. A GET has no provider side effects.

| Surface or operation | Authority and behavior |
|---|---|
| Kiosk session and reset | A registered, active device acts within its assigned store. Reset ends kiosk access and clears local customer state. |
| Issue mobile report | Bind the private report to one originating session. Record expiry and revocation separately from kiosk authorization. |
| GET `/results/[token]` | Validate report access and return the color result. A GET, including crawler, preview and prefetch traffic, incurs zero inference calls. |
| Mobile discovery activation | Explicit POST requires a valid report credential and validated preferences. Reject kiosk credentials, deduplicate equivalent activations and recheck inventory before returning recommendations. |
| Event ingestion | Validate event shape, origin and channel. Derive scope from authorization. Deduplicate offline retries by event ID and reserve authoritative outcomes for the server or verified POS integration. |
| Staff, dashboard and admin operations | Verify Supabase Auth identity, permission and organization/store scope on the server. |

Verification must cover reset followed by mobile access, expired and revoked tokens, cross-tenant access, passive report traffic, concurrent activation and replayed events. See the [v2 plan](Sinar_Fajar_Development_Plan_v2.md) for the phase associated with each behavior.

## Phase 3 customer endpoints

| Endpoint | Behavior |
|---|---|
| POST `/api/kiosk/consent` | Kiosk bearer. Records the optional camera decision and assisted status for the session. |
| POST `/api/kiosk/report` | Kiosk bearer. Accepts the selected tone, hex palette, coarse lighting state and consent reference. An identical report credential can recover the original handoff after a lost response. Returns a trusted-origin report URL. |
| POST `/api/kiosk/events` | Enrolled device. Accepts only kiosk events for an originating session on that device, with a bounded offline replay window. |
| POST `/api/mobile/recommendations` | Existing report-authorized activation. Optional lower and upper budget bounds and an explicit palette override are supported. Each report permits eight new results. Cached results remain reusable. |
| POST `/api/mobile/actions` | Report bearer. Saves an inquiry, try-on, later contact, feedback or marketing consent, or issues a separate short-lived cashier code. Product actions validate session, recommendation and store stock. |
| POST `/api/pos/checkout` | Registered POS device. Resolves a cashier code only within its issuing store and expiration. Payment and verified transaction recording belong to the POS integration phase. |

Private report routes use no-store caching and a no-referrer policy. Known preview and crawler event requests are ignored. Browser measurement requires a visible, focused report document.

### Versioned Phase 3 color results

- `POST /api/kiosk/sessions` returns the authenticated device's station mode, allowed palette, camera configuration and current consent notice revision.
- `POST /api/kiosk/consent` accepts `{assisted, camera, version}`. The server checks whether the station can request a camera and records a session-scoped decision.
- `POST /api/kiosk/report` continues to accept the legacy profile and palette contract. The new envelope accepts `result` with kind `manual`, `mixed`, `uncertain` or `automatic` and the existing optional report credential and consent reference. The server selects palette labels and colors from a registered revision. Automatic results require a released method, current calibration and current consent.
- A repeated save using the same credential returns the saved report. `POST /api/kiosk/report/recover` rotates an unhanded, unexpired token with kiosk authorization and retains the analysis and original expiry. `POST /api/kiosk/report/visible` acknowledges the exact saved token. Authorized report access also ends rotation.
- Catalog edits and CSV imports accept optional `visibleColors`. Mobile activation accepts `useColorProfile`, `selectedSwatchVersion`, `selectedSwatchIds`, `removedSwatchIds` and `accentFamily`. The service validates overrides before dispatch and keeps internal catalog sources out of provider requests and public results.

### Store photo catalog and trial recommendations

| Endpoint | Authentication and behavior |
| --- | --- |
| POST `/api/admin/catalog/photos` | Admin cookie and same-origin request. Multipart `storeId` and one JPEG, PNG or WebP `file` up to 4 MiB. Returns a saved draft with its original photo URL. |
| PATCH `/api/admin/catalog/photos` | Admin cookie and same-origin request. Pass `action` and photo UUID `id`. `analyze` stores a vision proposal when configured. `publish` accepts a `label` and reviewed `tags`. `archive` removes the photo from discovery. |
| POST `/api/mobile/recommendations` | Existing report authorization, registration and idempotency checks apply. A local camera trial at a store with approved photos serves `photoItems` with photo ID, category and visual explanation evidence. |
| GET `/api/mobile/discovery?runId=...` | Rechecks publication for saved photo picks and returns the available picks. This read has no provider calls. |
| GET `/results/[token]/photos/[id]` | A registered report can load the original image for a published photo at its store through the app origin. |

Photo tags use a category from `earring`, `necklace`, `ring`, or `bracelet`, a visible metal tone, up to three accent hue families, a shape and a style. Photo recommendations omit commercial fields.

## Phase 4 operations endpoints

| Endpoint | Workflow |
|---|---|
| GET / POST `/api/operations/requests` | Authorized associates read the selected store queue. Mutations validate the originating session and claim, advance or cancel a request, or record a scanned try-on. |
| GET / POST `/api/mobile/try-ons` | Report credential. Lists staff-scanned completed try-ons for that session and records independent customer confirmation. |
| POST `/api/operations/pos` | POS device scoped to one store, or staff cookie plus store ID. Supports sale ingestion, refund, cancellation, inventory snapshots and linking. Staff sale writes and inventory writes require manager access. Associates can link an already recorded transaction. |
| POST `/api/operations/reconciliation` | Manager. Returns seven-day metrics, unlinked receipts, unmatched cashier sessions, duplicate counts and missing expected references. Supports preview and commit of grouped sales CSV. |
| POST `/api/operations/alerts` | Manager can record an incident or dispatch pending alerts. A server job credential can dispatch when supplied as a bearer. |

Product labels accept an exact SKU, a catalog barcode or the project QR payload `sinar-fajar:sku:SKU`. The product must resolve in current store inventory. Customer-sourced try-ons require a matching claimed request at Ready. Store and product discrepancies raise internal alerts. Staff and customer confirmations are distinct events.

## Phase 5 analytics endpoints

| Endpoint | Access and behavior |
|---|---|
| GET `/api/analytics/export` | Dashboard access. Export `kpis`, `product`, `ranked`, `quality` or `experiments` using `from`, `to` and optional store, campaign, brand, category, assisted and variant. It applies the same finance and store rules as the dashboard. |
| GET / POST `/api/analytics/inputs` | Manager or organization administrator. Read store financial periods and record approved campaign, daily coverage or finance inputs. |
| POST `/api/admin/experiments` | Admin lab access. Create an immutable protocol, start, pause or stop enrollment. An active mobile experiment requires approved runtime provider configuration. |
| GET / POST `/api/admin/evaluation` | Admin lab access. List evaluation history, publish a prompt version, save a reviewed synthetic case or run a batch. Repeat a batch ID to read its existing record. |
| PATCH `/api/admin/ai-lab` | Admin lab access. Configure approved model/provider, an existing prompt version, candidate limit and per-run token and cost ceilings capped by environment limits. |


## Phase 6 release endpoints

| Route | Authorization and use |
|---|---|
| `POST /api/kiosk/heartbeat` | Enrolled unexpired kiosk credential or cookie. Updates connectivity on the registered device. |
| `POST /api/mobile/privacy` | Report bearer only. Strict JSON accepts `{"action":"withdraw","purpose":"marketing"}`, `local_camera` or `{"action":"erase","confirm":"delete"}`. Returns 409 while a recommendation is in flight. |
| `POST /api/internal/jobs` | Timestamp, nonce and signature bound to raw UTF-8 JSON. Accepts `{"action":"retention"}` or `{"action":"dispatch","storeId":"<uuid>"}`. Stale or invalid signatures return 401 and replay returns 409. |
| `GET /api/internal/monitor` | Collector bearer only. Returns aggregate counts and threshold states. |
| `GET /api/health/live` and `GET /api/health/ready` | No customer data. Readiness returns 503 if configuration or the bounded database probe fails. |

Activation is an explicit same-origin mobile POST, using a valid report and the idempotency key. Requests flagged as previews are refused. Crowd and scoped rate limits return 429 with `Retry-After`. Body caps reject oversized requests with 413. Get-only report, product and recommendation reads never activate paid inference. Hosted paid access has an explicit environment gate. See the deployment guide for webhook signing, alert receiver duties and production scheduling.


## Camera trial handoff

An enrolled manual kiosk can use the experimental camera trial on its configured HTTPS application origin or on localhost in development. `POST /api/kiosk/sessions` returns `trialStation` when eligible. `POST /api/kiosk/report` checks the same eligibility and current session camera consent before resolving exactly three unique ranked swatch IDs and one suggested gold color from the versioned palette.

`POST /api/mobile/registration` accepts only a name, email and phone number with a trial report bearer. Repeated submissions retain the original registration. A trial activation without a registration returns `403 registration_required`. Opening either mobile page generates no recommendations. The registration submit action activates discovery from the saved camera result.
