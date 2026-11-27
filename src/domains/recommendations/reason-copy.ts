import { paletteVersion, swatchesFor } from "../color-analysis/swatches";

const families: Record<string, string> = {
  red: "merah", yellow: "kuning", green: "hijau", blue: "biru", violet: "ungu", neutral: "netral",
};
const names = new Map((swatchesFor(paletteVersion) ?? []).map((swatch) => [swatch.label.en.toLowerCase(), swatch.label.id]));
const shadeName = (name: string) => names.get(name) ?? name;

export function stylingReason(reason: string, locale: string) {
  if (locale === "en-US") return reason;
  const phrases: [RegExp, string][] = [
    [
      /Selected for your (.+?) style preference\./g,
      "Sesuai dengan preferensi gaya $1 Anda.",
    ],
    [/Selected for your (.+?) occasion\./g, "Pilihan untuk acara $1 Anda."],
    [/Matches the metal color suggested in your camera result\./g, "Sesuai dengan warna emas yang disarankan dari hasil kamera Anda."],
    [
      /Reflects your preferred gold color\./g,
      "Sesuai dengan warna emas pilihan Anda.",
    ],
    [
      /One of the options within your selected budget\./g,
      "Salah satu pilihan dalam anggaran Anda.",
    ],
    [
      /A styling option to compare with your chosen color palette\./g,
      "Pilihan gaya untuk dibandingkan dengan palet Anda.",
    ],
    [
      /An option to explore from this store's eligible selection\./g,
      "Pilihan yang sesuai dari koleksi toko ini.",
    ],
  ];
  return phrases.reduce(
    (text, [match, replacement]) => text.replace(match, replacement),
    reason,
  )
    .replace(/This piece has a verified ([a-z]+) accent you prefer\./g,
      (_, family) => "Aksen " + (families[family] ?? family) + " terverifikasi sesuai pilihan Anda.")
    .replace(/Compare its verified ([a-z]+) accent with the (.+?) you chose\./g,
      (_, family, shade) => "Bandingkan aksen " + (families[family] ?? family) + " terverifikasi dengan " + shadeName(shade) + " pilihan Anda.")
    .replace(/Compare its verified ([a-z]+) accent with (.+?) from your palette\./g,
      (_, family, shade) => "Bandingkan aksen " + (families[family] ?? family) + " terverifikasi dengan " + shadeName(shade) + " dari palet Anda.")
    .replace(/Its verified accent coordinates with the (.+?) you chose\./g,
      (_, shade) => "Aksen terverifikasi serasi dengan " + shadeName(shade) + " pilihan Anda.")
    .replace(/Its verified accent is one to compare with (.+?) from your palette\./g,
      (_, shade) => "Bandingkan aksen terverifikasi dengan " + shadeName(shade) + " dari palet Anda.");
}
