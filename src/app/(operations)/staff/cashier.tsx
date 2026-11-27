"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RetailScanner } from "@/components/retail-scanner";
import { operationsRequest, operationError } from "@/lib/operations-client";

export function Cashier({ storeId }: { storeId: string }) {
  const [reference, setReference] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <details>
      <summary>Link a cashier code</summary>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setStatus("");
          try {
            await operationsRequest("/api/operations/pos", {
              storeId,
              command: {
                type: "link",
                externalRef: reference,
                checkoutCode: code,
              },
            });
            setStatus("Transaction linked.");
            setCode("");
            setReference("");
          } catch (error) {
            setStatus(operationError(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Verified transaction reference
          <input
            required
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            maxLength={100}
          />
        </label>
        <label>
          Cashier code
          <input
            required
            value={code}
            autoComplete="off"
            onChange={(event) => setCode(event.target.value)}
            maxLength={52}
          />
        </label>
        <div className="controls">
          <RetailScanner label="Scan cashier QR" onScan={setCode} />
          <Button type="submit" disabled={busy}>
            Link transaction
          </Button>
        </div>
        <p role="status">{status}</p>
      </form>
    </details>
  );
}
