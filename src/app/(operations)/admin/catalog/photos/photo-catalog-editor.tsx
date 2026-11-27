"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { hueFamilies } from "@/domains/color-analysis/swatches";
import {
  photoMetals, photoProposal, photoShapes, photoStyles, photoTagInput,
} from "@/domains/catalog/photo-tags";
import type { photoCatalogRow } from "@/domains/catalog/photo-catalog";
import { jewelryCategories } from "@/domains/recommendations/jewelry-categories";

type Row = ReturnType<typeof photoCatalogRow>;
const endpoint = "/api/admin/catalog/photos";

async function savePhoto(options: RequestInit): Promise<Row> {
  const response = await fetch(endpoint, options);
  const json = await response.json();
  if (!response.ok) throw new Error(json.error?.code ?? "request_failed");
  return json.data;
}

function updatePhoto(id: string, command: Record<string, unknown>) {
  return savePhoto({
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...command, id }),
  });
}

function TagChoice({ label, name, value, options }: {
  label: string; name: string; value: string; options: readonly string[];
}) {
  return (
    <label>{label}
      <select name={name} defaultValue={value} required>
        {!options.includes(value) && <option value="">Choose {label.toLowerCase()}</option>}
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function Review({ initial, vision }: { initial: Row; vision: boolean }) {
  const [row, setRow] = useState(initial);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [useProposal, setUseProposal] = useState(false);
  const proposal = photoProposal.safeParse(row.proposal).data;
  const approved = photoTagInput.safeParse(row.tags).data;
  const tags = (useProposal ? proposal : approved) ?? proposal;
  const router = useRouter();
  if (row.state === "ARCHIVED") return null;

  async function update(command: Record<string, unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await updatePhoto(row.id, command);
      setRow(result);
      setUseProposal(command.action === "analyze");
      setNotice(success);
      if (command.action !== "analyze") router.refresh();
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setNotice(code === "photo_analysis_in_progress" ? "This photo is already being analyzed."
        : "The photo could not be updated. You can retry or enter tags manually.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="jewel">
      <Image src={row.url} unoptimized alt={row.label} width={420} height={300} />
      <h3>{row.label}</h3>
      <p>{row.state === "PUBLISHED" ? "Published" : "Draft"}</p>
      {vision && !proposal && <button className="text-button" type="button" disabled={busy}
        onClick={() => void update({ action: "analyze" }, "AI tags are ready for review.")}>
        Suggest tags with AI
      </button>}
      {proposal && <p>{proposal.needsReview ? "The model flagged this image for closer review." : "AI tags are available."}</p>}
      {approved && proposal && !useProposal &&
        <button className="text-button" type="button" onClick={() => setUseProposal(true)} disabled={busy}>
          Use AI suggestions
        </button>}
      <form key={JSON.stringify([row.label, tags])} onSubmit={(event) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        const data = photoTagInput.safeParse({
          category: values.get("category"), metal: values.get("metal"), shape: values.get("shape"),
          style: values.get("style"), accents: values.getAll("accent"),
        });
        if (!data.success) {
          setNotice("Choose a category and up to three accent colors.");
          return;
        }
        void update({ action: "publish", label: values.get("label"), tags: data.data }, "Photo published.");
      }}>
        <div className="form-grid">
          <label>Photo label<input name="label" defaultValue={row.label} required maxLength={100} /></label>
          <TagChoice name="category" label="Jewelry category" value={tags?.category ?? ""} options={jewelryCategories} />
          <TagChoice name="metal" label="Apparent metal color" value={tags?.metal ?? "unknown"} options={photoMetals} />
          <TagChoice name="shape" label="Design shape" value={tags?.shape ?? "unknown"} options={photoShapes} />
          <TagChoice name="style" label="Style" value={tags?.style ?? "unknown"} options={photoStyles} />
        </div>
        <fieldset>
          <legend>Visible accent colors (up to three)</legend>
          <div className="form-grid">
            {hueFamilies.map((family) => <label className="inline-option" key={family}>
              <input type="checkbox" name="accent" value={family} defaultChecked={tags?.accents.includes(family)} />
              {family}
            </label>)}
          </div>
        </fieldset>
        <button className="action" type="submit" disabled={busy}>{row.state === "PUBLISHED" ? "Update visual tags" : "Publish photo"}</button>
      </form>
      <button className="text-button" type="button" disabled={busy}
        onClick={() => void update({ action: "archive" }, "Photo archived.")}>Archive photo</button>
      <p role="status">{notice}</p>
    </article>
  );
}

export function PhotoCatalogEditor({ storeId, rows, vision }: {
  storeId: string; rows: Row[]; vision: boolean;
}) {
  const router = useRouter();
  const [newRows, setNewRows] = useState<Row[]>([]);
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState(false);
  const current = [...newRows.filter((row) => !rows.some(({ id }) => id === row.id)), ...rows];

  return (
    <>
      <form className="controls" onSubmit={async (event) => {
        event.preventDefault();
        if (uploading) return;
        const form = event.currentTarget;
        const input = form.elements.namedItem("photos") as HTMLInputElement;
        const files = Array.from(input.files ?? []);
        const suggest = vision && new FormData(form).has("suggest");
        if (!files.length || files.length > 12) {
          setNotice("Select between one and twelve photos.");
          return;
        }
        setUploading(true);
        setNotice("Uploading photos…");
        const failures: string[] = [];
        const tagFailures: string[] = [];
        for (const file of files) {
          const body = new FormData();
          body.append("storeId", storeId);
          body.append("file", file);
          try {
            let row = await savePhoto({ method: "POST", body });
            if (suggest) {
              try {
                row = await updatePhoto(row.id, { action: "analyze" });
              } catch {
                tagFailures.push(file.name);
              }
            }
            const latest = row;
            setNewRows((known) => [latest, ...known]);
          } catch {
            failures.push(file.name);
          }
        }
        const messages = [];
        if (failures.length) messages.push("Upload failed for " + failures.join(", ") + ".");
        if (tagFailures.length) messages.push("Add or retry tags for " + tagFailures.join(", ") + ".");
        setNotice(messages.join(" ") || "Photos are ready for review.");
        form.reset();
        setUploading(false);
        router.refresh();
      }}>
        <label>Catalog photos
          <input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple required disabled={uploading} />
        </label>
        {vision && <label className="inline-option">
          <input name="suggest" type="checkbox" defaultChecked disabled={uploading} />
          Suggest visual tags with AI
        </label>}
        <button className="action" type="submit" disabled={uploading}>Upload catalog photos</button>
      </form>
      <p>Use one jewelry design per photo. JPG, PNG or WebP, up to 4 MB per image.</p>
      {!vision && <p>AI tagging is unavailable. You can review and publish photos with manual tags.</p>}
      <p role="status">{notice}</p>
      {current.length ? <div className="grid gap-6 sm:grid-cols-2">
        {current.map((row) => <Review key={row.id} initial={row} vision={vision} />)}
      </div> : <p>No catalog photos for this store yet.</p>}
    </>
  );
}
