export const tones = ["vivid", "dark", "pale", "dull"] as const;
export type Tone = (typeof tones)[number];
export const hueFamilies = ["red", "yellow", "green", "blue", "violet", "neutral"] as const;
export type HueFamily = (typeof hueFamilies)[number];
export type Lab = readonly [number, number, number];
export const paletteVersion = "sf-drapes-fixture-v1";
export const methodVersion = "contrast-rule-fixture-v1";
export const manualMethod = "manual-drape-v1";
export const toneLabels: Record<Tone, { en: string; id: string }> = {
  vivid: { en: "Vivid", id: "Cerah" },
  dark: { en: "Dark", id: "Gelap" },
  pale: { en: "Pale", id: "Pucat" },
  dull: { en: "Muted", id: "Redup" },
};

type MeasuredReference = {
  physicalId: string;
  lab: Lab;
  protocol: string;
  whitePoint: string;
};
export type Swatch = {
  id: string;
  label: { en: string; id: string };
  display: string;
  family: HueFamily;
  tone: Tone | null;
  reference: MeasuredReference | null;
  status: "fixture" | "approved";
};
const rows = {
  vivid: [
    ["carmine", "Carmine", "Merah karmin", "#d4214e"],
    ["marigold", "Marigold", "Kuning marigold", "#e8a617"],
    ["emerald", "Emerald green", "Hijau zamrud", "#14805f"],
    ["cobalt", "Cobalt blue", "Biru kobalt", "#245ac9"],
    ["orchid", "Orchid", "Ungu anggrek", "#a13dac"],
  ],
  dark: [
    ["oxblood", "Oxblood", "Merah anggur", "#6e233a"],
    ["dark-ochre", "Dark ochre", "Oker gelap", "#785022"],
    ["pine", "Pine green", "Hijau pinus", "#234f45"],
    ["midnight-blue", "Midnight blue", "Biru malam", "#24365d"],
    ["aubergine", "Aubergine", "Ungu terong", "#523759"],
  ],
  pale: [
    ["shell-pink", "Shell pink", "Merah muda kerang", "#f1cacc"],
    ["buttercream", "Buttercream", "Kuning krem", "#f4e2ad"],
    ["mint", "Mint", "Hijau mint", "#c5e3d1"],
    ["mist-blue", "Mist blue", "Biru kabut", "#c4daea"],
    ["lavender", "Lavender", "Lavender", "#dcd0ed"],
  ],
  dull: [
    ["dusty-rose", "Dusty rose", "Mawar lembut", "#b87983"],
    ["muted-ochre", "Muted ochre", "Oker redup", "#b89b5c"],
    ["sage", "Sage green", "Hijau sage", "#899d81"],
    ["steel-blue", "Steel blue", "Biru baja", "#658398"],
    ["heather", "Heather", "Ungu heather", "#937d9b"],
  ],
} as const;
const neutralRows = [
  ["soft-white", "Soft white", "Putih lembut", "#f0ebe1"],
  ["taupe", "Taupe", "Taupe", "#9b887b"],
  ["charcoal", "Charcoal", "Arang", "#45444b"],
] as const;
function fixture(
  [id, en, idLabel, display]: readonly [string, string, string, string],
  family: HueFamily,
  tone: Tone | null,
): Swatch {
  // The display values are illustrative sRGB. Physical measurements must be entered separately.
  return { id, label: { en, id: idLabel }, display, family, tone, reference: null, status: "fixture" };
}
const fixtureSwatches = [
  ...tones.flatMap((tone) => rows[tone].map((row, i) => fixture(row, hueFamilies[i], tone))),
  ...neutralRows.map((row) => fixture(row, "neutral", null)),
];
const registry: Record<string, readonly Swatch[]> = { [paletteVersion]: fixtureSwatches };
export const swatchesFor = (version: string) => Object.hasOwn(registry, version) ? registry[version] : undefined;
export const swatchFor = (version: string, id: string) => swatchesFor(version)?.find((swatch) => swatch.id === id);
export function paletteFor(version: string, groups: Tone[]) {
  return swatchesFor(version)?.filter(({ tone }) => tone === null || groups.includes(tone)) ?? [];
}
export const paletteSnapshot = (swatches: readonly Swatch[]) =>
  swatches.map(({ id, label, display, family, tone }) => ({ id, label, display, family, tone }));

export function comparableDrapes(version: string) {
  const pairs: [Swatch, Swatch][] = [];
  const library = swatchesFor(version) ?? [];
  // The fixture sequence presents every tone three times across distinct families.
  const trials: [Tone, Tone, HueFamily][] = [
    ["vivid", "dull", "blue"], ["pale", "dark", "green"], ["dark", "dull", "red"],
    ["pale", "vivid", "violet"], ["dull", "pale", "yellow"], ["vivid", "dark", "red"],
  ];
  for (const [a, b, family] of trials) {
    const left = library.find((swatch) => swatch.family === family && swatch.tone === a);
    const right = library.find((swatch) => swatch.family === family && swatch.tone === b);
    if (left && right) pairs.push([left, right]);
  }
  return pairs;
}

export function drapeChoice(votes: (Tone | null)[]): Tone[] {
  const scores = tones.map((tone) => ({ tone, votes: votes.filter((vote) => vote === tone).length }));
  scores.sort((a, b) => b.votes - a.votes);
  if (scores[0].votes < 2) return [];
  const winners = scores.filter((entry) => entry.votes === scores[0].votes);
  return winners.length <= 2 ? winners.map(({ tone }) => tone) : [];
}
