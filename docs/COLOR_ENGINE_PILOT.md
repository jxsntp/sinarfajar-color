# Personal color engine pilot

## Run with local fixtures

Run the local Docker setup and migrations in [SETUP.md](SETUP.md). The kiosk defaults to guided manual draping. Development and UAT use the 20 named chromatic fixtures and three curated neutrals in `sf-drapes-fixture-v1`. Each fixture has a stable display sRGB value and a separate, currently empty physical reference. Once the specialist and hardware owners approve measured swatches, register them under a new revision and preserve existing report snapshots.

Every registered kiosk offers local camera preview after customer consent and browser permission. Use the kiosk on localhost or HTTPS. The `COLOR_STATIONS` registry configures calibrated operation for a particular device ID. Research requires a calibration matrix, reference white, revision and a successful station check within 24 hours. Specify the browser's camera ID and native exposure or color-temperature controls in `camera` when the calibrated setup uses them. The browser falls back if requested controls cannot be verified.

```json
{
  "dev-or-uat-device-uuid": {
    "mode": "research",
    "checkedAt": "2026-11-26T08:00:00Z",
    "calibration": {
      "revision": "synthetic-d65-demo",
      "white": [0.95047, 1, 1.08883],
      "matrix": [0.4124564, 0.3575761, 0.1804375, 0, 0.2126729, 0.7151522, 0.0721750, 0, 0.0193339, 0.1191920, 0.9503041, 0]
    }
  }
}
```

Replace the example UUID, timestamp and matrix when commissioning a station. This matrix is a synthetic sRGB example. The checked-in Google Face Landmarker v1 model loads from the app origin. Build verifies its SHA-256 and copies the exact installed MediaPipe package's WASM files into the same-origin public directory. The worker takes one frame at a time and releases frames and derived samples on completion or cancellation. Research and automatic report permissions derive from the enrolled device. The public automatic method list is empty.

## Try a camera-generated palette

Start an enrolled manual kiosk session on the configured HTTPS kiosk origin or at `http://localhost:3000/kiosk` in development. Select **Coba analisis warna dengan kamera**, allow browser camera access, center your face in even light, and select **Analisis warna saya**. MediaPipe locates both brows and nearby skin. The local worker checks multiple frames and uses the lightness contrast to suggest named color swatches. The trial assumes sRGB with a D65 white point and uses provisional thresholds. Its result is an experimental styling suggestion.

The local worker uses the tone shortlist and apparent skin color to rank three named swatches and to suggest a metal from yellow, rose and white gold display samples. The provisional score uses the Ou–Luo two-patch harmony model. It uses sRGB/D65 display samples for metals, whose real appearance varies with finish and lighting. Research sessions stay blinded. Hosted automated results require the v2 calibration and validation process. [Ou and Luo color harmony model](https://doi.org/10.1002/col.20208)

The preview stops after capture. The kiosk shows the three colors and the suggested metal, then displays a private QR after the report saves. The report shows the named swatches and the color explanation before asking for name, email and phone. Submitting these three fields activates jewelry discovery. The server uses the three shades and the suggested metal to find one available earring, necklace, ring and bracelet for the report. Each category has its own section and indicates when a recommendation is unavailable. Customers can refresh the selection as stock changes. The registration fields are stored separately and excluded from analytics and provider payloads. Report erasure and retention remove the registration through the session foreign key.

In development, **Buka laporan (uji coba)** below the kiosk QR code opens the exact same report URL in a new tab. Scanning from a separate phone requires an accessible trusted HTTPS report origin.

## Catalog intake and ranking

In **Visible product colors**, add up to six components per SKU. Record the role, appearance, color family or versioned swatch, prominence when known, verification source and an internal source record. Use `visibleColors` as a mapped CSV column containing a quoted JSON array. CSV quote escaping doubles every quotation mark in the cell. A verified fixture component can look like this:

```json
[{"role":"enamel","appearance":"chromatic","colorFamily":"blue","reference":{"version":"sf-drapes-fixture-v1","id":"steel-blue"},"prominence":"noticeable","status":"verified","source":"store_check","sourceRef":"fixture-item-01"}]
```

Require positive, current originating-store inventory and apply the mobile shopper's budget, brand, category, purity and required gold before scoring. Explicit preferred gold determines a priority tier in both engines. Shade evidence can use versioned exact matches, compatible measured Lab data or a capped family match. Missing or unverified evidence contributes no palette bonus. Curated drapes support comparisons. Picking a shade on mobile makes that shade an explicit preference. Skip profile guidance to rank on shopping preferences alone. A matched metal appearance never establishes personal metal suitability.

## Blinded study

1. Secure approval for the consent notice, approved derived fields, physical samples, chart protocol, retention and restricted study storage. Keep research data outside the repository and retail database. The retail capture screen discards measurements and has no study-data export. Approve a separate consented acquisition workflow before collecting volunteer measurements.
2. Fix the station, display, lighting, distance and camera controls. Use the chart fit utility with independent held-out reference patches. Record patch errors and repeat two captures after repositioning. Establish tolerances before review and repeat the check whenever hardware or lighting changes.
3. Run `npx tsx scripts/color-study.ts plan sf-drapes-fixture-v1 REGISTERED-SEED RANDOM-STUDY-ID` to rehearse blinded order and participant assignment. Use the measured revision to collect physical tone comparisons. Compare two tones from the same hue family. Randomize sides, repeat a subset with sides reversed and record left, right, both, neither or skipped before showing any score. Use a separate within-tone hue block matched on measured lightness and chroma.
4. Freeze the swatch revision, registered seed, development dataset, baseline and analysis before accessing the held-out data. Run `npx tsx scripts/color-study.ts evaluate PRIVATE_INPUT.json` from the repository against the approved private dataset. The strict contract in [research.ts](../src/domains/color-analysis/research.ts) accepts one pseudonymous participant record with consent version, split, lightness band, approved derived features, repeat capture and ordered choices. The output is aggregate. It reports baseline agreement, fitted model agreement, participant-bootstrap intervals, ties and omissions, coverage and repeat agreement by band.
5. Apply the [research scorecard](COLOR_ANALYSIS_ENGINE_PLAN.md#proposed-acceptance-criteria-for-the-research-result) and obtain qualified specialist and project-owner review. Evaluate an individualized hue model on independent choices. Validate seasonal labels or personalized metal guidance in separate studies with suitable physical samples before release.

## Pilot dependencies

| Dependency | Evidence required |
| --- | --- |
| Sinar Fajar inventory and catalog owners | Approved SKUs and in-stock snapshots with representative verified accents. Review source and price accuracy and measure metadata coverage. |
| Kiosk hardware and physical references | Approved camera, lighting, monitor, chart and drapes. Verify physical and on-screen color reproduction, held-out patch error, repeatability, pose and obstruction failure rates, track cleanup and touchscreen timing. |
| Consenting volunteers and specialist | Approved data collection, representative development and holdout cohorts, registered thresholds, repeatability and preference agreement by lightness band, and signed release review. |
| Provider and retail UAT | Approved model and spend, representative inventory, mobile latency and cost, and preference-only versus palette-aware ranking review. |

Fixture draping, QR reports and deterministic ranking can run in development or UAT. Named-station research capture is appropriate for technical rehearsals when configured. Customer-facing automatic classification, individualized hue and metal prediction and seasonal labeling remain gated.
