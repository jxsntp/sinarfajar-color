# Personal color engine pilot

## Run with local fixtures

Run the local Docker setup and migrations in [SETUP.md](SETUP.md). The kiosk defaults to guided manual draping. Development and UAT use `sf-drapes-fixture-v2`. It keeps the 20 named chromatic fixtures and three curated neutrals of `sf-drapes-fixture-v1` under the same IDs and display values, and adds 21 style-tagged fixtures. Before choosing drapes or using the camera, the customer can pick **Semua gaya**, **Feminin** or **Maskulin** (all styles, feminine or masculine). All styles shows the original library. Feminine and masculine show style-tagged sets for each tone group. The kiosk never infers the choice. Catalog references to `sf-drapes-fixture-v1` still count as exact matches against the new revision. Each fixture has a stable display sRGB value and a separate, currently empty physical reference. Once the specialist and hardware owners approve measured swatches, register them under a new revision and preserve existing report snapshots.

Every registered kiosk offers local camera preview after customer consent and browser permission. Use the kiosk on localhost or HTTPS. The `COLOR_STATIONS` registry configures calibrated operation for a particular device ID. Research requires a calibration matrix, reference white, revision and a successful station check within 24 hours. Specify the browser's camera ID and native exposure or color-temperature controls in `camera` when the calibrated setup uses them. The browser falls back if requested controls cannot be verified. Set `"whiteReference": true` to require a neutral gray card in the on-screen reference square for every accepted frame. The worker then white-balances each frame from the card and rejects frames without a readable card.

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

Use **Administration → Calibrate a station camera** (`/admin/calibration`) on the kiosk itself to produce this entry. An administrator signs in on the kiosk browser and starts the camera. They lock exposure and white balance where the browser offers those controls. They then fill the on-screen guide with a ColorChecker Classic, brown patch at top left, and select **Measure chart**.

The page reads 15 frames and takes each patch's median. It fits the camera-to-XYZ transform on 18 patches and checks it with CIEDE2000 on six held-out patches: light skin, orange, purple, green, cyan and neutral 5. The provisional targets are a held-out mean of 3 or less and a maximum of 6 or less. The page rejects clipped patches and a chart that is upside down. It lists the error for every patch, and it shows the entry for this browser's enrolled kiosk, locked camera settings included, for copying. The page saves nothing.

The reference values are the published 2005 ColorChecker averages from BabelColor. Charts vary by batch, so confirm them against the chart's own data sheet before the study.

A `manual` entry keeps customer draping, and on localhost in development it gives the camera trial the station calibration and camera settings in place of the assumed sRGB. A `research` entry runs the blinded study capture. An entry expires 24 hours after `checkedAt`. On-screen swatches and metal samples are always read as sRGB, whatever the camera calibration.

Replace the example UUID, timestamp and matrix when commissioning a station. This matrix is a synthetic sRGB example. The checked-in Google Face Landmarker v1 model loads from the app origin. Build verifies its SHA-256 and copies the exact installed MediaPipe package's WASM files into the same-origin public directory. The worker takes one frame at a time and releases frames and derived samples on completion or cancellation. Research and automatic report permissions derive from the enrolled device. The public automatic method list is empty.

## Try a camera-generated palette on localhost

Start an enrolled manual kiosk session at `http://localhost:3000/kiosk`. Select **Coba analisis warna dengan kamera**, allow browser camera access, center your face in even light, and select **Analisis warna saya**. MediaPipe locates both brows, the skin above them, both cheeks and the forehead. The worker uses the brows and the skin above them for lightness contrast, and the cheeks and forehead for skin color. Holding a neutral gray card in the reference square is optional and corrects the webcam's color cast. The local worker checks multiple frames and uses the lightness contrast to suggest named color swatches. On localhost the browser console prints a `[color-trial]` readout after each capture. It lists every frame with its result and measurements. It also gives the median and spread of the descriptive face measurements, including face proportions, jaw angle, chin depth, the middle-to-lower facial third ratio, eye size and spacing, brow arch, lip size, and lip-to-skin contrast and redness. Only accepted frames with a neutral expression contribute. These measurements stay in the browser, are not sent to the server and do not affect the result. The research study input accepts approved values under `face` for later candidate models. The trial assumes sRGB with a D65 white point and uses provisional thresholds. Its result is an experimental styling suggestion.

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
