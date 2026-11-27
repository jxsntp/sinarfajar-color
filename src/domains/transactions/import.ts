import { parse } from "csv-parse/sync";
import { HttpError } from "@/lib/http";
import type { StoreScope } from "../catalog/service";
import { csvPOSAdapter, posCommand, runPOS } from "./adapter";

type ImportRow = Record<string, string>;
export async function importTransactions(
  scope: StoreScope,
  csv: string,
  commit: boolean,
) {
  let rows: ImportRow[];
  let headers: string[] = [];
  try {
    rows = parse(csv, {
      columns: (values: string[]) => {
        headers = values;
        if (new Set(values).size !== values.length) throw new Error();
        return values;
      },
      bom: true,
      trim: true,
      skip_empty_lines: true,
      max_record_size: 4000,
    });
  } catch {
    throw new HttpError(400, "invalid_sales_csv");
  }
  if (
    rows.length < 1 ||
    rows.length > 1000 ||
    !["type", "externalRef", "occurredAt"].every((column) =>
      headers.includes(column),
    )
  )
    throw new HttpError(400, "invalid_sales_csv");

  const groups = new Map<string, { row: number; values: ImportRow[] }>();
  for (const [index, row] of rows.entries()) {
    const key = JSON.stringify([
      row.type,
      row.externalRef,
      row.adjustmentRef || "",
    ]);
    const batch = groups.get(key);
    if (batch) batch.values.push(row);
    else groups.set(key, { row: index + 2, values: [row] });
  }
  const results: { row: number; externalRef?: string; outcome: string }[] = [];
  for (const group of groups.values()) {
    const [first] = group.values;
    const base = { type: first.type, externalRef: first.externalRef };
    const sale = first.type === "sale";
    if (
      !["sale", "refund", "cancel"].includes(first.type) ||
      (!sale && group.values.length !== 1) ||
      group.values.some((row) =>
        ["occurredAt", "total", "currency", "checkoutCode"].some(
          (column) => row[column] !== first[column],
        ),
      )
    ) {
      results.push({ row: group.row, outcome: "invalid_transaction_group" });
      continue;
    }
    const input = posCommand.safeParse(
      sale
        ? {
            ...base,
            soldAt: first.occurredAt,
            total: first.total,
            currency: first.currency,
            checkoutCode: first.checkoutCode || undefined,
            lines: group.values.map((row) => ({
              sku: row.sku,
              quantity: Number(row.quantity),
              unitPrice: row.unitPrice,
            })),
          }
        : {
            ...base,
            adjustmentRef: first.adjustmentRef,
            occurredAt: first.occurredAt,
            amount: first.amount || undefined,
          },
    );
    if (!input.success) {
      results.push({ row: group.row, outcome: "invalid_transaction_fields" });
      continue;
    }
    if (!commit) {
      results.push({
        row: group.row,
        externalRef: first.externalRef,
        outcome: "parsed",
      });
      continue;
    }
    try {
      const result = await runPOS(csvPOSAdapter, scope, input.data);
      results.push({
        row: group.row,
        externalRef: first.externalRef,
        outcome:
          result && "duplicate" in result && result.duplicate
            ? "duplicate"
            : "recorded",
      });
    } catch (error) {
      results.push({
        row: group.row,
        externalRef: first.externalRef,
        outcome: error instanceof HttpError ? error.code : "import_failed",
      });
    }
  }
  return results;
}
