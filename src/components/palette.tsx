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
export function NamedPalette({ swatches, locale }: { swatches: PaletteSnapshot; locale: string }) {
  const copy = experience(locale);
  const lang = locale === "en-US" ? "en" : "id";
  return [false, true].map((neutral) => {
    const swatchGroup = swatches.filter((swatch) => (swatch.tone === null) === neutral);
    if (!swatchGroup.length) return null;
    return <section key={neutral ? "neutral" : "colors"}>
      <h3>{neutral ? copy.neutrals : copy.shades}</h3>
      <ul className="labeled-swatches">{swatchGroup.map(({ id, label, display }) =>
        <li key={id}><span aria-hidden style={{ background: display }} />{label[lang]}</li>)}</ul>
    </section>;
  });
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
