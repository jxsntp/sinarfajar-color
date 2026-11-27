import { createHash } from "node:crypto";
import { z } from "zod";
import { median, scoreTones, type ToneRule } from "./measurement";
import { hueFamilies, swatchesFor, tones, type Swatch } from "./swatches";

const randomFraction = (key: string) => createHash("sha256").update(key).digest().readUInt32BE(0) / 2 ** 32;
const outcomes = ["left", "right", "both", "neither", "skipped"] as const;
const contrast = z.number().min(0).max(1);
const features = z.tuple([z.number().min(-160).max(160), z.number().min(-160).max(160)]);
export const studyInput = z.object({
  version: z.string(),
  seed: z.string().min(8),
  people: z.array(z.object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/),
    consentVersion: z.string().min(1).max(64),
    split: z.enum(["development", "holdout"]),
    lightnessBand: z.enum(["lower", "middle", "higher", "unavailable"]),
    contrast: contrast.nullable(), repeat: contrast.nullable(), skinAB: features.nullable(),
    trials: z.array(z.object({
      block: z.enum(["tone", "hue"]),
      left: z.string(), right: z.string(), outcome: z.enum(outcomes),
    }).strict()).max(100),
  }).strict()),
}).strict().refine(({ people }) => new Set(people.map(({ id }) => id)).size === people.length, "Participant IDs must be unique");
type Study = z.infer<typeof studyInput>;
type Person = Study["people"][number];
type Trial = Person["trials"][number];
type Scores = (person: Person, swatch: Swatch) => number;
const sigmoid = (value: number) => 1 / (1 + Math.exp(-value));
const winner = (gap: number) => Math.abs(gap) < 1e-9 ? 0 : Math.sign(gap);
const decisive = (trial: Trial) => trial.outcome === "left" ? 1 : trial.outcome === "right" ? -1 : 0;
function span(a: Swatch, b: Swatch) {
  if (!a.reference || !b.reference || a.reference.protocol !== b.reference.protocol ||
      a.reference.whitePoint !== b.reference.whitePoint) return false;
  const [al, aa, ab] = a.reference.lab, [bl, ba, bb] = b.reference.lab;
  return Math.abs(al - bl) <= 5 && Math.abs(Math.hypot(aa, ab) - Math.hypot(ba, bb)) <= 7;
}
export function blindedPairs(version: string, seed: string, id: string, includeHue = false) {
  const library = (swatchesFor(version) ?? []).filter((swatch) => swatch.tone !== null);
  const order = ["tone", ...(includeHue ? ["hue"] : [])] as Trial["block"][];
  return order.flatMap((block) => {
    const pairs = library.flatMap((left, i) => library.slice(i + 1).filter((right) => block === "tone"
      ? left.family === right.family && left.tone !== right.tone
      : left.tone === right.tone && left.family !== right.family && span(left, right))
      .map((right) => {
        const key = [version, seed, id, block, left.id, right.id].join("/");
        return { block, left: left.id, right: right.id, order: randomFraction(key), flip: randomFraction(key + "/side") < 0.5 };
      }));
    pairs.sort((a, b) => a.order - b.order);
    const chosen = pairs.slice(0, 12).map((pair) => ({ block, left: pair.flip ? pair.right : pair.left, right: pair.flip ? pair.left : pair.right }));
    return [...chosen, ...chosen.slice(0, 2).map((pair) => ({ block, left: pair.right, right: pair.left }))];
  });
}
export function studySplit(seed: string, id: string): "development" | "holdout" {
  return randomFraction(seed + "/participant/" + id) < 0.7 ? "development" : "holdout";
}
function normalization(values: number[]) {
  const center = values.reduce((sum, v) => sum + v, 0) / Math.max(1, values.length);
  const scale = Math.sqrt(values.reduce((sum, v) => sum + (v - center) ** 2, 0) / Math.max(1, values.length)) || 1;
  return (v: number) => (v - center) / scale;
}
function fitModel(
  development: Person[], block: Trial["block"], library: Map<string, Swatch>,
  vector: (person: Person, swatch: Swatch) => number[], width: number,
): Scores {
  const rows = development.flatMap((person) => person.trials.flatMap((trial) => {
    if (trial.block !== block || !decisive(trial)) return [];
    const left = vector(person, library.get(trial.left)!);
    const right = vector(person, library.get(trial.right)!);
    return [{ x: left.map((value, i) => value - right[i]), y: decisive(trial) === 1 ? 1 : 0 }];
  }));
  let fit = Array<number>(width).fill(0);
  const dot = (x: number[]) => x.reduce((sum, value, i) => sum + value * fit[i], 0);
  for (let step = 0; step < 300 && rows.length; step++) {
    const gradient = Array<number>(width).fill(0);
    for (const { x, y } of rows) {
      const error = sigmoid(dot(x)) - y;
      x.forEach((n, i) => { gradient[i] += n * error; });
    }
    fit = fit.map((v, i) => v - 0.25 * (gradient[i] / rows.length + 0.025 * v));
  }
  return (person, swatch) => dot(vector(person, swatch));
}
function percentile(values: number[], p: number) {
  const ordered = values.toSorted((a, b) => a - b);
  return ordered[Math.floor((ordered.length - 1) * p)] ?? null;
}
export function evaluateStudy(study: Study) {
  const library = new Map((swatchesFor(study.version) ?? []).map((swatch) => [swatch.id, swatch]));
  if (!library.size) throw new Error("Unknown study swatch revision");
  for (const person of study.people) {
    if (studySplit(study.seed, person.id) !== person.split) throw new Error("Participant split differs from its registered assignment");
    for (const trial of person.trials) {
      const a = library.get(trial.left), b = library.get(trial.right);
      if (!a?.tone || !b?.tone || a.id === b.id || (trial.block === "tone"
        ? a.family !== b.family || a.tone === b.tone
        : a.tone !== b.tone || a.family === b.family || !span(a, b))) throw new Error("Trial is outside the registered comparison block");
    }
  }
  const development = study.people.filter(({ split }) => split === "development");
  const heldOut = study.people.filter(({ split }) => split === "holdout");
  const contrastValues = development.flatMap(({ contrast }) => contrast === null ? [] : [contrast]);
  const standardContrast = normalization(contrastValues);
  const rows = development.flatMap(({ contrast, repeat }) => contrast === null || repeat === null ? [] : [Math.abs(contrast - repeat)]);
  const low = percentile(contrastValues, 0.2), high = percentile(contrastValues, 0.8);
  const toneVector = (person: Person, swatch: Swatch, fitted: boolean) => {
    const base = tones.slice(1).map((tone) => Number(swatch.tone === tone));
    return fitted ? [...base, ...base.map((v) => v * (person.contrast === null ? 0 : standardContrast(person.contrast)))] : base;
  };
  const population = fitModel(development, "tone", library, (p, s) => toneVector(p, s, false), 3);
  const fittedTone = fitModel(development.filter((p) => p.contrast !== null), "tone", library, (p, s) => toneVector(p, s, true), 6);
  const tieOrder = [...tones].sort((a, b) => {
    const first = [...library.values()].find((swatch) => swatch.tone === a)!;
    const second = [...library.values()].find((swatch) => swatch.tone === b)!;
    return population(development[0], second) - population(development[0], first);
  });
  const rule: ToneRule | null = low !== null && high !== null && low < high
    ? { low, high, mixedWidth: Math.min(0.45, (percentile(rows, 0.8) ?? 0) / (high - low)), tieOrder } : null;
  const contrastRule: Scores = (person, swatch) =>
    !rule || person.contrast === null ? 0 : scoreTones(person.contrast, rule)?.scores[swatch.tone!] ?? 0;

  const named = [...library.values()].filter((swatch) => swatch.tone).slice(1);
  const families = hueFamilies.filter((family) => family !== "neutral").slice(1);
  const scaleA = normalization(development.flatMap(({ skinAB }) => skinAB ? [skinAB[0]] : []));
  const scaleB = normalization(development.flatMap(({ skinAB }) => skinAB ? [skinAB[1]] : []));
  const hueVector = (person: Person, swatch: Swatch, fitted: boolean) => {
    const base = named.map((entry) => Number(swatch.id === entry.id));
    const coefficients = families.flatMap((family) => swatch.family === family && person.skinAB
      ? [scaleA(person.skinAB[0]), scaleB(person.skinAB[1])] : [0, 0]);
    return fitted ? [...base, ...coefficients] : base;
  };
  const hueDevelopment = development.filter((p) => p.skinAB !== null);
  const popularity = fitModel(hueDevelopment, "hue", library, (p, s) => hueVector(p, s, false), named.length);
  const fittedHue = fitModel(hueDevelopment, "hue", library, (p, s) => hueVector(p, s, true), named.length + 2 * families.length);

  function agreement(people: Person[], block: Trial["block"], model: Scores, baseline: Scores) {
    const credit = (observed: number, predicted: number) => predicted === 0 ? 0.5 : Number(observed === predicted);
    const groups = people.map((person) => person.trials.filter((trial) => trial.block === block && decisive(trial)).map((trial) => {
      const a = library.get(trial.left)!, b = library.get(trial.right)!;
      return [credit(decisive(trial), winner(model(person, a) - model(person, b))),
        credit(decisive(trial), winner(baseline(person, a) - baseline(person, b)))];
    })).filter((group) => group.length);
    const all = groups.flat();
    const average = (values: number[][], i: number) => values.reduce((sum, value) => sum + value[i], 0) / values.length;
    if (!all.length) return { participants: 0, trials: 0, agreement: null, baseline: null, improvement: null, interval95: null };
    const bootstrap = Array.from({ length: 1000 }, (_, draw) => {
      const selected = groups.flatMap((_, i) => groups[Math.floor(randomFraction(study.seed + "/bootstrap/" + draw + "/" + i) * groups.length)]);
      return average(selected, 0) - average(selected, 1);
    });
    const result = average(all, 0), base = average(all, 1);
    return { participants: groups.length, trials: all.length, agreement: result, baseline: base,
      improvement: result - base, interval95: [percentile(bootstrap, 0.025), percentile(bootstrap, 0.975)] };
  }
  const decisiveByBlock = (block: Trial["block"]) => Object.fromEntries(outcomes.map((outcome) =>
    [outcome, heldOut.flatMap((person) => person.trials).filter((trial) => trial.block === block && trial.outcome === outcome).length]));
  return {
    version: study.version, development: development.length, holdout: heldOut.length, rule,
    outcomes: { tone: decisiveByBlock("tone"), hue: decisiveByBlock("hue") },
    contrastRule: agreement(heldOut.filter((p) => p.contrast !== null && rule), "tone", contrastRule, population),
    fittedTone: agreement(heldOut.filter((p) => p.contrast !== null), "tone", fittedTone, population),
    fittedHue: agreement(heldOut.filter((p) => p.skinAB !== null), "hue", fittedHue, popularity),
    bands: Object.fromEntries(["lower", "middle", "higher", "unavailable", "all"].map((band) => {
      const people = heldOut.filter((p) => band === "all" || p.lightnessBand === band);
      const results = people.map((p) => p.contrast !== null && rule ? scoreTones(p.contrast, rule) : null);
      const repeated = people.flatMap((p, i) => p.repeat !== null && rule && results[i]
        ? [Number(JSON.stringify(scoreTones(p.repeat, rule)?.tones) === JSON.stringify(results[i]?.tones))] : []);
      return [band, { count: people.length, stable: results.filter((r) => r?.quality === "stable").length,
        mixed: results.filter((r) => r?.quality === "mixed").length, unavailable: results.filter((r) => !r).length,
        repeatCount: repeated.length, repeatAgreement: repeated.length ? repeated.reduce((a, b) => a + b, 0) / repeated.length : null,
        medianContrastDifference: median(people.flatMap((p) => p.contrast !== null && p.repeat !== null ? [Math.abs(p.contrast - p.repeat)] : [])) }];
    })),
  };
}
