import Image from "next/image";
import { mobileText } from "@/domains/sessions/mobile-copy";
import { jewelryCategories } from "@/domains/recommendations/jewelry-categories";
import type { readPhotoPicks } from "@/domains/recommendations/photo-picks";

type Item = Awaited<ReturnType<typeof readPhotoPicks>>[number];

const metalNames = {
  en: { yellow: "yellow-toned", rose: "rose-toned", white: "white-toned", mixed: "mixed-tone", unknown: "" },
  id: { yellow: "kuning", rose: "merah muda", white: "putih", mixed: "campuran", unknown: "" },
};
const shapes = {
  hoop: ["hoop", "lingkaran"], stud: ["stud", "stud"], drop: ["drop", "menjuntai"],
  pendant: ["pendant", "liontin"], chain: ["chain", "rantai"], band: ["band", "pita"],
  bangle: ["bangle", "gelang kaku"], cuff: ["cuff", "gelang terbuka"], beaded: ["beaded", "manik-manik"],
  other: ["", ""], unknown: ["", ""],
} as const;
const styleNames = { minimal: ["minimal", "minimalis"], statement: ["bold", "mencolok"], classic: ["classic", "klasik"], unknown: ["", ""] } as const;
const accentNames = { red: "merah", yellow: "kuning", green: "hijau", blue: "biru", violet: "ungu", neutral: "netral" } as const;

function photoReason(item: Item, english: boolean) {
  const metal = metalNames[english ? "en" : "id"][item.metal];
  const finish = english ? "The " + metal + " finish matches your suggested metal color."
    : "Tampilan logam berwarna " + metal + " selaras dengan saran warna logam Anda.";
  const accent = item.accent;
  const accentReason = accent ? english
    ? "Its " + accent.family + " accent pairs with " + accent.shade.en.toLowerCase() + " in your palette."
    : "Aksen " + accentNames[accent.family] + " serasi dengan " + accent.shade.id.toLowerCase() + " dalam palet Anda." : "";
  if (item.reason === "both") return finish + " " + accentReason;
  if (item.reason === "metal") return finish;
  if (item.reason === "accent") return accentReason;
  const shape = shapes[item.shape][english ? 0 : 1];
  const style = styleNames[item.style][english ? 0 : 1];
  if (shape) return english ? "Explore this " + shape + " design with your palette."
    : "Padukan desain " + shape + " ini dengan palet Anda.";
  if (style) return english ? "Explore this " + style + " style with your palette."
    : "Padukan gaya " + style + " ini dengan palet Anda.";
  return english ? "A design to compare with your palette." : "Pilihan desain untuk dipadukan dengan palet Anda.";
}

export function PhotoPickCards({ items, locale, token }: { items: Item[]; locale: string; token: string }) {
  const english = locale === "en-US";
  const text = mobileText(locale);
  return (
    <>
      <p>{english ? "Selected for visual style. Ask the store to confirm price, specifications and availability."
        : "Dipilih berdasarkan tampilan. Tanyakan harga, spesifikasi, dan ketersediaan kepada toko."}</p>
      {jewelryCategories.map((category) => {
        const item = items.find((value) => value.category === category);
        return <section key={category}>
          <h3>{text.jewelryCategories[category]}</h3>
          {item ? <article className="jewel">
            <Image unoptimized src={"/results/" + encodeURIComponent(token) + "/photos/" + item.id}
              alt={item.label} width={420} height={300} />
            <h4>{item.label}</h4>
            <p>{photoReason(item, english)}</p>
          </article> : <p>{english ? "No approved photo in this category yet." : "Belum ada foto yang disetujui dalam kategori ini."}</p>}
        </section>;
      })}
    </>
  );
}
