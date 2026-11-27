import { z } from "zod";
import { hueFamilies, swatchFor } from "../color-analysis/swatches";

export const componentRoles = ["metal", "stone", "enamel", "inlay", "other_accent"] as const;
export const appearances = ["chromatic", "neutral", "clear", "metallic", "unknown"] as const;
export const prominences = ["dominant", "noticeable", "minor"] as const;
export const colorSources = ["supplier_record", "store_check", "measured_sample", "approved_reference"] as const;
const key = z.string().regex(/^[a-z0-9-]{1,64}$/);
const component = z.object({
  role: z.enum(componentRoles),
  appearance: z.enum(appearances),
  label: z.string().trim().min(1).max(64).optional(),
  colorFamily: z.enum(hueFamilies).optional(),
  reference: z.object({ version: key, id: key }).strict().optional(),
  measurement: z.object({
    lab: z.tuple([z.number().min(0).max(100), z.number().min(-160).max(160), z.number().min(-160).max(160)]),
    protocol: key, whitePoint: key,
  }).strict().optional(),
  prominence: z.enum(prominences).nullish(),
  finish: z.enum(["polished", "matte", "brushed", "textured"]).optional(),
  status: z.enum(["verified", "unverified"]),
  source: z.enum(colorSources).optional(),
  sourceRef: z.string().trim().min(1).max(100).optional(),
}).strict().superRefine((value, ctx) => {
  const fail = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if (value.status === "verified" && (!value.source || !value.sourceRef))
    fail("sourceRef", "Verified color requires its source and reference.");
  const swatch = value.reference && swatchFor(value.reference.version, value.reference.id);
  if (value.reference && !swatch) fail("reference", "Unknown swatch or revision.");
  if (swatch && value.colorFamily && swatch.family !== value.colorFamily)
    fail("colorFamily", "Color family must agree with the reference swatch.");
  const family = value.colorFamily ?? swatch?.family;
  if (value.appearance === "chromatic" && family === "neutral")
    fail("colorFamily", "A chromatic accent needs a chromatic family.");
  if (value.appearance === "neutral" && family && family !== "neutral")
    fail("colorFamily", "A neutral accent must use a neutral family.");
  if (value.status === "verified" && value.appearance === "chromatic" && !family && !value.measurement)
    fail("colorFamily", "Supply a family, reference swatch or comparable measurement.");
  if (value.measurement && !["chromatic", "neutral"].includes(value.appearance))
    fail("measurement", "This appearance is not eligible for direct Lab comparison.");
});
export const visibleColorsInput = z.array(component).max(6);
export type VisibleColor = z.infer<typeof component>;
export const visibleColors = (value: unknown): VisibleColor[] => {
  const result = visibleColorsInput.safeParse(value);
  return result.success ? result.data : [];
};
export function parseColorCell(text: string) {
  try { return JSON.parse(text) as unknown; }
  catch { return text; }
}
