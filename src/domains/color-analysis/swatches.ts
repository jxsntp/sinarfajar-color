export const tones = ["vivid", "dark", "pale", "dull"] as const;
export type Tone = (typeof tones)[number];
export const hueFamilies = ["red", "yellow", "green", "blue", "violet", "neutral"] as const;
export type HueFamily = (typeof hueFamilies)[number];
export type Lab = readonly [number, number, number];
/** The original 20 drapes and 3 neutrals. Kept for existing reports, catalog references and study plans. */
export const legacyPaletteVersion = "sf-drapes-fixture-v1";
/** The original library plus style-tagged additions. */
export const paletteVersion = "sf-drapes-fixture-v2";
export const colorStyles = ["both", "feminine", "masculine"] as const;
/** A customer-chosen style direction. `both` is the original library. */
export type ColorStyle = (typeof colorStyles)[number];
export const styleLabels: Record<ColorStyle, { en: string; id: string }> = {
  both: { en: "All styles", id: "Semua gaya" },
  feminine: { en: "Feminine", id: "Feminin" },
  masculine: { en: "Masculine", id: "Maskulin" },
};
export const methodVersion = "contrast-rule-fixture-v2";
// v2: analyst-order comparisons (depth, clarity, then the leaders) with a metal step. v1 used a fixed sequence.
export const manualMethod = "manual-drape-v2";
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
  /** Style sets that include this swatch. */
  styles: readonly ColorStyle[];
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
  styles: readonly ColorStyle[] = ["both"],
): Swatch {
  // The display values are illustrative sRGB. Physical measurements must be entered separately.
  return { id, label: { en, id: idLabel }, display, family, tone, reference: null, status: "fixture", styles };
}
const originalSwatches = [
  ...tones.flatMap((tone) => rows[tone].map((row, i) => fixture(row, hueFamilies[i], tone))),
  ...neutralRows.map((row) => fixture(row, "neutral", null)),
];
// Existing swatches that also belong to a style set.
const originalStyles: Record<string, ColorStyle[]> = {
  orchid: ["feminine"], marigold: ["feminine"], aubergine: ["feminine"], oxblood: ["feminine"],
  "shell-pink": ["feminine"], lavender: ["feminine"], buttercream: ["feminine"], mint: ["feminine"],
  "dusty-rose": ["feminine"], heather: ["feminine"], "muted-ochre": ["feminine"],
  cobalt: ["masculine"], emerald: ["masculine"], carmine: ["masculine"], "midnight-blue": ["masculine"],
  pine: ["masculine"], "dark-ochre": ["masculine"], "mist-blue": ["masculine"], "steel-blue": ["masculine"],
  sage: ["masculine"], "soft-white": ["feminine", "masculine"], taupe: ["feminine", "masculine"],
  charcoal: ["masculine"],
};
type StyledRow = readonly [string, string, string, string, HueFamily, Tone | null];
const styledRows: Record<Exclude<ColorStyle, "both">, StyledRow[]> = {
  feminine: [
    ["fuchsia", "Fuchsia", "Merah muda fuchsia", "#c8247e", "red", "vivid"],
    ["coral-red", "Coral red", "Merah koral", "#e8494a", "red", "vivid"],
    ["turquoise", "Turquoise", "Biru toska", "#1aa5b0", "blue", "vivid"],
    ["deep-teal", "Deep teal", "Teal gelap", "#1d4a52", "blue", "dark"],
    ["plum-rose", "Plum rose", "Mawar plum", "#6e2f4f", "violet", "dark"],
    ["chocolate", "Chocolate", "Cokelat", "#5a3628", "yellow", "dark"],
    ["blush-peach", "Blush peach", "Persik lembut", "#f6cdb8", "red", "pale"],
    ["mauve", "Mauve", "Ungu mauve", "#a8808f", "violet", "dull"],
    ["soft-terracotta", "Soft terracotta", "Terakota lembut", "#b9735c", "red", "dull"],
    ["champagne", "Champagne", "Sampanye", "#e9dcc3", "neutral", null],
  ],
  masculine: [
    ["teal", "Teal", "Biru teal", "#127a80", "blue", "vivid"],
    ["burnt-orange", "Burnt orange", "Oranye bata", "#cc5a1e", "yellow", "vivid"],
    ["burgundy", "Burgundy", "Merah burgundi", "#6b1f2c", "red", "dark"],
    ["espresso", "Espresso", "Cokelat espreso", "#4a3328", "yellow", "dark"],
    ["pale-sage", "Pale sage", "Sage pucat", "#d3dfc8", "green", "pale"],
    ["stone", "Stone", "Batu", "#ddd5c6", "yellow", "pale"],
    ["ecru", "Ecru", "Ekru", "#ede4cf", "yellow", "pale"],
    ["light-gray", "Light gray", "Abu-abu muda", "#d6d7d9", "neutral", "pale"],
    ["khaki", "Khaki", "Khaki", "#a59a72", "yellow", "dull"],
    ["slate", "Slate", "Biru slate", "#6b7a85", "blue", "dull"],
    ["navy-gray", "Navy gray", "Abu navy", "#4b5363", "neutral", null],
  ],
};
const styledSwatches = [
  ...originalSwatches.map((swatch) => ({ ...swatch, styles: ["both", ...(originalStyles[swatch.id] ?? [])] as const })),
  ...(Object.entries(styledRows) as [ColorStyle, StyledRow[]][]).flatMap(([style, list]) =>
    list.map(([id, en, idLabel, display, family, tone]) => fixture([id, en, idLabel, display], family, tone, [style]))),
];
const registry: Record<string, readonly Swatch[]> = {
  [legacyPaletteVersion]: originalSwatches,
  [paletteVersion]: styledSwatches,
};
// A later revision keeps every swatch ID of its predecessors with the same display value.
const lineage: Record<string, readonly string[]> = { [paletteVersion]: [legacyPaletteVersion] };
export const swatchesFor = (version: string) => Object.hasOwn(registry, version) ? registry[version] : undefined;
export const swatchFor = (version: string, id: string) => swatchesFor(version)?.find((swatch) => swatch.id === id);
/** True when two versioned references name the same swatch. */
export function sameSwatch(a: { version: string; id: string }, b: { version: string; id: string }) {
  return a.id === b.id && (a.version === b.version || Boolean(lineage[a.version]?.includes(b.version)) ||
    Boolean(lineage[b.version]?.includes(a.version)));
}
/** Swatches for the tone groups plus neutrals, limited to one style set. */
export function paletteFor(version: string, groups: Tone[], style: ColorStyle = "both") {
  return swatchesFor(version)?.filter(({ tone, styles }) =>
    (tone === null || groups.includes(tone)) && styles.includes(style)) ?? [];
}
export const paletteSnapshot = (swatches: readonly Swatch[]) =>
  swatches.map(({ id, label, display, family, tone }) => ({ id, label, display, family, tone }));

export function drapeChoice(votes: (Tone | null)[]): Tone[] {
  const scores = tones.map((tone) => ({ tone, votes: votes.filter((vote) => vote === tone).length }));
  scores.sort((a, b) => b.votes - a.votes);
  if (scores[0].votes < 2) return [];
  const winners = scores.filter((entry) => entry.votes === scores[0].votes);
  return winners.length <= 2 ? winners.map(({ tone }) => tone) : [];
}
