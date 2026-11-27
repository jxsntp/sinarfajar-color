export async function operationsRequest<T>(
  url: string,
  body?: object,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal,
        }
      : { cache: "no-store", signal },
  );
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error.code);
  return payload.data as T;
}
const messages: Record<string, string> = {
  already_assigned: "Another associate has claimed this request.",
  request_changed: "The request changed. The queue has been refreshed.",
  invalid_transition: "That action is unavailable in the current state.",
  tryon_not_ready: "Mark the request ready before confirming the try-on.",
  assigned_matching_tryon_required:
    "Scan the SKU shown on your assigned try-on request.",
  inventory_discrepancy:
    "The scan did not match available store inventory. An alert was recorded.",
  invalid_product_label:
    "Use an SKU, catalog barcode or Sinar Fajar product QR.",
  checkout_unavailable:
    "This cashier code is expired, outside the sale window or belongs to another store.",
  transaction_already_linked:
    "This sale is already linked to a different session.",
  missing_original_sale:
    "Import or record the verified transaction before linking it.",
  duplicate_transaction_conflict:
    "An existing transaction uses this reference with different details.",
};
export function operationError(error: unknown) {
  return error instanceof Error && messages[error.message]
    ? messages[error.message]
    : "The operation could not be saved. Try again.";
}
