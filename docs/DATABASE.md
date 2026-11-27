# Database design baseline

The [Prisma schema](../prisma/schema.prisma) and versioned migrations implement the foundation model. Composite foreign keys include organization identity and enforce the store/device relationship for customer sessions. The development seed upserts two synthetic brands and two in-stock jewelry SKUs for Puri Mall. With the loopback Docker services, it also provisions the demo staff profile and its Sinar Fajar Organization Admin membership after verifying the Supabase Auth identity.

| Records | Relationship and constraint |
|---|---|
| Organization, Store, Device, UserProfile, Membership | Devices belong to a store. Staff reads and writes require membership and applicable store scope. Enforce tenant isolation in database policies and server queries. |
| Brand, Product, ProductImage, Inventory | Inventory joins a product to its store. Preserve exact numeric prices and verified specifications. |
| CustomerSession, Consent, ColorAnalysis, CustomerPreference | The originating session links the journey. Save approved derived palette, method version, source and uncertainty. Keep camera frames local. |
| MobileReportToken | Link the report to its originating session. Persist only the hash of a cryptographically random token with expiry and revocation metadata. Kiosk reset has a separate lifecycle. |
| RecommendationRun, RecommendationItem, AIModelConfig, PromptVersion | Associate displayed items with eligible catalog SKUs and capture ranking strategy, prompt, model and fallback. |
| InteractionEvent, Experiment, ExperimentAssignment, Feedback | Deduplicate by event ID. Preserve the originating session, channel, experiment assignment and relevant run or SKU. |
| ProductInquiry, TryOn, Transaction, TransactionItem | Link verified staff and POS outcomes to the journey through scoped attribution. Reconcile returns and cancellations. |

All application tables have RLS enabled. The direct authenticated API can read only a user's own profile and memberships. Domain operations use the trusted server role and explicit tenant/store predicates. Auth identities live in Supabase's auth schema. Financial values use PostgreSQL NUMERIC. Partial unique indexes enforce one active kiosk session per device and one first human-visible open per session. See [development setup](SETUP.md) for migration and test commands.

## Phase 2 additions

Manufacturer, product weight, gemstone specifications, style/occasion tags, photos and per-store display location extend the catalog. CatalogAudit stores the staff actor, subject and before/after snapshots. PostgreSQL triggers increment the organization's catalog version on product, partner, photo or inventory changes, including writes outside the admin UI.

ActivationRequest binds a session-scoped request key to its preference hash and run. A unique run fingerprint covers normalized preferences, derived profile, ranking configuration, prompt version, experiment assignment and catalog revision. RecommendationRun and RecommendationItem hold the candidate set, returned ranking, published items, assigned and actual strategy, model, prompt, experiment variant and fallback category. InferenceAttempt records reservations, outcomes, reported tokens and actual cost when available. Missing cost stays null. The budget calculation retains its reservation when the provider's charge is unknown.

## Phase 3 customer records

CustomerSession carries an assisted flag and optional hashed cashier code with a short expiry. ColorAnalysis references the camera consent within the same tenant and session and stores only the manually selected tone, palette and coarse quality state. ProductInquiry distinguishes in-store from later contact; a later request stores the explicitly entered email. Try-on, feedback and marketing consent use their dedicated records.

### Trial photo catalog

`PhotoCatalogItem` belongs to an organization and store and stores the original media path, display label, publication state, optional vision proposal and approved appearance tags. The service validates publication and archiving and records an audit row. Proposals have a model identifier and a short analysis lease prevents overlapping provider calls. Web database roles have no direct access to the table. Catalog photo inference reserves usage through `InferenceAttempt` with a null recommendation run ID.

Trial `RecommendationRun` rows may use `photoCandidateIds` and `photoPicks` instead of commercial recommendation item rows. These store the shortlist identity and selected photo ID with reason emphasis. Each read resolves current published rows at the report's store. Photo publication gives no evidence of price, purity or stock.

## Phase 4 operational and POS records

ProductInquiry and TryOn retain their Phase 3 identifiers and add fulfillment state, staff assignment and transition timestamps. The TryOn source, scan timestamp, staff confirmation and separate customer confirmation distinguish observed interaction from requests. Legacy confirmed try-ons backfill as completed.

Transaction supports verified but unmatched receipts. The store and external transaction reference jointly determine uniqueness. Purchased items retain exact recorded quantity and price and a recommendation-history match. SaleAdjustment holds idempotent refund and cancellation records under the original receipt. Inventory tracks the observation time of the latest accepted POS snapshot. OperationalAlert records notification type, store, subject, resolution and delivery attempts.

## Phase 5 analytics records

AnalyticsCampaign tags store sessions at start. AnalyticsDaily stores approved dated footfall and verified content by store and campaign segment. FinancialPeriod holds restricted monthly comparison inputs. Experiment records hold protocol, outcome, observation period, minimum sample and lifecycle fields. The legacy field value preserves Phase 3 data. PromptVersion has a database guard against rewriting content or deleting versions. EvaluationCase and EvaluationResult preserve reviewer, profile, expected SKUs, configuration, prompt, candidate list, model metrics and historical batch. New tables are restricted to server operations.


## Phase 6 retention and operations

Devices now have `expiresAt` and `lastSeenAt`. Synced inventory uses `posSyncedAt` and catalog count confirmation records `verifiedAt`. Hosted environments require bounded stock freshness. Existing inventory needs initial verification before it becomes eligible there.

The release migration creates `RateBucket`, `WebhookNonce`, `OperationMinute` and `PrivacyAudit`. RLS and grants deny Supabase API roles access to these tables. Rate-limit subjects and nonce keys are HMAC digests. Operation counts are minute buckets with fixed operation and outcome labels. Privacy audit records action, organization, store and time without retaining the deleted customer or report identifier.

Report erasure deletes linked customer records in a transaction and disconnects POS attribution. Transaction and adjustment amounts persist. The nullable inference-attempt reference preserves charge accounting without an originating customer relationship. Time-bounded retention never erases a still-valid unrevoked report. Daily quota and spending accounting include detached attempts. Before approving an application rollback after erasure is enabled, verify previous-client compatibility with detached rows. Use an isolated restore target when rehearsing backups.
 
## Versioned Phase 3 color data

ColorAnalysis retains the historical profile and CSS hex palette. New records can also store tone groups, a palette revision and immutable named swatch snapshot, uncertainty and calibration revision. Camera consent stays scoped to the same organization and customer session. MobileReportToken.handedOffAt gates rotation without replacing expiry or revocation.

Product.visibleColors holds optional verified appearance components and source evidence at SKU level. Catalog revisions change through the existing update trigger. RecommendationRun.colorContext snapshots the effective palette evidence and mobile overrides. Frames, landmarks, raw region values and continuous facial contrast are excluded from retail persistence.



## Local camera trial registration

A camera trial stores the three resolved swatches and the suggested metal in a labeled `ColorAnalysis.paletteSnapshot` envelope. Older palette snapshots remain arrays. `CustomerRegistration` stores name, email and phone separately on a tenant-scoped session key under row-level security. Session erasure and retention delete the associated registration through the foreign key. Registration fields are excluded from analytics and recommendation provider inputs.
