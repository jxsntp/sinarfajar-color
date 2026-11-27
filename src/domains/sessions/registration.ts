import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { readTrial } from "../color-analysis/result";
import type { SessionScope } from "../analytics/events";
import type { Tx } from "../catalog/service";
import { reportScope } from "./service";

export const registrationInput = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().max(254).pipe(z.email()),
  phone: z.string().trim().regex(/^\+?[\d ().-]{7,30}$/)
    .transform((value) => value.replace(/[ ().-]/g, ""))
    .pipe(z.string().regex(/^\+?\d{7,15}$/)),
}).strict();

export async function isRegistered(session: SessionScope, tx: Tx = db) {
  const rows = await tx.$queryRaw<{ registered: boolean }[]>`
    SELECT true AS registered FROM "CustomerRegistration"
    WHERE "organizationId" = ${session.organizationId}::uuid AND "sessionId" = ${session.id}::uuid
  `;
  return Boolean(rows[0]?.registered);
}

export async function registerTrial(token: string, data: z.infer<typeof registrationInput>) {
  if (env().APP_ENV !== "development") throw new HttpError(403, "trial_unavailable");
  return db.$transaction(async (tx) => {
    const session = await reportScope(token, tx);
    await tx.$queryRaw`SELECT id FROM "CustomerSession" WHERE id = ${session.id}::uuid AND "organizationId" = ${session.organizationId}::uuid FOR UPDATE`;
    await reportScope(token, tx);
    const scope = { organizationId: session.organizationId, sessionId: session.id };
    const analysis = await tx.colorAnalysis.findUnique({
      where: { organizationId_sessionId: scope }, select: { paletteSnapshot: true },
    });
    if (!readTrial(analysis?.paletteSnapshot)) throw new HttpError(403, "trial_required");
    await tx.$executeRaw`
      INSERT INTO "CustomerRegistration" ("organizationId", "sessionId", "name", "email", "phone")
      VALUES (${scope.organizationId}::uuid, ${scope.sessionId}::uuid, ${data.name}, ${data.email}, ${data.phone})
      ON CONFLICT ("organizationId", "sessionId") DO NOTHING
    `;
    return { registered: true };
  });
}
