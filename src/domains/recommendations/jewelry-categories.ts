export const jewelryCategories = ["earring", "necklace", "ring", "bracelet"] as const;
export type JewelryCategory = (typeof jewelryCategories)[number];

const catalogNames = new Map<string, JewelryCategory>([
  ["earring", "earring"], ["earrings", "earring"], ["anting", "earring"], ["anting-anting", "earring"],
  ["necklace", "necklace"], ["necklaces", "necklace"], ["kalung", "necklace"],
  ["ring", "ring"], ["rings", "ring"], ["cincin", "ring"],
  ["bracelet", "bracelet"], ["bracelets", "bracelet"], ["bangle", "bracelet"], ["bangles", "bracelet"], ["gelang", "bracelet"],
]);

export function jewelryCategory(category: string) {
  return catalogNames.get(category.trim().toLowerCase());
}
