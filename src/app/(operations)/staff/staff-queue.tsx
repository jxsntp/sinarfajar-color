"use client";
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { RetailScanner } from "@/components/retail-scanner";
import { operationError, operationsRequest } from "@/lib/operations-client";
import type { customerRequests } from "@/domains/inquiries/queue";
import { Cashier } from "./cashier";

type Queue = Awaited<ReturnType<typeof customerRequests>>;
type Request = Queue["requests"][number];
const states = {
  PENDING: "Pending",
  ACKNOWLEDGED: "Acknowledged",
  PREPARING: "Preparing",
  READY: "Ready",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};
const actions = {
  PENDING: ["ACKNOWLEDGED", "CANCELLED"],
  ACKNOWLEDGED: ["PREPARING", "READY", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
} as const;
const labels = {
  ACKNOWLEDGED: "Acknowledge",
  PREPARING: "Start preparing",
  READY: "Mark ready",
  COMPLETED: "Complete",
  CANCELLED: "Cancel",
};
const duration = (seconds: number) =>
  Math.floor(seconds / 60) + " min " + (seconds % 60) + " sec";
function ScanInput({
  id,
  sessionId,
  send,
}: {
  id?: string;
  sessionId?: string;
  send: (command: object) => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [session, setSession] = useState(sessionId ?? "");
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        await send({ action: "scan", sessionId: session, code, requestId: id });
      }}
    >
      {!sessionId && (
        <label>
          Customer session ID
          <input
            required
            value={session}
            onChange={(event) => setSession(event.target.value)}
          />
        </label>
      )}
      <label>
        Product label
        <input
          required
          value={code}
          onChange={(event) => setCode(event.target.value)}
          maxLength={128}
        />
      </label>
      <div className="controls">
        <RetailScanner label="Scan barcode or QR" onScan={setCode} />
        <Button type="submit">Confirm physical try-on</Button>
      </div>
    </form>
  );
}

export function StaffQueue({
  stores,
}: {
  stores: { id: string; name: string }[];
}) {
  const [storeId, setStore] = useState(stores[0].id);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [now, setNow] = useState(0);
  const [error, setError] = useState("");
  const [actionStatus, setActionStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await operationsRequest<Queue>(
          "/api/operations/requests?storeId=" + storeId,
          undefined,
          signal,
        );
        if (!signal?.aborted) {
          setQueue(data);
          setError("");
        }
      } catch {
        if (!signal?.aborted) setError("Queue unavailable. Retrying…");
      }
    },
    [storeId],
  );
  useEffect(() => {
    const controller = new AbortController();
    const initial = setTimeout(() => void refresh(controller.signal), 0);
    const interval = setInterval(() => {
      if (document.visibilityState === "visible")
        void refresh(controller.signal);
    }, 10000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      controller.abort();
      clearTimeout(initial);
      clearInterval(interval);
      clearInterval(clock);
    };
  }, [refresh]);
  async function send(command: object) {
    if (busy) return;
    setBusy(true);
    setActionStatus("");
    try {
      await operationsRequest("/api/operations/requests", command);
      setActionStatus("Request updated.");
    } catch (error) {
      setActionStatus(operationError(error));
    } finally {
      await refresh();
      setBusy(false);
    }
  }
  function card(request: Request) {
    const { product } = request;
    const waiting = Math.max(
      0,
      Math.floor(
        ((request.closedAt
          ? Date.parse(request.closedAt)
          : now || Date.parse(request.createdAt)) -
          Date.parse(request.createdAt)) /
          1000,
      ),
    );
    const title =
      request.channel === "later"
        ? "Later follow-up"
        : request.channel === "staff"
          ? "Staff-recorded try-on"
          : request.kind === "tryon"
            ? "Customer try-on request"
            : "Customer inquiry";
    return (
      <article key={request.id} className="ops-card">
        {product.photo && (
          <Image
            unoptimized
            src={product.photo}
            width={96}
            height={96}
            alt={product.name}
          />
        )}
        <div>
          <h3>{product.name}</h3>
          <p>
            {product.sku} · {product.location || "Cabinet location unavailable"}
          </p>
          <p>
            {title} · <strong>{states[request.state]}</strong>
          </p>
          <p>
            <time dateTime={request.createdAt}>
              {new Date(request.createdAt).toLocaleString()}
            </time>{" "}
            · Wait {duration(waiting)}
          </p>
          <p className="break-all">
            Session <code>{request.sessionId}</code>
          </p>
          {request.contactEmail && (
            <p>Follow-up email {request.contactEmail}</p>
          )}
          {request.customerConfirmed && <p>Customer confirmed the try-on.</p>}
          {request.assigned !== "open" && (
            <p>
              {request.assigned === "you"
                ? "Assigned to you"
                : "Assigned to another associate"}
            </p>
          )}
          {request.assigned !== "other" && (
            <div className="controls">
              {actions[request.state]
                .filter(
                  (state) => state !== "COMPLETED" || request.kind !== "tryon",
                )
                .map((state) => (
                  <Button
                    key={state}
                    disabled={busy}
                    onClick={() =>
                      void send({
                        action: "transition",
                        id: request.id,
                        kind: request.kind,
                        state,
                      })
                    }
                  >
                    {labels[state]}
                  </Button>
                ))}
            </div>
          )}
          {request.kind === "tryon" &&
            request.state === "READY" &&
            request.assigned === "you" && (
              <ScanInput
                id={request.id}
                sessionId={request.sessionId}
                send={send}
              />
            )}
        </div>
      </article>
    );
  }
  return (
    <div className="ops-portal">
      <label>
        Active store
        <select
          value={storeId}
          disabled={busy}
          onChange={(event) => {
            setQueue(null);
            setActionStatus("");
            setStore(event.target.value);
          }}
        >
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>
      </label>
      <Cashier key={storeId} storeId={storeId} />
      <details>
        <summary>Record a staff try-on</summary>
        <ScanInput key={storeId} send={send} />
      </details>
      <p role="status">{error || actionStatus}</p>
      {queue && (
        <>
          {queue.alerts.length > 0 && (
            <section>
              <h2>Store alerts</h2>
              <ul className="ops-alerts">
                {queue.alerts.map((alert) => (
                  <li key={alert.id}>{alert.message}</li>
                ))}
              </ul>
            </section>
          )}
          {(["in_store", "later", "staff"] as const).map((channel) => {
            const records = queue.requests.filter(
              (request) => request.channel === channel,
            );
            return (
              <section key={channel}>
                <h2>
                  {channel === "in_store"
                    ? "Store requests"
                    : channel === "later"
                      ? "Later follow-up"
                      : "Staff-recorded interactions"}
                </h2>
                {records.length ? (
                  <div className="ops-grid">{records.map(card)}</div>
                ) : (
                  <p>No requests.</p>
                )}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
