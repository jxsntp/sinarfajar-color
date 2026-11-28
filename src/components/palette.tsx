import type { CSSProperties } from "react";
import type { PaletteSnapshot } from "@/domains/color-analysis/result";
import {
  experience,
  metalColors,
  palettes,
  type Tone,
} from "@/domains/sessions/palette";

export function Draping({ tone }: { tone: Tone }) {
  const [dark, mid, light] = palettes[tone].colors;
  return (
    <div
      className="art"
      aria-hidden
      style={
        { "--dark": dark, "--mid": mid, "--light": light } as CSSProperties
      }
    >
      <i className="ribbon a" />
      <i className="ribbon b" />
      <i className="ribbon c" />
    </div>
  );
}
export function Swatches({
  tone,
  colors,
  locale,
}: {
  tone: Tone;
  colors: string[];
  locale: string;
}) {
  const names = palettes[tone][locale === "en-US" ? "en" : "id"];
  return (
    <ul className="labeled-swatches">
      {colors.map((color, index) => (
        <li key={index}>
          <span aria-hidden style={{ backgroundColor: color }} />
          {palettes[tone].colors[index] === color ? names[index] : color}
        </li>
      ))}
    </ul>
  );
}
/** Named swatches. `featured` IDs (the customer's picks or ranked colors) are shown first and larger. */
export function NamedPalette({ swatches, locale, featured = [] }: {
  swatches: PaletteSnapshot; locale: string; featured?: readonly string[];
}) {
  const copy = experience(locale);
  const lang = locale === "en-US" ? "en" : "id";
  const chosen = new Set(featured);
  const lead = swatches.filter(({ id, tone }) => tone !== null && chosen.has(id));
  const groups = [
    { key: "featured", title: copy.featured, items: lead, large: true },
    { key: "colors", title: lead.length ? copy.moreShades : copy.shades,
      items: swatches.filter(({ id, tone }) => tone !== null && !chosen.has(id)), large: false },
    { key: "neutral", title: copy.neutrals, items: swatches.filter(({ tone }) => tone === null), large: false },
  ];
  return groups.map(({ key, title, items, large }) => items.length ? (
    <section key={key}>
      <h3>{title}</h3>
      <ul className={"labeled-swatches" + (large ? " featured" : "")}>{items.map(({ id, label, display }) =>
        <li key={id}><span aria-hidden style={{ background: display }} />{label[lang]}</li>)}</ul>
    </section>
  ) : null);
}
export function Gold({ locale, suggested }: { locale: string; suggested?: "yellow" | "rose" | "white" }) {
  const text = experience(locale);
  return (
    <section className="metals">
      <h3>{suggested ? text.suggestedGold : text.jewelry}</h3>
      <ul className="labeled-swatches">
        {metalColors.flatMap((color, index) => suggested && ["yellow", "rose", "white"][index] !== suggested ? [] : (
          <li key={color}>
            <span aria-hidden style={{ backgroundColor: color }} />
            {text.metals[index]}
          </li>
        ))}
      </ul>
    </section>
  );
}
/** An arch of vertical color bands built from the customer's palette, picks first. */
export function PaletteArch({ colors }: { colors: readonly string[] }) {
  const bands = colors.slice(0, 7);
  if (!bands.length) return null;
  return (
    <div className="palette-arch" aria-hidden>
      {bands.map((color, index) => <i key={color + index} style={{ background: color }} />)}
    </div>
  );
}
