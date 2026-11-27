"use client";
import { useState } from "react";
import { hueFamilies, paletteVersion, swatchesFor } from "@/domains/color-analysis/swatches";
import { appearances, colorSources, componentRoles, prominences, type VisibleColor } from "@/domains/catalog/visible-colors";
const references = swatchesFor(paletteVersion) ?? [];

export function ColorFields({ initial }: { initial: VisibleColor[] }) {
  const [rows, setRows] = useState(initial.map((value, index) => ({ key: index, value })));
  const update = (key: number, patch: Partial<VisibleColor>) =>
    setRows((previous) => previous.map((row) => row.key === key ? { ...row, value: { ...row.value, ...patch } } : row));
  return <details>
    <summary>Visible product colors</summary>
    <input type="hidden" name="visibleColors" value={JSON.stringify(rows.map(({ value }) => value))} />
    {rows.map(({ key, value }, index) => <fieldset key={key}>
      <legend>Component {index + 1}</legend>
      <div className="form-grid">
        <label>Material role <select value={value.role} onChange={(event) => update(key, { role: event.target.value as VisibleColor["role"] })}>
          {componentRoles.map((role) => <option key={role}>{role}</option>)}
        </select></label>
        <label>Appearance <select value={value.appearance} onChange={(event) => update(key, { appearance: event.target.value as VisibleColor["appearance"] })}>
          {appearances.map((appearance) => <option key={appearance}>{appearance}</option>)}
        </select></label>
        <label>Color label <input maxLength={64} value={value.label ?? ""} onChange={(event) => update(key, { label: event.target.value || undefined })}/></label>
        <label>Color family <select value={value.colorFamily ?? ""} onChange={(event) => update(key, { colorFamily: (event.target.value || undefined) as VisibleColor["colorFamily"] })}>
          <option value="">Unspecified</option>{hueFamilies.map((family) => <option key={family}>{family}</option>)}
        </select></label>
        <label>Reference swatch <select value={value.reference?.id ?? ""} onChange={(event) => update(key, {
          reference: event.target.value ? { id: event.target.value, version: paletteVersion } : undefined,
        })}>
          <option value="">Unspecified</option>{references.map((swatch) => <option key={swatch.id} value={swatch.id}>{swatch.label.en}</option>)}
        </select></label>
        <label>Prominence <select value={value.prominence ?? ""} onChange={(event) => update(key, { prominence: (event.target.value || undefined) as VisibleColor["prominence"] })}>
          <option value="">Unspecified</option>{prominences.map((prominence) => <option key={prominence}>{prominence}</option>)}
        </select></label>
        <label>Verification <select value={value.status} onChange={(event) => update(key, { status: event.target.value as VisibleColor["status"] })}>
          <option value="unverified">Unverified</option><option value="verified">Verified</option>
        </select></label>
        <label>Verification source <select value={value.source ?? ""} onChange={(event) => update(key, { source: (event.target.value || undefined) as VisibleColor["source"] })}>
          <option value="">Unspecified</option>{colorSources.map((source) => <option key={source}>{source}</option>)}
        </select></label>
        <label>Source record <input maxLength={100} value={value.sourceRef ?? ""} onChange={(event) => update(key, { sourceRef: event.target.value || undefined })}/></label>
      </div>
      <button type="button" className="text-button" onClick={() => setRows((old) => old.filter((row) => row.key !== key))}>Remove component</button>
    </fieldset>)}
    <button type="button" className="text-button" disabled={rows.length >= 6} onClick={() => setRows((previous) => [
      ...previous, { key: (previous.at(-1)?.key ?? -1) + 1, value: { role: "stone", appearance: "chromatic", status: "unverified" } },
    ])}>Add color component</button>
  </details>;
}
