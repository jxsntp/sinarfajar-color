# Decision record

## 2026-11-25 — Experience-first kiosk and mobile discovery

Adopt the v2 journey for the Puri Mall pilot. The kiosk delivers a complete color result and a voluntary QR handoff. Personalized SKU ranking belongs to explicit, authorized mobile activation. This supersedes the earlier kiosk-ranking direction identified in the v2 plan and lets customers finish the kiosk experience independently of inference availability.

The kiosk and report use separate credentials so a shared device can reset immediately after handoff. Passive report requests must incur zero customer inference calls. Measure the physical-to-digital handoff, mobile recommendation clicks and verified sales independently because each has a different eligible population. Sources: [project context](PROJECT_CONTEXT.md) and [development plan](Sinar_Fajar_Development_Plan_v2.md).

## 2026-11-26 — Bounded ranking and durable activation

Use PostgreSQL hard filters and a stable SKU order to bound retrieval to 24 eligible products. Return up to five ranked items. Both engines use the same candidates. Deterministic scores combine configurable preferences and diversity, with SKU as the final tie-breaker. The provider can compose explanations from verified candidate-specific styling statements. This limits unsupported product claims and preserves authoritative product facts.

Keep request keys and run fingerprints independent. A repeated request key binds to its original preferences. Equivalent new keys reuse the completed run for the same catalog and strategy revision. Fresh stock and prices are checked on every display. Expired pending work can fall back to rules without issuing a second ambiguous paid call.

## Phase 3 — Optional camera and manual guidance

Use native browser camera and canvas processing to check lighting within a guided face region and support a gray reference. Keep the interpretation manual pending specialist validation. Record coarse quality and the consent reference. Use separate kiosk and mobile experiment names. Later customer contact uses a separate queue and cannot create an immediate in-store request.

## 2026-11-27 — Photo-only catalog for registered camera trials

The initial catalog contains photos. Keep staff-approved visual metadata separate from Product and Inventory, which require commercial evidence. A staff action may use OpenRouter for offline catalog enrichment. This is distinct from customer inference, which continues to require explicit mobile activation. Customer photos and registration details stay outside OpenRouter. Use store-scoped approved photos for the existing local camera trial. The phone can show one visual recommendation per category without implying price, purity, or availability. Keep the photo trial outside the commercial ranking experiment.

## Phase 4 — Store-scoped fulfillment and sales evidence

Reuse mobile inquiry and try-on IDs for fulfillment. Preserve the staff claim and first acknowledgment time in the source record. Distinguish a request, a staff scan and a customer confirmation in analytics. Keep later email follow-up separate from the immediate store queue.

Use a provider-independent POS contract and preserve the original receipt with an append-only adjustment ledger. A scanned cashier code binds the sale to the originating store and session. A valid sale can remain unlinked when a cashier code cannot be resolved. Mock and CSV sources remain identifiable for reconciliation.

## Phase 5 — Cohorts and comparison evidence

Anchor executive reporting to the original kiosk session in Jakarta time and retain early funnel denominators under product filters. Use observed, independently approved CSV receipts for management sales evidence. A provider charge, missing visitor count or unmatched receipt keeps the relevant uncertainty visible. Store attribution and incremental contribution are separate measures.

Freeze the prespecified primary outcome, minimum sample, follow-up window and mobile ranking configuration for each experiment. Report original assignment and actual strategy independently. Use Wilson-based risk-difference intervals and keep small-sample results descriptive. Preserve immutable prompt versions and compare them on a recorded reviewed synthetic case.


## Phase 6 release controls

- Apply database-backed fixed-window limits and one-time signed scheduler nonces across instances. Use the trusted Vercel source header only at Vercel and a shared bucket elsewhere. Hosted reverse-proxy attribution needs verification before trusting a client IP field.
- Retain the authoritative sale and cost ledgers on erasure and remove customer links. Preserve phone authorization after ordinary kiosk reset. A deliberate report deletion independently invalidates the report and clears related browser outbox entries when available.
- Enforce hosted inventory recency and recheck availability while mobile results remain visible. Drop the display on offline status or failed verification. Use authoritative catalog values and disable paid hosted inference until specifically configured and approved.
- Treat local build, mocked AI, Edge UAT and synthetic restore as engineering evidence. Hold hosted acceptance, physical operating checks, monitoring delivery and scheduled production jobs behind the client and owner release gates.

## Phase 3 color evidence and release

Use guided fixed palettes with revisioned swatch snapshots. Ship synthetic display colors as fixtures in development and UAT, and keep the public automatic method list empty pending qualified specialist and representative held-out review. Use approved product evidence for styling explanations and a distinct explicit gold-preference tier. The local research scorer and chart workflow run outside retail analytics.


## Local computer vision palette trial

Use the existing browser capture worker to offer a camera-generated palette during manual kiosk sessions on a loopback host in development. The trial assumes sRGB/D65 and uses the provisional facial lightness contrast scorer. Swatches stay in the current session. Blinded research and approved automatic modes keep their existing station and report contracts.


## Camera snapshot, private report and registration

The local development flow shows the top three camera-generated shades and one suggested metal on the kiosk, then issues a QR for the detailed report. The phone asks for name, email and phone number before the visitor explicitly requests recommendations. The QR report remains account-free, and the registration step does not grant marketing consent. The camera trial uses a provisional two-color harmony score and display metal samples. Hosted automatic results still require the v2 validation review.
