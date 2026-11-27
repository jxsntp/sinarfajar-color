type Reference = { runId: string; sku: string; rank: number } | { runId: string };
type Entry = {
  id: string;
  bucket: string;
  sessionId?: string;
  body: string;
  created: number;
};
const maxAge = 86400000;
const maxEntries = 250;
async function queueTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("inaura-events", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("pending", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction("pending", mode);
      const request = operation(transaction.objectStore("pending"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}
async function mobileBucket(token: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
async function deliver(entry: Entry, credential?: string) {
  try {
    const endpoint = credential ? "/api/events" : "/api/kiosk/events";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(credential && { Authorization: "Bearer " + credential }),
      },
      body: entry.body,
      keepalive: true,
      signal: AbortSignal.timeout(5000),
    });
    if (
      response.ok ||
      (response.status >= 400 &&
        response.status < 500 &&
        response.status !== 429)
    ) {
      await queueTransaction("readwrite", (store) =>
        store.delete(entry.id),
      ).catch(() => {});
    }
    return response;
  } catch {
    return undefined;
  }
}
export async function recoverEvents(reportToken?: string) {
  try {
    const bucket = reportToken ? await mobileBucket(reportToken) : "kiosk";
    const entries = (await queueTransaction("readonly", (store) =>
      store.getAll(),
    )) as Entry[];
    entries.sort((a, b) => b.created - a.created);
    const valid: Entry[] = [];
    for (const entry of entries) {
      if (Date.now() - entry.created > maxAge || valid.length >= maxEntries)
        await queueTransaction("readwrite", (store) => store.delete(entry.id));
      else valid.push(entry);
    }
    for (const entry of valid.reverse()) {
      if (entry.bucket !== bucket) continue;
      const response = await deliver(entry, reportToken);
      if (!response || response.status === 429 || response.status >= 500) break;
    }
  } catch {
    /* IndexedDB is optional for browsers that block storage. */
  }
}
export async function clearReportEvents(token: string) {
  const bucket = await mobileBucket(token);
  const entries = (await queueTransaction("readonly", (store) => store.getAll())) as Entry[];
  for (const entry of entries)
    if (entry.bucket === bucket) await queueTransaction("readwrite", (store) => store.delete(entry.id));
}

export async function visibleEvent(
  credential: string,
  name: string,
  reference?: Reference,
  sessionId?: string,
) {
  const id = crypto.randomUUID();
  const created = Date.now();
  const event = {
    id,
    name,
    occurredAt: new Date(created).toISOString(),
    ...reference,
  };
  // A shared kiosk uses its existing HTTP-only device cookie. The outbox never stores a bearer.
  const useDevice = Boolean(sessionId);
  let bucket = "kiosk";
  if (!useDevice) {
    try {
      bucket = await mobileBucket(credential);
    } catch {
      bucket = "";
    }
  }
  const entry = {
    id,
    bucket,
    sessionId,
    created,
    body: JSON.stringify({ sessionId, event }),
  };
  if (bucket) {
    await queueTransaction("readwrite", (store) => {
      const items = store.getAll();
      items.onsuccess = () => {
        const entries = (items.result as Entry[]).sort((a, b) => a.created - b.created);
        const overflow = Math.max(0, entries.length - maxEntries + 1);
        for (const old of entries.slice(0, overflow)) store.delete(old.id);
        store.put(entry);
      };
      return items;
    }).catch(() => {});
  }
  const response = await deliver(entry, useDevice ? undefined : credential);
  if (response?.ok) void recoverEvents(useDevice ? undefined : credential);
  return response;
}
