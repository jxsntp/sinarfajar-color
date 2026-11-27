import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { allow, type StaffScope } from "../authentication/access";
import { audit, snapshot } from "../catalog/service";
import {
  aiLimits,
  checkSettings,
  settingsSchema,
} from "../recommendations/settings";

export const experimentCommand = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      name: z.enum(["kiosk-reveal", "mobile-ranking"]),
      primaryOutcome: z.enum(["handoff", "inquiry", "product_click"]),
      minimumPerArm: z.number().int().min(10).max(100000),
      observationDays: z.number().int().min(1).max(30),
      protocol: z.string().trim().min(12).max(800),
    })
    .strict(),
  z
    .object({ action: z.enum(["start", "pause", "stop"]), id: z.uuid() })
    .strict(),
]);
export async function configureExperiment(
  scope: StaffScope,
  input: z.output<typeof experimentCommand>,
) {
  allow(scope, "lab");
  const organizationId = scope.organizationId;
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1::int AS acquired FROM pg_advisory_xact_lock(hashtextextended(${organizationId + ":experiment"}, 0))`;
    if (input.action === "create") {
      const { name, primaryOutcome, minimumPerArm, observationDays, protocol } =
        input;
      if ((name === "kiosk-reveal") !== (primaryOutcome === "handoff"))
        throw new HttpError(400, "wrong_primary_outcome");
      const prior = await tx.experiment.findFirst({
        where: { organizationId, name },
        orderBy: { version: "desc" },
      });
      if (prior && !["STOPPED", "LEGACY"].includes(prior.state))
        throw new HttpError(409, "experiment_already_configured");
      const org = await tx.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { rankingSettings: true },
      });
      const ranking = settingsSchema.parse(org.rankingSettings);
      if (name === "mobile-ranking")
        checkSettings({ ...ranking, strategy: "openrouter" });
      const plan = await tx.experiment.create({
        data: {
          organizationId,
          name,
          version: Math.max(1, prior?.version ?? 1) + 1,
          state: "DRAFT",
          primaryOutcome,
          minimumPerArm,
          observationDays,
          protocol,
          ...(name === "mobile-ranking"
            ? { rankingSnapshot: snapshot(ranking) }
            : {}),
        },
      });
      await audit(tx, scope, "experiment", "create", null, {
        id: plan.id,
        name,
        minimumPerArm,
        observationDays,
        primaryOutcome,
      });
      return plan;
    }
    const plan = await tx.experiment.findFirst({
      where: { organizationId, id: input.id },
    });
    if (!plan || plan.state === "LEGACY")
      throw new HttpError(404, "experiment_unavailable");
    const current = {
      start: ["DRAFT", "PAUSED"],
      pause: ["RUNNING"],
      stop: ["DRAFT", "RUNNING", "PAUSED"],
    };
    if (!current[input.action].includes(plan.state))
      throw new HttpError(409, "experiment_transition");
    if (input.action === "start" && plan.name === "mobile-ranking") {
      checkSettings({
        ...settingsSchema.parse(plan.rankingSnapshot),
        strategy: "openrouter",
      });
      if (
        !aiLimits().OPENROUTER_API_KEY ||
        process.env.ENABLE_MOBILE_EXPERIMENT === "false"
      )
        throw new HttpError(409, "provider_unconfigured");
    }
    const state = { start: "RUNNING", pause: "PAUSED", stop: "STOPPED" }[
      input.action
    ];
    const changed = await tx.experiment.update({
      where: { id: plan.id },
      data: {
        state,
        openedAt:
          input.action === "start" ? (plan.openedAt ?? new Date()) : undefined,
        closedAt: input.action === "stop" ? new Date() : undefined,
      },
    });
    await audit(
      tx,
      scope,
      "experiment",
      input.action,
      { id: plan.id, state: plan.state },
      { id: plan.id, state },
    );
    return changed;
  });
}
