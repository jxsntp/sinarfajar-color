# Color analysis variables for Sinar Fajar jewelry recommendations

**Status** — Proposed Phase 3 data and ranking contract. The [color engine plan](COLOR_ANALYSIS_ENGINE_PLAN.md) defines the drape research. The [technical plan](COLOR_ANALYSIS_TECHNICAL_PLAN.md) defines how the kiosk captures and saves a result. This contract defines how a customer can use an approved result to discover actual Sinar Fajar SKUs on mobile.

The kiosk performs the color analysis locally. The mobile server combines the approved palette, explicit shopping preferences and the originating store's sellable inventory after customer activation. Inaura owns candidate selection, compatibility scoring, explanation evidence and result validation. OpenRouter ranks a bounded pool using that evidence. The deterministic ranker uses the same inputs and provides the fallback.

## 1. Existing inputs and the gaps to close

| Area | Available today | Planned extension |
| --- | --- | --- |
| Personal color | `ColorAnalysis.profile`, hex palette, source, quality, uncertainty and method version. The current kiosk saves a manual preset. | Versioned tone groups and named swatches. Track which aspects are derived, chosen by the customer or supported by a validated method. |
| Shopping intent | Required category, brand, gold color and purity, maximum budget, preferred style, occasion and gold color. | Optional saved color choices, requests for a particular accent shade, and the ability to browse without palette influence. |
| Product facts | SKU, name, category, brand, manufacturer, gold color, purity, grams, gemstone description, style tags, occasion tags and images. | Add optional structured visible color components with verification status and evidence. Keep supplier descriptions and current catalog facts intact. |
| Store facts | Store-scoped `Inventory` with price, currency, stock and display location. | Use the current authoritative feed or approved store update process. Require verified eligibility before ranking and refresh it before display. |
| Ranking | `RankingInput.color` is one legacy value. Eligibility currently returns the first 24 SKUs in SKU order. Rules and OpenRouter share the eligible pool. | Evaluate color and preference signals across the eligible pilot catalog before choosing the bounded candidate pool. Version the ranking inputs and keep legacy reports readable. |

The development catalog contains synthetic fixtures. Validate rankings against an approved Sinar Fajar catalog export and actual store availability before making production claims. [Data model](DATABASE.md) · [Catalog service](../src/domains/catalog/service.ts) · [Current score and evidence](../src/domains/recommendations/engines.ts)

## 2. Customer color variables

| Variable | Representation and source | Allowed downstream use |
| --- | --- | --- |
| Capture conditions | Lighting and calibration pass, camera/session state, pose, occlusion, clipping, blur and frame stability. | Local capture quality and retake decisions. Operational events may record coarse outcome codes only. |
| Apparent skin color | Calibrated local median or validated region summary in CIE `L*`, `a*`, `b*`. `L*` expresses lightness and `a*` and `b*` are color coordinates. | Local computation and separately consented research as specified. Exclude all three readings from production recommendation records and provider payloads. |
| Facial contrast | Median region contrast over accepted frames, measured between brow and adjacent skin. | Local tone scoring. Keep the continuous value local in retail sessions. Share an approved coarse output only if it independently improves a tested customer-facing use. |
| Skin chroma and hue | If tested, derive `C* = sqrt(a*² + b*²)` and `h° = atan2(b*, a*)` wrapped to `[0, 360)`. Treat hue as undefined near zero chroma. | Candidate research features for the hue model. A camera measurement describes apparent color under station lighting. A warm/cool classification would need a separate target and validation. [CIE Lab standard](https://www.iso.org/standard/74166.html) |
| Tone groups | Up to two of `vivid`, `dark`, `pale`, `dull` from the approved scorer, or explicitly chosen in the manual flow. | Choose the relevant swatch set and generate labeled draping guidance. Mixed groups allow several colors to explore. |
| Named color swatches | Versioned `swatchId`, localized label, family, tone group, reference Lab or approved reference ID and display sRGB. | Build the visible palette and compare it with verified product components. The server resolves the swatch data from ID and revision. |
| Hue evidence | `curated`, `customer_selected` or `validated_ranked`. Store ordered IDs for the latter two when ordering is supported. | Curated swatches offer broad comparison options. A customer choice or a validated shade ranking may support a specific product color reason. |
| Lightness and chroma guidance | Read from the result swatches as a range or band, where the selected palette supports it. Examples include pale shades or vivid accents. | Compare verified visual accents with the palette and describe the palette itself. Keep these labels tied to the swatches. |
| Neutrals | Curated or customer-selected swatch IDs such as soft white, taupe, charcoal or soft navy. | Optional outfit-pairing context. Treat achromatic and nearly achromatic entries as neutrals. Display color has no automatic metal implication. |
| Quality and provenance | `legacy_manual`, `manual_drape`, `validated_auto` or `unavailable`, plus stable/mixed/uncertain state, method and palette versions, and an optional validated hue model revision. | Select the permitted reason and score. A mixed or unavailable result can still use explicit shopping preferences. A score is shown as a ranking signal only where supported by the method. |
| Explicit palette controls | `useColorProfile`, `selectedSwatchIds`, optional removed swatch IDs, and an optional soft accent-color preference. | The customer can select, edit or omit palette guidance. A selected color is a preference even when a personal color result is unavailable. Normalize and bound IDs against approved swatch revisions before ranking. |
| Metal choice | Existing `requiredGold` and `preferredGold` values from mobile preferences. A future test may supply a distinct validated metal preference signal. | Required gold is a hard filter. Preferred gold is a soft match. Infer metal suitability from the face only if the separate physical metal study and release review support that feature. |

Keep season names such as **Soft Summer** as optional display labels only after the specific label has been validated. They supply no required input at this stage. Keep original report values immutable and record a mobile palette edit with the recommendation request. Exclude portraits, frames, landmarks, region values, exact facial contrast, identity and experimental participant records from the product ranker and provider.

The following example is the normalized context assembled inside the mobile service. The color block can be null. The source of each selected swatch determines which reason the server can generate. The legacy warm/cool field remains readable for historical reports, and the new ranking path uses structured swatches and explicit metal choices.

```json
{
  "color": {
    "source": "manual_drape",
    "quality": "stable",
    "methodVersion": "manual-drape-v2",
    "paletteVersion": "sf-drapes-v1",
    "toneGroups": ["dull"],
    "swatches": [{ "id": "steel-blue", "evidence": "customer_selected" }]
  },
  "preferences": {
    "category": "earrings",
    "maxBudget": "5000000.00",
    "preferredGold": "white",
    "style": "minimal"
  }
}
```

## 3. Product metadata and provenance

### Authority and required data

- **Identity and product facts** come from the SF catalog or an approved supplier record. Keep `sku`, `name`, `category`, `brand`, `manufacturer`, `goldColor`, `purity`, `weightGrams`, `gemstones`, photos and variant identity attached to the correct SKU. Product attributes that differ by size, stone or color must be matched to the sellable variant if SF tracks it as a different SKU.
- **Eligibility** comes from store inventory and explicit hard filters. Use price as an exact `NUMERIC` value and require positive sellable stock in the originating store. Reuse the current archive, scope, IDR, category, brand, required metal, purity and maximum budget checks. Verify size or fit only if reliable variant data exists and the customer makes that a requirement.
- **Shopping preferences** reuse normalized `styleTags` and `occasionTags`. An approved vocabulary can describe classic, minimal or statement styles and daily wear or occasion use. Optional dimensions, selectable sizes and finish are useful where upstream data exists. Weight, gemstone authenticity, material, plating and value claims require the appropriate verified fact.

### Optional visual color components

Continue to serve and rank products with missing color metadata using supported factors. Store an optional structured list under the product/SKU, with a bounded number of visible components. Reuse the catalog editor and CSV preview/commit workflow for approved values. For the pilot, one verified major or noticeable accent per SKU is enough to enable shade matching. Add multiple components when two-tone or multi-stone products need them.

| Field | Examples and handling |
| --- | --- |
| `role` | `metal`, `stone`, `enamel`, `inlay` or `other_accent`. Distinguish the colored element from the base metal. |
| `appearance` | `chromatic`, `neutral`, `clear`, `metallic` or `unknown`. A clear stone or polished white metal can provide an appearance or style detail under its own category. |
| `label` and `colorFamily` | Approved short label and canonical family, such as `muted blue enamel` and `blue`. Allow exact named swatch or family-level information. Never derive a stone species or material from its color name. |
| `referenceSwatchId` or `lab` | Optional versioned match to a swatch or verified Lab sample of the visible component. Store the measurement protocol and white point where a comparison uses Lab. Product image hex values alone are display data. |
| `prominence` | `dominant`, `noticeable` or `minor`, relative to the displayed product. Use it to bound how much an accent can affect ranking. Store `null` if insufficiently verified. |
| `finish` | Verified `polished`, `matte`, `brushed`, `textured` or other approved labels. Keep decorative finish distinct from alloy, plating and purity. |
| `status`, `source`, `sourceRef`, `revision` | `verified` or `unverified` with source type such as supplier record, store check, measured sample, or approved reference swatch. Store an internal reference and include revisions in cache invalidation. Images may assist an internal catalog review. |

Direct numerical color comparison is suitable only for verified components and a comparable appearance and measurement setup. Gloss and lighting materially affect the appearance of reflective metals, and clear or highly variable stones also need suitable measurement evidence to support numerical matching. Use verified categorical descriptions and explicit metal preferences for those pieces. [Metallic appearance experiment](https://doi.org/10.5057/jjske.TJSKE-D-16-00010)

**Catalog intake** — Start from SF's approved SKU export. Normalize mappings for category, gold color, purity, style and occasion. Verify a small cross-section of available products with visually important colors, with consistent photos and references. Flag unmapped values, duplicate or mismatched SKUs, missing stock updates and unverified claims in the preview. Lightweight supplier or staff verification happens at catalog intake, independent of the customer's analysis.

## 4. Selection and scoring

1. **Filter by explicit requirements.** Authorize the mobile report and derive organization and store scope from it. Apply the current SQL eligibility checks before any scoring. A color profile cannot include a product outside budget or unavailable in that store. Keep eligible items with unverified styling metadata in the non-color candidate set. If no products pass the hard filters, return an empty result and allow the customer to change their filters.
2. **Resolve the palette for this request.** Apply the customer's chosen colors first. Use independently validated ranked swatches when the customer permits the profile and the current method is eligible. If only a tone group or a mixed result is available, support *colors to compare* from the curated swatches. Keep that explanation tied to the palette rather than claiming that one hue fits their face. If the profile is unavailable or turned off and the customer selects no swatch, omit the color signal.
3. **Measure visible color similarity.** Exact verified reference swatch matches can use full similarity credit. Comparable measured colors can use CIEDE2000. Family-level matches can receive a separately capped credit and a family-level reason. Near-neutral and clear appearances use their appropriate separate signals. Tune all product scoring constants on pilot data and keep the similarity metric distinct from measured preference for a person. [CIEDE2000 standard](https://www.iso.org/standard/82662.html) · [Reference test pairs](https://www.hajim.rochester.edu/ece/sites/gsharma/ciede2000/)

```text
measuredSimilarity(swatch, component) = max(0, 1 - deltaE00(swatch, component) / cutoff)

paletteFit = max over permitted swatches and verified components of
             swatchWeight × componentProminence × supportedSimilarity

rulesScore = wStyle × styleMatch + wOccasion × occasionMatch
             + wGold × preferredGoldMatch + wBudget × budgetFit
             + wPalette × paletteFit + diversityAdjustment
```

Use a positive calibrated `cutoff`. Each factor in `paletteFit` lies in `[0, 1]`. Exact stock, price and required fields remain eligibility constraints. Unavailable evidence gives zero bonus and a separate coverage flag, so a missing tag never becomes evidence of a poor match. Cap the profile bonus below the explicit soft preference weight by default. Keep verified preferred-metal matches ahead of nonmatching candidates when the customer supplies a preferred metal and alternatives are available. Apply that tiering in both engines. Product proximity to the face, finish and prominence are hypotheses to evaluate for the catalog. Tune only relationships for which the pilot provides evidence.

**Candidate selection** — Score the whole filtered pilot catalog on the server, then pass at most the existing 24 candidates to both engines. Fetch candidates with verified color evidence and retain strong preference matches even when their color metadata is missing. Use stable tie-breaking and bounded SQL selection or pagination. Keep product selection and catalog revision consistent when inventory or metadata changes, with no lock held through external inference. Return up to five validated ranked SKUs as today.

## 5. What the AI can see and say

Only the authorized `POST /api/mobile/recommendations` can trigger OpenRouter. Pass the normalized shopping signals needed for ranking, eligible SKU facts and a bounded set of **server-approved reasons for each SKU**. The server can supply a coarse palette match kind and score for each product. Omit product photos, calibration values, customer and session IDs, private report tokens, supplier costs, margins and exact inventory quantities. Display current price and verified facts from the database.

| Evidence | Example permitted reason |
| --- | --- |
| `preferred_metal` | “This piece is in your preferred white gold.” |
| `selected_shade_match` | “The verified blue enamel is close to the steel blue you selected.” |
| `palette_shade_to_compare` | “The blue accent is one to compare with the steel blue in your palette.” |
| `style_match` and `within_budget` | “A minimal design within your selected budget.” |
| Missing verified product color | Use style, occasion, budget, metal preference or a generic eligible-selection reason. Add a palette comparison after evidence is available. |

Reuse the current exact-reason validation initially. If the prompt is revised to return reason codes, constrain each code to the approved evidence on that exact candidate and render the text server-side. Validate unique eligible SKUs, rank order, required count, preference tiers and supported reasons. Refresh inventory and price before publication and on later reads. Apply the deterministic ranker when the provider fails validation or is unavailable. Kiosk use, QR views, previews and report reads preserve their zero-inference behavior.

**Run provenance** — Bind each run to the normalized preferences and palette override, effective approved profile and method/palette revision, ranking settings, catalog revision, reason or prompt version and experiment assignment. Update the catalog revision when verified appearance metadata changes. Keep the existing idempotent activation behavior and reproduce a reason from the recorded profile context and current verified product facts. If evidence has changed, refresh the sentence using supported facts or fall back to a neutral reason on read.

## 6. Worked example and verification

**Illustrative example.** A customer selects steel blue and prefers white gold, with a maximum budget of IDR 5 million. An eligible pair of white-gold earrings with verified blue enamel can receive both a metal preference score and a shade match. If comparable measurements have a ΔE₀₀ difference of 6 and the illustrative cutoff is 20, the similarity factor is `0.70` before prominence and preference weights. A second white-gold pair with no verified colored accent can still rank on metal, style and budget. A matching enamel piece that exceeds IDR 5 million or is sold out at the originating store stays outside the candidate pool. These are example values and records, independent of the actual SF catalog.

| Verification area | Evidence to collect |
| --- | --- |
| Color measurement | Synthetic and published CIEDE2000 fixtures, cutoff boundary, zero or missing chroma, unknown accent, metallic appearance, multi-component prominence and mixed palette cases. |
| Catalog correctness | Tenant and store scope, old product records, missing tags, SKU variants, archived or unavailable items, budget and purity constraints, audited changes, and a strong match whose SKU sorts after the first 24. |
| Customer control | Explicit metal and shade choices, profile disabled, unsupported or old profiles, uncertain results, undoing a palette edit and no eligible items. |
| Provider and fallback | Shared candidates, tier compliance, exact supported reasons, injected or unsupported reason text, invalid SKUs, duplicate activation, provider failure and no provider calls for passive views. |
| Scientific and retail outcomes | Keep held-out drape agreement and hue validation in the research scorecard. In mobile evaluation, first compare preference-only and palette-aware rules on the same inventory and UI. Separately compare validated AI and rules ranking from the same eligible pool and evidence. Prespecify relevance and try-on measures, track color-metadata coverage and compare by verified match availability. Treat click-through as engagement evidence. |

Implement the variable contract with fixtures before connecting live inventory. Add optional catalog color tags and the shared scorer next. Connect OpenRouter through the existing mobile activation adapter once SF supplies approved catalog data and provider testing is authorized. Preserve the camera-method release gate and enable each individualized ranking signal only after its corresponding evaluation.
