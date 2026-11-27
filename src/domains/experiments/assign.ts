import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { SessionScope } from "../analytics/events";

export type ExperimentName = "kiosk-reveal" | "mobile-ranking";
export async function experimentPlan(
  tx: Prisma.TransactionClient,
  organizationId: string,
  name: ExperimentName,
) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Experiment" WHERE "organizationId"=${organizationId}::uuid AND name=${name} AND state<>'LEGACY'
    ORDER BY version DESC LIMIT 1 FOR SHARE`;
  return rows.length
    ? tx.experiment.findFirst({ where: { id: rows[0].id, organizationId } })
    : null;
}
export async function mobileAssignment(
  tx: Prisma.TransactionClient,
  session: SessionScope,
) {
  return tx.experimentAssignment.findFirst({
    where: {
      organizationId: session.organizationId,
      sessionId: session.id,
      experiment: { name: "mobile-ranking" },
    },
    orderBy: { createdAt: "desc" },
    include: { experiment: true },
  });
}
export async function assignExperiment(
  tx: Prisma.TransactionClient,
  session: SessionScope,
  name: ExperimentName,
  legacyVariants: readonly [string, string],
) {
  const plan = await experimentPlan(tx, session.organizationId, name);
  if (plan && plan.state !== "RUNNING") return null;
  const experimentKey = {
    organizationId: session.organizationId,
    name,
    version: 1,
  };
  const experiment =
    plan ??
    (await tx.experiment.upsert({
      where: { organizationId_name_version: experimentKey },
      create: experimentKey,
      update: {},
    }));
  const key = {
    organizationId: session.organizationId,
    sessionId: session.id,
    experimentId: experiment.id,
  };
  const variants =
    plan && name === "mobile-ranking" ? ["B", "C"] : legacyVariants;
  return tx.experimentAssignment.upsert({
    where: { organizationId_sessionId_experimentId: key },
    create: { ...key, variant: variants[randomInt(2)] },
    update: {},
    include: { experiment: true },
  });
}
