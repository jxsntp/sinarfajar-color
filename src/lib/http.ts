import { after } from "next/server";
import { recordOutcome } from "./operation-metrics";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfter?: number,
  ) {
    super(code);
  }
}
export type ApiResponse<T> =
  { data: T } | { error: { code: string; requestId: string } };
export async function endpoint<T>(
  operation: string,
  action: () => Promise<T>,
  status = 200,
) {
  const requestId = randomUUID();
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Request-ID": requestId,
  };
  const measure = (status: number) => {
    try { after(() => recordOutcome(operation, status)); } catch { /* No Next request context in direct tests. */ }
  };
  try {
    const data = await action();
    measure(status);
    return Response.json({ data } satisfies ApiResponse<T>, {
      status,
      headers,
    });
  } catch (error) {
    let failure = new HttpError(500, "internal_error");
    let databaseCode: string | undefined;
    if (error instanceof HttpError) failure = error;
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      failure = new HttpError(400, "invalid_request");
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      databaseCode = error.code;
      if (databaseCode === "P2002") failure = new HttpError(409, "conflict");
    } else if (error instanceof Prisma.PrismaClientInitializationError) {
      databaseCode = error.errorCode;
    }
    measure(failure.status);
    console.warn(
      JSON.stringify({
        requestId,
        operation,
        status: failure.status,
        code: failure.code,
        databaseCode: failure.status >= 500 ? databaseCode : undefined,
      }),
    );
    return Response.json(
      { error: { requestId, code: failure.code } } satisfies ApiResponse<never>,
      { status: failure.status, headers: { ...headers, ...(failure.retryAfter ? { "Retry-After": String(failure.retryAfter) } : {}) } },
    );
  }
}
export function bearer(req: Request) {
  const value = req.headers
    .get("authorization")
    ?.match(/^Bearer ([^\s]{1,2048})$/)?.[1];
  if (!value) throw new HttpError(401, "credential_required");
  return value;
}
export function requireOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (req.headers.get("sec-fetch-site") === "cross-site") throw new HttpError(403, "origin_denied");
  if (!origin) return;
  const target = new URL(req.url);
  const expected =
    process.env.APP_ORIGIN ??
    target.protocol + "//" + (req.headers.get("host") ?? target.host);
  if (origin !== expected) throw new HttpError(403, "origin_denied");
}
