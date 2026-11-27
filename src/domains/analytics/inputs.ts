import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { audit } from "../catalog/service";
import type { StaffScope } from "../authentication/access";
import { operationStore } from "../operations/store";
import { dayStart } from "./report";

const money = z.string().regex(/^-?\d{1,14}(?:\.\d{1,2})?$/);
const cost = money.refine((value) => !value.startsWith("-"));
const citation = z.string().trim().min(4).max(120);
const timestamp = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value));
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const inputCommand = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("campaign"),
      storeId: z.uuid(),
      label: z.string().trim().min(3).max(80),
      startsAt: timestamp,
      endsAt: timestamp,
    })
    .strict(),
  z
    .object({
      action: z.literal("daily"),
      storeId: z.uuid(),
      day: z.iso.date(),
      campaignId: z.uuid().optional(),
      visitors: z.number().int().nonnegative().max(10000000).nullable(),
      verifiedContent: z.number().int().nonnegative().max(100000).nullable(),
      sourceRef: citation,
    })
    .strict(),
  z
    .object({
      action: z.literal("financial"),
      storeId: z.uuid(),
      month,
      initialInvestment: cost,
      softwareCost: cost,
      inferenceCost: cost,
      operationsCost: cost,
      grossProfit: money,
      controlGrossProfit: money.nullable(),
      sourceRef: citation,
      controlRef: citation.optional(),
    })
    .strict(),
]);
export async function saveAnalyticsInput(
  staff: StaffScope,
  input: z.output<typeof inputCommand>,
) {
  const scope = await operationStore(staff, input.storeId, true);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1::int AS acquired FROM pg_advisory_xact_lock(hashtextextended(${scope.storeId + ":analytics"},0))`;
    if (input.action === "campaign") {
      if (input.endsAt <= input.startsAt)
        throw new HttpError(400, "invalid_campaign_range");
      const overlap = await tx.analyticsCampaign.findFirst({
        where: {
          ...scope,
          startsAt: { lt: input.endsAt },
          endsAt: { gt: input.startsAt },
        },
        select: { id: true },
      });
      if (overlap) throw new HttpError(409, "campaign_overlap");
      const campaign = await tx.analyticsCampaign.create({
        data: {
          ...scope,
          label: input.label,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        },
      });
      await audit(tx, staff, "analytics", "campaign", null, {
        id: campaign.id,
        storeId: scope.storeId,
      });
      return { id: campaign.id };
    }
    if (input.action === "daily") {
      const { day, campaignId, visitors, verifiedContent, sourceRef } = input;
      if (campaignId) {
        const at = dayStart(day);
        if (
          !(await tx.analyticsCampaign.findFirst({
            where: {
              ...scope,
              id: campaignId,
              startsAt: { lt: new Date(at.getTime() + 86400000) },
              endsAt: { gt: at },
            },
            select: { id: true },
          }))
        )
          throw new HttpError(404, "campaign_unavailable");
      }
      const key = { ...scope, day, cohort: campaignId ?? "ongoing" };
      const data = { visitors, verifiedContent, sourceRef };
      const row = await tx.analyticsDaily.upsert({
        where: { organizationId_storeId_day_cohort: key },
        create: { ...key, campaignId, ...data },
        update: data,
      });
      await audit(tx, staff, "analytics", "daily", null, {
        id: row.id,
        storeId: scope.storeId,
        day,
        sourceRef,
      });
      return { id: row.id };
    }
    const {
      month,
      initialInvestment,
      softwareCost,
      inferenceCost,
      operationsCost,
      grossProfit,
      controlGrossProfit,
      sourceRef,
      controlRef,
    } = input;
    if (controlGrossProfit !== null && !controlRef)
      throw new HttpError(400, "control_reference_required");
    const key = { ...scope, month };
    const data = {
      initialInvestment,
      softwareCost,
      inferenceCost,
      operationsCost,
      grossProfit,
      controlGrossProfit,
      sourceRef,
      controlRef: controlRef ?? null,
    };
    const row = await tx.financialPeriod.upsert({
      where: { organizationId_storeId_month: key },
      create: { ...key, ...data },
      update: data,
    });
    await audit(tx, staff, "analytics", "financial", null, {
      id: row.id,
      storeId: scope.storeId,
      month,
      sourceRef,
      controlRef,
    });
    return { id: row.id };
  });
}
export function financialResult(row: {
  initialInvestment: Prisma.Decimal;
  softwareCost: Prisma.Decimal;
  inferenceCost: Prisma.Decimal;
  operationsCost: Prisma.Decimal;
  grossProfit: Prisma.Decimal;
  controlGrossProfit: Prisma.Decimal | null;
  controlRef: string | null;
}) {
  const operatingCost = row.softwareCost
    .plus(row.inferenceCost)
    .plus(row.operationsCost);
  const contribution =
    row.controlGrossProfit !== null && row.controlRef
      ? row.grossProfit.minus(row.controlGrossProfit).minus(operatingCost)
      : null;
  const hasInvestment = row.initialInvestment.gt(0);
  return {
    operatingCost: operatingCost.toFixed(2),
    contribution: contribution?.toFixed(2) ?? null,
    payback:
      contribution?.gt(0) && hasInvestment
        ? row.initialInvestment.div(contribution).toDecimalPlaces(2).toNumber()
        : null,
    annualizedRoi:
      contribution && hasInvestment
        ? contribution
            .mul(12)
            .minus(row.initialInvestment)
            .div(row.initialInvestment)
            .toNumber()
        : null,
  };
}
export async function financeReport(staff: StaffScope, storeId: string) {
  const scope = await operationStore(staff, storeId, true);
  const records = await db.financialPeriod.findMany({
    where: scope,
    orderBy: { month: "desc" },
    take: 24,
  });
  return records.map((row) => ({
    month: row.month,
    source: row.sourceRef,
    control: row.controlRef,
    grossProfit: row.grossProfit.toFixed(2),
    investment: row.initialInvestment.toFixed(2),
    software: row.softwareCost.toFixed(2),
    inference: row.inferenceCost.toFixed(2),
    operations: row.operationsCost.toFixed(2),
    ...financialResult(row),
  }));
}
