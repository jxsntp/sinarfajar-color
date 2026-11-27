# Pilot funnel definitions

Count distinct originating sessions within the same eligible cohort and reporting window. The [project context](PROJECT_CONTEXT.md) contains the full proposed scorecard. Targets are hypotheses awaiting pilot validation.

| Metric | Numerator | Denominator | Proposed target |
|---|---|---|---|
| QR handoff | Completed analysis sessions with a first human-visible mobile report open | Completed analysis sessions | ≥60% |
| Mobile recommendation activation | Human report sessions with successfully generated recommendations | Human report sessions | ≥80% |
| Product CTR | Sessions with a visible recommendation and a voluntary click on a recommended SKU | Sessions with a visible recommendation | ≥40% |
| Mobile inquiry | Human report sessions with a voluntary product inquiry | Human report sessions | ≥20% |
| Try-on to purchase | Confirmed try-on sessions with a verified linked purchase | Confirmed try-on sessions | ≥25% |

A QR displayed on the kiosk measures exposure. Record the handoff when the report becomes visible to a human and deduplicate repeated opens. Product CTR begins at a visible recommendation impression. Tie the click to its run and SKU. A report open or generated ranking alone cannot establish an impression.

Reconcile commercial outcomes with staff and POS records. Report missing linkage as unavailable. Agree on attribution windows, cohort dates, reporting time zone and refunds before publishing results. Keep opening-event and ongoing-store cohorts separate.

For mobile CTR, record the visible recommendation card and validate the clicked SKU and rank against its originating run. For inference cost, sum all attempt charges, including retries and invalid responses. Report attempts with unknown charges separately. A timeout cannot establish a zero charge. Compute p95 latency from completed run durations and distinguish provider runs, rules, fallbacks and cached reads. Pilot latency, cost and relevance require representative inventory, provider traffic and evaluation data.

Record `recommendation_no_matches` when validation leaves zero eligible items. Only a nonempty validated selection emits `recommendation_generated` and counts toward successful mobile activation.

## Phase 3 funnel measurement

Use `qr_displayed` for a visible, rendered kiosk QR and `mobile_report_opened` for the first visible, focused mobile report. Count a revisit on a later day after the first 24 hours, with a 24-hour revisit deduplication window. Known preview agents are excluded. Recommendation clicks are deduplicated by session, run and SKU. A share event tracks initiation and a social click tracks outbound intent only.

Measure average kiosk time from `kiosk_session_started` to `color_result_viewed` for completed sessions. Use the three-minute target for representative pilot hardware. Measure mobile onboarding separately from first visible report open to first explicit recommendation request. Segment kiosk outcomes by assisted status and manual methodology. Use only assigned mobile experiment sessions when comparing rules and model ranking; measure actual strategy and fallback separately.

Camera capture failure, retake and manual fallback are kiosk-only events. They contain no captured measurements. Report provenance distinguishes legacy, guided, mixed, uncertain and authorized automatic results. A preview can mark the token as handed off for recovery purposes. The separate visibility event still supplies the human mobile handoff numerator. Study agreement, coverage and repeatability use their own approved aggregate research data.

### Photo recommendation events

A registered camera trial can record `photo_recommendation_requested`, `photo_recommendation_generated`, `photo_recommendation_no_matches`, and `photo_recommendation_fallback`. A visible gallery records `photo_recommendation_impression` once per run. These events track styling engagement separately from stock-backed recommendation impressions, product CTR, and retail conversion.

## Phase 4 staff service and sales attribution

- Acknowledgment time is the duration from request creation to the first successful claim. Report the mean for the last seven days and use a two-minute pilot service target.
- Fulfillment time runs from creation to completion for acknowledged requests. Pending volume is a current count. Cancelled requests and completed try-ons use their transition timestamp. Report customer-confirmed try-ons separately.
- Workload counts currently assigned open tasks and completed tasks in the reporting window. Later contact uses its own queue.
- Transaction linkage coverage is linked receipts divided by all recorded receipts, including receipts awaiting reconciliation. Point-of-sale source and refund or cancellation status are visible in the detail.
- AI or rules assistance comes from the latest completed recommendation run with a mobile impression before the sale and within the approved window. Purchased SKUs are compared with all runs visible in that window. Session-only linkage is a separate category. Attribution describes the observed journey. Incremental sales require a valid comparison.

## Phase 5 management dashboard

The selected date range uses Jakarta calendar days and the original kiosk start date. General funnel follow-up lasts up to 30 days after session start, through the report time. Counts are distinct sessions unless a row names another unit. Store, campaign, assisted status and assignment filter the cohort. Brand and category filter product-linked outcomes. Earlier funnel stages retain the eligible customer cohort. Experiment outcomes follow the protocol clock described below.

| KPI | Numerator / denominator or calculation | Source and exclusions | Pilot hypothesis |
|---|---|---|---|
| Store visitors | Sum approved eligible visitor counts over covered store-days and campaign segments | Store counter or approved aggregate. Missing coverage, assisted filters and assignment filters leave this unavailable | Coverage required before adoption |
| Kiosk starts | One count per originating kiosk session | Server session creation. A kiosk reset does not count as a fresh start | Monitor |
| Kiosk adoption | Kiosk starts / approved eligible visitors | Matching store-day campaign coverage | ≥25% |
| Analysis start | Sessions with an analysis start | Kiosk interaction event | Monitor |
| Completed analysis | Sessions with either persisted analysis or a visible standalone result | Kiosk result and persisted analysis events. Duplicate signals count once | Monitor |
| Analysis completion | Started-analysis sessions with a completion / analysis-start sessions | Intersection of the two signals | ≥85% |
| QR displays | Sessions with a visible rendered QR | Kiosk visibility event, not raw render requests | Monitor |
| QR display coverage | Completed analysis sessions with a QR / completed analysis sessions | Same originating session | Near 100% |
| Unique mobile opens | Sessions with first visible mobile report open | Browser visibility and focus checks, preview exclusion and server deduplication | Monitor |
| QR handoff | Completed analysis sessions with a first mobile open / completed analysis sessions | Independent of product CTR and sales | ≥60% |
| Display-to-open | QR display sessions with a mobile open / QR display sessions | Diagnostic for QR placement and handoff | Monitor |
| Preferences completed | Sessions with a validated preference submission, including intentional skips | Backend event on activation | Monitor |
| Explicit activation | Sessions with accepted activation / mobile opens for the rate | Server event references the recommendation run | Monitor |
| Successful activation | Mobile open sessions with a generated nonempty selection / mobile open sessions | Server generation event and completed run | ≥80% |
| Recommendation engagement and CTR | Sessions viewing a recommendation, sessions clicking a viewed run and SKU, and clicks / view sessions | Mobile impression and click events. Repeated clicks or clicks without matching impressions do not increase CTR | ≥40% CTR |
| Funnel drop-off | Starts without completion, completed analyses without first mobile open, opens without explicit activation, and activations without generated results | Unique stage differences within one cohort | Monitor by stage |
| Mobile return | First-open sessions with a later qualifying revisit / first-open sessions | Server records revisit after a 24-hour gap | ≥15% |
| Save, share and outbound social action | First-open sessions with the named action / first-open sessions | Download or save event, share initiation and outbound link click respectively | Monitor separately |
| Marketing opt-in | First-open sessions with a separately granted consent / first opens | Server consent event. Counts historical opt-in, with withdrawals retained separately | Monitor |
| Verified campaign content | Count from approved independent coverage | No inferred posts, reach, likes or follows | Monitor if available |
| Mobile inquiries | First-open sessions with a customer product inquiry / first opens for rate | Backend sanctioned requests including later follow-up. Product filtering applies only to the numerator | ≥20% rate |
| Physical try-ons | Sessions with a staff-confirmed stocked product scan | Staff verification. Customer confirmation remains a separate observation | Monitor |
| Recommendation-to-inquiry | Viewing sessions with a subsequent inquiry for the same SKU / viewing sessions | Session, product and event time | Monitor |
| Inquiry-to-try-on | Inquiry sessions with a later confirmed try-on for the same product / inquiry sessions | Staff confirmation and mobile request | ≥60% |
| Try-on-to-purchase | Confirmed try-on sessions with later verified positive-net linked sale / confirmed try-on sessions | Receipts and adjustments. Under product filters require a matching SKU in the sale | ≥25% |
| Attributed purchases | Sessions with a positive-net linked, approved CSV receipt | Exclude mocks, cancellations and fully refunded receipts. An approved feed must be present in each selected store for the observed window | Monitor |
| Attributed net revenue and average transaction value | Receipt gross less refunds and cancellations. Average divides net sum by positive-net attributed receipt count | Store-level only. Under brand/category filters, receipt totals are unavailable without line-level adjustment allocation. Finance access required | Monitor |
| Customer satisfaction | Mean of one experience rating per session, response count, and responding open sessions / opens | Voluntary survey. Missing ratings stay unavailable | ≥4.3/5 |
| Recommendation relevance | Positive voluntary relevance ratings (4–5) / relevance responses | Separate feedback linked to a recommendation impression | ≥85% |
| Customer AI operating cost | Sum reported customer inference attempt charges in USD, including retries and failures | Missing cost on any attempt makes the total unavailable. Lab spending and manager-approved IDR finance inputs are separate | Proposed ≤USD 0.02 per completed recommendation |
| Product rank CTR | Click / impression for matching run, SKU and rank, with actual strategy | Per-run observations; product-level totals collapse repeat activity in a session | Monitor |
| Product and category activity | One per session and product, brand or category for each recommendation, view, inquiry, verified try-on and qualifying purchased recommendation | Catalog IDs, backend run items, mobile events, scans and linked positive-net receipt lines | Monitor |
| High interest, low observed purchasing | At least ten unique recommendation impression sessions and fewer than 10% with a linked positive-net recommended purchase | Heuristic only when approved sale data is present; investigate context separately | Review, no causal label |
| Gold and budget distribution | Latest captured run preferences per session; budget bands use maximum IDR budget | Omitted budget has its own category. No inference of preference from purchase | Monitor |
| Lab relevance, raw validity and invalid SKU rate | Reviewed relevant items / served items; schema-valid parsed responses / parsed responses; out-of-candidate SKUs / raw observed SKUs | Immutable case and prompt version. Status identifies fallback. Failed or unavailable observations are explicit | ≥85% relevance and ≥99% raw shape validity are pilot hypotheses |
| Lab latency, tokens, cost and fallback | Recorded elapsed time, prompt and completion tokens, reported charge and fallback / evaluated configurations | Rules and model rows are labeled. Unknown charges and still-pending records are distinct | Monitor p95 and baseline |
| Data quality | Unpersisted visible results, opens without observed QR, clicks without matched impressions, pending runs, unknown provider costs, missing footfall or receipts and attempts without activation | Diagnostics flag coverage and observation limitations. They are not a completeness estimate | Zero customer AI calls without activation |

### Controlled experiments

The kiosk primary outcome uses the first verified mobile open within the protocol window divided by **all matured assigned sessions** per kiosk arm. Completion-conditioned handoff is diagnostic. Mobile B and C use assignment after explicit eligible activation. Product click and inquiry intent-to-treat rates, confirmed try-on and verified purchase use mature assigned sessions. Product CTR conditions on recommendation impressions and remains a diagnostic. Completed observation windows are calculated from assignment time, minimum sample per arm is declared before enrollment and existing assignments continue while enrollment is paused or stopped. Enrollment and observation counts are shown separately. Difference is C minus B or the second kiosk arm minus first. Relative uplift divides that difference by the baseline rate, with a zero baseline unavailable. Compare rates using a 95% Newcombe difference interval based on Wilson arm intervals. Report original assignment even if delivery falls back to rules. Relative inquiry uplift of 15% and purchase uplift of 10% are hypotheses.

### Financial evaluation

Use approved store-month IDR inputs. Gross profit is sourced from finance. Monthly incremental contribution is observed gross profit minus comparable control gross profit minus approved software, inference and additional operations costs. Positive payback divides initial investment by positive monthly contribution. First-year ROI is (12 times monthly incremental contribution minus investment) divided by investment. Monthly constancy is a projection assumption. The control reference must document a comparable baseline and exposure. Missing control makes incremental outputs unavailable. No automatically generated counterfactual is used.


## Phase 6 operational monitoring

The collector reports a rolling 24-hour window. QR issued counts report-token records. QR displayed and human handoff count separate sessions with the corresponding accepted events. Discovery activation counts sessions with explicit accepted requests. CTR divides accepted deduplicated product clicks by accepted product impressions. No valid denominator returns null. The short-window health metrics and cohort/experiment reporting use different windows. Erasure and retention can remove customer-level events and reduce historical completeness.

Measure store-hour availability with external ready probes in the store timezone. Divide successful scheduled probes by expected probes during operating hours and review absent probes as monitoring gaps. The pilot goal is at least 99.5%. Provider p95 covers completed OpenRouter runs and should be read alongside failures, fallbacks and interrupted runs. Expose reported costs and the reserved-or-actual spend separately. Compare dashboard attribution to transaction linkage coverage and use a valid comparison before claiming incremental impact.
