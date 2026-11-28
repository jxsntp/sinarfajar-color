"use client";
import type { CSSProperties } from "react";

/** One side of a comparison: a drape color or a metal. */
export type DrapeOption = { id: string; name: string; note?: string; display: string };

/** Two large drape previews side by side. Each preview is a button that chooses that drape. */
export function DrapeHero({ options, step, onChoose }: {
  options: readonly DrapeOption[];
  /** Changes on every comparison so the previews animate in. */
  step: number;
  onChoose: (option: DrapeOption) => void;
}) {
  return (
    <div className="drape-hero" key={step}>
      {options.map((option) => (
        <button key={option.id} className="drape-panel" onClick={() => onChoose(option)}
          style={{ "--drape": option.display } as CSSProperties}>
          <svg viewBox="0 0 200 240" aria-hidden className="drape-figure">
            <ellipse cx="100" cy="88" rx="38" ry="48" className="drape-face" />
            <path d="M84 128 L84 150 L116 150 L116 128" className="drape-face" />
            <path d="M0 240 L0 190 Q18 150 100 146 Q182 150 200 190 L200 240 Z" className="drape-cloth" />
          </svg>
          <span className="drape-name">{option.name}</span>
          {option.note && <small>{option.note}</small>}
        </button>
      ))}
    </div>
  );
}
