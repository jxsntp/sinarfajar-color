import { db } from "./db";

const tracked = new Set([
  "kiosk.start", "kiosk.report", "mobile.activate", "discovery.read",
  "events.ingest", "kiosk.events", "pos.operation", "jobs.execute",
]);

export async function recordOutcome(operation: string, status: number) {
  if (!tracked.has(operation) || (status >= 400 && status < 500 && status !== 429)) return;
  const outcome = status >= 500 ? "failure" : status === 429 ? "throttled" : "success";
  const minute = new Date(Math.floor(Date.now() / 60000) * 60000);
  try {
    await db.$executeRaw`
      INSERT INTO "OperationMinute" (operation, minute, outcome, count) VALUES (${operation}, ${minute}, ${outcome}, 1)
      ON CONFLICT (operation, minute, outcome) DO UPDATE SET count = "OperationMinute".count + 1`;
  } catch {
    // Health checks and sanitized endpoint logs remain available if the database is down.
  }
}
