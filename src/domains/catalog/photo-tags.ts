import { z } from "zod";
import { hueFamilies } from "../color-analysis/swatches";
import { jewelryCategories } from "../recommendations/jewelry-categories";

export const photoMetals = ["yellow", "rose", "white", "mixed", "unknown"] as const;
export const photoShapes = ["hoop", "stud", "drop", "pendant", "chain", "band", "bangle", "cuff", "beaded", "other", "unknown"] as const;
export const photoStyles = ["minimal", "statement", "classic", "unknown"] as const;

const visualTags = {
  metal: z.enum(photoMetals),
  accents: z.array(z.enum(hueFamilies)).max(3).refine((values) => new Set(values).size === values.length),
  shape: z.enum(photoShapes),
  style: z.enum(photoStyles),
};
export const photoTagInput = z.object({ category: z.enum(jewelryCategories), ...visualTags }).strict();
export const photoProposal = z.object({
  category: z.enum([...jewelryCategories, "unknown"]),
  ...visualTags,
  needsReview: z.boolean(),
}).strict();
export type PhotoTags = z.infer<typeof photoTagInput>;
export type PhotoProposal = z.infer<typeof photoProposal>;

export const photoTagResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "jewelry_photo_tags",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["category", "metal", "accents", "shape", "style", "needsReview"],
      properties: {
        category: { type: "string", enum: [...jewelryCategories, "unknown"] },
        metal: { type: "string", enum: photoMetals },
        accents: { type: "array", items: { type: "string", enum: hueFamilies }, maxItems: 3 },
        shape: { type: "string", enum: photoShapes },
        style: { type: "string", enum: photoStyles },
        needsReview: { type: "boolean" },
      },
    },
  },
};

const label = z.string().trim().min(1).max(100);
export const photoCatalogCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("analyze"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("publish"), id: z.uuid(), label, tags: photoTagInput }).strict(),
  z.object({ action: z.literal("archive"), id: z.uuid() }).strict(),
]);
