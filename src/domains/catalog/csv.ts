import { parse } from "csv-parse/sync";
import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import type { StaffScope } from "../authentication/access";
import { productInput, type ProductInput } from "./input";
import { parseColorCell } from "./visible-colors";
import { ownedStore, lockCatalog, saveProduct } from "./service";

export const columns = Object.keys(productInput.shape);
export const importInput = z
  .object({
    storeId: z.uuid(),
    csv: z.string().min(1).max(200000),
    mapping: z.record(z.string(), z.string().max(128)),
    commit: z.boolean().default(false),
  })
  .strict();
export function parseSheet(text: string, mapping: Record<string, string>) {
  let records: string[][];
  try {
    records = parse(text, {
      bom: true,
      trim: true,
      skip_empty_lines: true,
      max_record_size: 8192,
    });
  } catch {
    throw new HttpError(400, "malformed_csv");
  }
  const headers = records.shift() ?? [];
  if (
    !headers.length ||
    new Set(headers).size !== headers.length ||
    records.length > 200 ||
    !records.length
  )
    throw new HttpError(400, "invalid_csv_dimensions_or_headers");
  for (const [field, header] of Object.entries(mapping))
    if (!columns.includes(field) || !headers.includes(header))
      throw new HttpError(400, "invalid_mapping");
  const seen = new Set<string>();
  const rows = records.map((cells, i) => {
    const entry = Object.fromEntries(
      columns.map((field) => {
        const value =
          cells[headers.indexOf(mapping[field] ?? field)] || undefined;
        if (field === "visibleColors") return [field, value === undefined ? undefined : parseColorCell(value)];
        if (field === "styleTags" || field === "occasionTags")
          return [
            field,
            value
              ?.split("|")
              .map((v) => v.trim())
              .filter(Boolean) ?? [],
          ];
        return [
          field,
          field === "onHand" && value !== undefined ? Number(value) : value,
        ];
      }),
    );
    const checked = productInput.safeParse(entry);
    const errors = checked.success
      ? []
      : checked.error.issues.map(
          (issue) => issue.path.join(".") + ": " + issue.message,
        );
    const sku = typeof entry.sku === "string" ? entry.sku : "";
    if (seen.has(sku)) errors.push("Duplicate SKU in file");
    if (sku) seen.add(sku);
    return {
      row: i + 2,
      sku,
      data: checked.success ? checked.data : null,
      errors,
    };
  });
  return { headers, rows };
}
export async function importCatalog(
  scope: StaffScope,
  input: z.output<typeof importInput>,
) {
  const preview = parseSheet(input.csv, input.mapping);
  return db.$transaction(
    async (tx) => {
      await ownedStore(tx, scope, input.storeId);
      if (input.commit) await lockCatalog(tx, scope.organizationId);
      const existing = new Set(
        (
          await tx.product.findMany({
            where: {
              organizationId: scope.organizationId,
              sku: { in: preview.rows.map((r) => r.sku) },
            },
            select: { sku: true },
          })
        ).map((p) => p.sku),
      );
      for (const row of preview.rows)
        if (existing.has(row.sku)) row.errors.push("SKU already in catalog");
      const valid = preview.rows.every((r) => !r.errors.length);
      if (input.commit && valid)
        for (const row of preview.rows)
          await saveProduct(
            tx,
            scope,
            input.storeId,
            row.data as ProductInput,
            "create",
          );
      return {
        ...preview,
        valid,
        imported: input.commit && valid ? preview.rows.length : 0,
      };
    },
    { timeout: 60000 },
  );
}
