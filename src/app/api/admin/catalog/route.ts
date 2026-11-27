import { z } from "zod";
import { currentStaff } from "@/domains/authentication/staff";
import {
  archiveProduct,
  savePartner,
  saveProduct,
} from "@/domains/catalog/service";
import { productInput } from "@/domains/catalog/input";
import { db } from "@/lib/db";
import { endpoint, requireOrigin } from "@/lib/http";
const command = z.discriminatedUnion("action", [
  z
    .object({
      action: z.enum(["create", "edit"]),
      storeId: z.uuid(),
      product: productInput,
    })
    .strict(),
  z
    .object({ action: z.literal("archive"), sku: z.string().min(1).max(64) })
    .strict(),
  z
    .object({
      action: z.literal("partner"),
      kind: z.enum(["brand", "manufacturer"]),
      id: z.uuid().optional(),
      name: z.string().trim().min(1).max(90),
    })
    .strict(),
]);
export const POST = (req: Request) =>
  endpoint("catalog.change", async () => {
    requireOrigin(req);
    const scope = await currentStaff("admin");
    const input = command.parse(await req.json());
    if (input.action === "archive") return archiveProduct(scope, input.sku);
    if (input.action === "partner")
      return savePartner(scope, input.kind, input.name, input.id);
    return db.$transaction((tx) =>
      saveProduct(tx, scope, input.storeId, input.product, input.action),
    );
  });
