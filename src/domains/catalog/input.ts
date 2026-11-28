import { z } from "zod";
import { hueFamilies } from "../color-analysis/swatches";
import { visibleColorsInput } from "./visible-colors";
const label = z.string().trim().min(1).max(90);
export const tag = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .transform((v) => v.toLowerCase());
const tags = z
  .array(tag)
  .max(16)
  .default([])
  .transform((v) => [...new Set(v)].sort());
export const price = z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/);
export const productInput = z
  .object({
    sku: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/),
    barcode: z.string().trim().regex(/^[A-Za-z0-9._-]{1,64}$/).optional(),
    name: label,
    brand: label,
    manufacturer: label.optional(),
    category: tag,
    goldColor: tag,
    purity: tag,
    weightGrams: z
      .string()
      .regex(/^\d{1,7}(?:\.\d{1,3})?$/)
      .optional(),
    gemstones: z.string().trim().max(250).optional(),
    visibleColors: visibleColorsInput.optional(),
    styleTags: tags,
    occasionTags: tags,
    price,
    onHand: z.number().int().min(0).max(1000000),
    displayLocation: z.string().trim().max(100).optional(),
    photoPath: z
      .string()
      .max(250)
      .regex(/^[a-zA-Z0-9_./-]+$/)
      .optional(),
  })
  .strict();
export type ProductInput = z.output<typeof productInput>;
export const preferenceInput = z
  .object({
    category: tag.optional(),
    minBudget: price.optional(),
    maxBudget: price.optional(),
    colorPreference: z.enum(["warm", "cool", "neutral", "skip"]).optional(),
    useColorProfile: z.boolean().optional(),
    selectedSwatchVersion: z.string().regex(/^[a-z0-9-]{1,64}$/).optional(),
    selectedSwatchIds: z.array(z.string().regex(/^[a-z0-9-]{1,64}$/)).max(6)
      .transform((ids) => [...new Set(ids)].sort()).optional(),
    removedSwatchIds: z.array(z.string().regex(/^[a-z0-9-]{1,64}$/)).max(64)
      .transform((ids) => [...new Set(ids)].sort()).optional(),
    accentFamily: z.enum(hueFamilies).optional(),
    requiredGold: tag.optional(),
    requiredPurity: tag.optional(),
    requiredBrand: label.optional(),
    style: tag.optional(),
    occasion: tag.optional(),
    preferredGold: tag.optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.minBudget === undefined ||
      input.maxBudget === undefined ||
      Number(input.minBudget) <= Number(input.maxBudget),
    { path: ["maxBudget"], message: "Maximum must be at least the minimum" },
  )
  .transform((input) => ({
    ...input,
    ...(input.minBudget === undefined
      ? {}
      : { minBudget: Number(input.minBudget).toFixed(2) }),
    ...(input.maxBudget === undefined
      ? {}
      : { maxBudget: Number(input.maxBudget).toFixed(2) }),
  }));
export type Preferences = z.output<typeof preferenceInput>;
export const weightSchema = z
  .object({
    style: z.number().min(0).max(10).default(3),
    occasion: z.number().min(0).max(10).default(2),
    gold: z.number().min(0).max(10).default(3),
    budget: z.number().min(0).max(10).default(1),
    color: z.number().min(0).max(10).default(1),
    diversity: z.number().min(0).max(10).default(1),
  })
  .strict();
export const weights = weightSchema.parse({});
export type Weights = typeof weights;
