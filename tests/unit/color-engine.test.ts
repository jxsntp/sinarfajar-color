import { expect, it } from "vitest";
import { fitChart, checkChart } from "@/domains/color-analysis/calibration";
import { paletteFit, type PaletteContext } from "@/domains/recommendations/palette-evidence";
import { visibleColorsInput } from "@/domains/catalog/visible-colors";
import { deltaE00 } from "@/domains/color-analysis/delta-e";
import { pixelLab, regionContrast, scoreTones, summarizeCapture, type QualityLimits, type ToneRule } from "@/domains/color-analysis/measurement";
import { blindedPairs, evaluateStudy, studySplit } from "@/domains/color-analysis/research";
import {
  colorStyles, drapeChoice, legacyPaletteVersion, paletteFor, paletteVersion, sameSwatch, swatchFor, swatchesFor, tones,
  type Lab, type Tone,
} from "@/domains/color-analysis/swatches";
import { rankTrial } from "@/domains/color-analysis/trial-ranking";
import { checkDrapes, drapeSteps, engineCheck, nextDrapes } from "@/domains/color-analysis/draping";

it("keeps display fixtures separate from measured references and derives deliberate drape results", () => {
  const swatches = swatchesFor(legacyPaletteVersion)!;
  expect(swatches).toHaveLength(23);
  expect(new Set(swatches.map((s) => s.id)).size).toBe(23);
  expect(swatches.every((swatch) => swatch.reference === null && swatch.status === "fixture")).toBe(true);
  expect(drapeChoice([])).toEqual([]);
  expect(drapeChoice(["dull", "dull", "vivid"])).toEqual(["dull"]);
  expect(drapeChoice(["dull", "dull", "vivid", "vivid"])).toEqual(["vivid", "dull"]);
  expect(drapeChoice(["dull", "vivid", "dark", "pale"])).toEqual([]);
});
it("uses calibrated L* and the median of absolute brow-to-skin ratios", () => {
  expect(regionContrast(58, 36)).toBeCloseTo(22 / 94, 12);
  expect(regionContrast(36, 58)).toBeCloseTo(22 / 94, 12);
  for (const [skin, brow] of [[0, 0], [NaN, 50], [-1, 42], [101, 20]]) {
    expect(regionContrast(skin, brow)).toBeNull();
  }
  const quality: QualityLimits = {
    minFrames: 2, maxContrastDeviation: 0.06, minSharpness: 9, maxClipped: 0.09, maxSkinDifference: 14,
    browFraction: 0.5, maxSkinDeviation: 6, maxReferenceDrift: 3,
  };
  const frame = { sides: [0.2, 0.24] as [number, number], skin: [60, 14, 22] as Lab };
  expect(summarizeCapture([frame], quality)).toBeNull();
  expect(summarizeCapture([frame, frame], quality)?.contrast).toBeCloseTo(0.22);
  expect(summarizeCapture([frame, { ...frame, sides: [0.1, 0.8] }], quality)).toBeNull();
});
it("fits a first-order chart transform and checks held-out CIEDE2000 errors", () => {
  const white = [0.95047, 1, 1.08883] as const;
  const points = [[0,0,0], [255,0,0], [0,255,0], [0,0,255], [255,255,255]] as const;
  const patches = points.map((rgb) => ({ rgb, xyz: rgb.map((v, i) => v * white[i] / 255) as unknown as Lab }));
  const calibration = fitChart(patches.slice(0, 4), "test-chart", white)!;
  expect(checkChart(calibration, patches.slice(4))?.max).toBeCloseTo(0, 8);
  expect(pixelLab([255,255,255], calibration)[0]).toBeCloseTo(100);
  expect(fitChart(Array(4).fill(patches[0]), "bad", white)).toBeNull();
  expect(deltaE00([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 4);
  expect(deltaE00([50, 3.1571, -77.2803], [50, 0, -82.7485])).toBeCloseTo(2.8615, 4);
  expect(deltaE00([50, 0, 0], [50, 0, 0])).toBe(0);
});
it("reports paired tones, mixed boundaries and invalid anchors deterministically", () => {
  const rule: ToneRule = { low: 0.1, high: 0.5, mixedWidth: 0.10, tieOrder: [...tones] };
  expect(scoreTones(0.05, rule)).toMatchObject({ tones: ["pale", "dull"], quality: "stable" });
  expect(scoreTones(0.3, rule)).toMatchObject({ tones: ["vivid", "pale"], quality: "mixed" });
  expect(scoreTones(0.7, rule)).toMatchObject({ tones: ["vivid", "dark"], quality: "stable" });
  expect(scoreTones(NaN, rule)).toBeNull();
  expect(scoreTones(0.4, { ...rule, low: rule.high })).toBeNull();
});
it("keeps blinded choices and evaluation split at participant level", () => {
  const seed = "synthetic-registered-seed";
  const people = Array.from({ length: 12 }, (_, i) => {
    const id = "fixture-" + i;
    return {
      id, consentVersion: "synthetic", split: studySplit(seed, id), lightnessBand: "middle" as const,
      contrast: 0.1 + i * 0.03, repeat: 0.1 + i * 0.03, skinAB: null,
      trials: blindedPairs(paletteVersion, seed, id, true).map((trial) => ({ ...trial, outcome: "left" as const })),
    };
  });
  const result = evaluateStudy({ version: paletteVersion, seed, people });
  expect(result.development + result.holdout).toBe(12);
  expect(result.outcomes.tone.left).toBeGreaterThan(0);
  expect(result.fittedHue.trials).toBe(0);
  const plan = blindedPairs(paletteVersion, seed, people[0].id);
  expect(plan.at(-2)).toMatchObject({ left: plan[0].right, right: plan[0].left });
});

it("uses only verified compatible accent evidence and caps family matching", () => {
  const palette: PaletteContext = {
    version: paletteVersion, source: "manual_drape", method: "manual-drape-v1",
    quality: "stable", toneGroups: ["dull"], swatches: [{ id: "steel-blue", evidence: "customer_selected" }],
  };
  const verified = {
    role: "inlay", appearance: "chromatic", colorFamily: "blue",
    source: "store_check", sourceRef: "fixture-private", status: "verified", prominence: "dominant",
  };
  const [family] = visibleColorsInput.parse([verified]);
  const [exact] = visibleColorsInput.parse([{ ...verified, reference: { version: paletteVersion, id: "steel-blue" } }]);
  expect(paletteFit([exact], palette)).toMatchObject({ score: 1, kind: "selected_exact" });
  expect(paletteFit([family], palette)).toMatchObject({ score: 0.48, kind: "selected_family" });
  expect(paletteFit([{ ...family, role: "metal" }], palette)).toEqual({ score: 0 });
  expect(paletteFit([{ ...family, status: "unverified" }], palette)).toEqual({ score: 0 });
  expect(paletteFit([family], null)).toEqual({ score: 0 });
  expect(visibleColorsInput.safeParse([{ ...verified, sourceRef: undefined }]).success).toBe(false);
});

it("keeps the original library in the style revision and offers enough shades for every style", () => {
  const legacy = swatchesFor(legacyPaletteVersion)!;
  const styled = swatchesFor(paletteVersion)!;
  expect(styled).toHaveLength(44);
  expect(new Set(styled.map(({ id }) => id)).size).toBe(44);
  expect(styled.every((swatch) => swatch.status === "fixture" && swatch.reference === null)).toBe(true);
  for (const swatch of legacy) {
    expect(swatchFor(paletteVersion, swatch.id)).toMatchObject({ display: swatch.display, family: swatch.family, tone: swatch.tone });
  }
  expect(paletteFor(paletteVersion, [...tones]).map(({ id }) => id)).toEqual(legacy.map(({ id }) => id));
  const ids = (version: string, votes: (Tone | null)[]) => nextDrapes(version, votes)?.map(({ id }) => id);
  expect(ids(paletteVersion, ["pale", "dark", "vivid"])).toEqual(ids(legacyPaletteVersion, ["pale", "dark", "vivid"]));
  const pairs: Tone[][] = [["vivid", "dark"], ["pale", "dull"], ["vivid", "pale"], ["dark", "dull"]];
  for (const style of colorStyles) {
    for (const pair of pairs) {
      expect(paletteFor(paletteVersion, pair, style).filter(({ tone }) => tone !== null).length).toBeGreaterThanOrEqual(3);
    }
    expect(paletteFor(paletteVersion, [], style).length).toBeGreaterThanOrEqual(3);
  }
  expect(paletteFor(paletteVersion, ["vivid"], "feminine").map(({ id }) => id)).toEqual(
    ["marigold", "orchid", "soft-white", "taupe", "fuchsia", "coral-red", "turquoise", "champagne"]);
  expect(paletteFor(paletteVersion, ["dull"], "masculine").some(({ id }) => id === "dusty-rose")).toBe(false);
  expect(sameSwatch({ version: legacyPaletteVersion, id: "sage" }, { version: paletteVersion, id: "sage" })).toBe(true);
  expect(sameSwatch({ version: "other", id: "sage" }, { version: paletteVersion, id: "sage" })).toBe(false);
});

it("ranks camera colors only within the chosen style", () => {
  const group = { tones: ["vivid", "dark"] as Tone[], quality: "stable" as const };
  for (const style of colorStyles) {
    const allowed = new Set(paletteFor(paletteVersion, group.tones, style).map(({ id }) => id));
    const result = rankTrial([62, 14, 20], paletteVersion, group, style)!;
    expect(result.swatchIds).toHaveLength(3);
    expect(result.swatchIds.every((id) => allowed.has(id))).toBe(true);
  }
});

it("orders comparisons like an analyst: depth, clarity, then the two leaders", () => {
  const tonesOf = (votes: (Tone | null)[]) => nextDrapes(paletteVersion, votes)!.map(({ tone }) => tone).sort();
  expect(tonesOf([])).toEqual(["dark", "pale"]);
  expect(tonesOf(["pale"])).toEqual(["dark", "pale"]);
  expect(tonesOf(["pale", "pale"])).toEqual(["dull", "vivid"]);
  // One leader in each dimension: they meet twice, and a split result stays mixed.
  expect(tonesOf(["pale", "pale", "vivid", "vivid"])).toEqual(["pale", "vivid"]);
  expect(tonesOf(["pale", "pale", "vivid", "vivid", "pale"])).toEqual(["pale", "vivid"]);
  expect(drapeChoice(["pale", "pale", "vivid", "vivid", "pale", "vivid"])).toEqual(["vivid", "pale"]);
  expect(drapeChoice(["pale", "pale", "vivid", "vivid", "pale", "pale"])).toEqual(["pale"]);
  // A tied dimension sends both of its tones to the final comparisons.
  expect(tonesOf(["pale", "dark", "dull", "dull"])).toEqual(["dull", "pale"]);
  expect(tonesOf(["pale", "dark", "dull", "dull", "dull"])).toEqual(["dark", "dull"]);
  expect(nextDrapes(paletteVersion, Array(drapeSteps).fill(null))).toBeUndefined();
  // Every step uses swatches that exist, with each pair from one hue family.
  for (const votes of [[], ["dark"], ["dark", "dark"], ["dark", "dark", "dull"], ["dark", "dark", "dull", "dull"], ["dark", "dark", "dull", "dull", null]] as (Tone | null)[][]) {
    const pair = nextDrapes(paletteVersion, votes)!;
    expect(pair[0].family).toBe(pair[1].family);
  }
});
it("tests the camera's top picks against their opposites and reports agreement", () => {
  const trial = rankTrial([62, 14, 20], paletteVersion, { tones: ["vivid", "dark"], quality: "stable" }, "feminine")!;
  const pairs = checkDrapes(trial, "feminine");
  expect(pairs).toHaveLength(2);
  const picks = trial.swatchIds.slice(0, 2);
  pairs.forEach((pair, i) => {
    expect(pair.map(({ id }) => id)).toContain(picks[i]);
    const opposite = pair.find(({ id }) => id !== picks[i])!;
    expect(opposite.family).toBe(swatchFor(paletteVersion, picks[i])!.family);
    expect(["pale", "dull"]).toContain(opposite.tone);
  });
  const opposites = pairs.map((pair, i) => pair.find(({ id }) => id !== picks[i])!.id);
  expect(engineCheck(trial, picks)).toBe("confirmed");
  expect(engineCheck(trial, [picks[0], opposites[1]])).toBe("split");
  expect(engineCheck(trial, [picks[0], null])).toBe("split");
  expect(engineCheck(trial, [null, null])).toBe("split");
  expect(engineCheck(trial, opposites)).toBe("overruled");
  expect(engineCheck(trial, [opposites[0], null])).toBe("overruled");
});
