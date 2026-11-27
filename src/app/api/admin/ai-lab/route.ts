import { z } from "zod";
import { currentStaff } from "@/domains/authentication/staff";
import {
  approvedModels,
  checkSettings,
  settingsSchema,
} from "@/domains/recommendations/settings";
import { preferenceInput } from "@/domains/catalog/input";
import {
  audit,
  ownedStore,
  ProductCatalogService,
  snapshot,
} from "@/domains/catalog/service";
import {
  rulesEngine,
  validateRanking,
} from "@/domains/recommendations/engines";
import { db } from "@/lib/db";
import { endpoint, requireOrigin, HttpError } from "@/lib/http";
export const GET = () =>
  endpoint("lab.settings", async () => {
    const scope = await currentStaff("lab");
    const org = await db.organization.findUniqueOrThrow({
      where: { id: scope.organizationId },
    });
    return {
      settings: settingsSchema.parse(org.rankingSettings),
      approved: approvedModels(),
    };
  });
export const PATCH = (req: Request) =>
  endpoint("lab.configure", async () => {
    requireOrigin(req);
    const scope = await currentStaff("lab");
    const settings = settingsSchema.parse(await req.json());
    checkSettings(settings);
    if (
      settings.promptId &&
      !(await db.promptVersion.findFirst({
        where: { id: settings.promptId, organizationId: scope.organizationId },
        select: { id: true },
      }))
    )
      throw new HttpError(404, "prompt_unavailable");
    await db.$transaction(async (tx) => {
      const before = await tx.organization.findUniqueOrThrow({
        where: { id: scope.organizationId },
      });
      await tx.organization.update({
        where: { id: scope.organizationId },
        data: { rankingSettings: snapshot(settings) },
      });
      await audit(
        tx,
        scope,
        "ranking",
        "configure",
        before.rankingSettings,
        settings,
      );
    });
    return settings;
  });
export const POST = (req: Request) =>
  endpoint("lab.evaluate", async () => {
    requireOrigin(req);
    const scope = await currentStaff("lab");
    const data = z
      .object({
        storeId: z.uuid(),
        preferences: preferenceInput,
        color: z.enum(["warm", "cool", "neutral"]).nullable().default(null),
        response: z.unknown().optional(),
      })
      .strict()
      .parse(await req.json());
    const store = await ownedStore(db, scope, data.storeId);
    const candidates = await new ProductCatalogService().eligible(
      store,
      data.preferences,
    );
    const org = await db.organization.findUniqueOrThrow({
      where: { id: scope.organizationId },
    });
    const input = {
      ...data,
      candidates,
      weights: settingsSchema.parse(org.rankingSettings).weights,
    };
    if (data.response !== undefined) {
      try {
        return { items: validateRanking(data.response, input) };
      } catch {
        throw new HttpError(422, "invalid_ranking");
      }
    }
    return rulesEngine.rank(input);
  });
