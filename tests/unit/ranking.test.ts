import { expect, it } from "vitest";
import { weights } from "@/domains/catalog/input";
import {
  rulesEngine,
  validateRanking,
  type RankingInput,
} from "@/domains/recommendations/engines";
import { parseSheet } from "@/domains/catalog/csv";
import { photoType } from "@/domains/catalog/photo";

const piece = {
  id: "private-id",
  name: "Ring",
  sku: "S1",
  category: "ring",
  brand: "A",
  goldColor: "yellow",
  purity: "18K",
  price: "100.00",
  currency: "IDR",
  weightGrams: null,
  gemstones: null,
  styleTags: ["classic"],
  occasionTags: ["daily"],
  photoPath: null,
};
const input: RankingInput = {
  preferences: {
    style: "classic",
    occasion: "daily",
    preferredGold: "yellow",
    maxBudget: "200.00",
  },
  color: "warm",
  weights,
  candidates: [
    piece,
    { ...piece, sku: "S2", brand: "B", styleTags: [], goldColor: "white" },
  ],
};
it("ranks stably with preferences, diversity weights and missing profile inputs", async () => {
  const ranked = await rulesEngine.rank(input);
  expect(ranked.items.map((r) => r.sku)).toEqual(["S1", "S2"]);
  expect(ranked.items[0].reason).toContain("classic");
  const minimal = { ...input, preferences: {}, color: null };
  expect(await rulesEngine.rank(minimal)).toEqual(
    await rulesEngine.rank({
      ...minimal,
      candidates: [...minimal.candidates].reverse(),
    }),
  );
  expect(
    (await rulesEngine.rank({ ...minimal, candidates: [] })).items,
  ).toEqual([]);
});
it("rejects unknown SKUs, repeats, rank gaps, invented factual claims and missing rows", async () => {
  const { items } = await rulesEngine.rank(input);
  expect(validateRanking({ recommendations: items }, input)).toEqual(items);
  for (const invalid of [
    [items[0]],
    [items[0], items[0]],
    [{ ...items[1], rank: 1 }, { ...items[0], rank: 2 }],
    [items[0], { ...items[1], sku: "unknown" }],
    [items[0], { ...items[1], rank: 4 }],
    [items[0], { ...items[1], reason: "Certified and guaranteed in stock" }],
  ])
    expect(() =>
      validateRanking({ recommendations: invalid }, input),
    ).toThrow();
});
it("maps quoted CSV cells, reports duplicate SKUs and rejects malformed quoting", () => {
  const text =
    'Code,name,brand,category,goldColor,purity,price,onHand\nP,"Ring, small",A,ring,yellow,18K,100,1\nP,Other,A,ring,yellow,18K,100,1';
  const sheet = parseSheet(text, { sku: "Code" });
  expect(sheet.rows[0].data?.name).toBe("Ring, small");
  expect(sheet.rows[1].errors).toContain("Duplicate SKU in file");
  expect(() => parseSheet('sku,name\nX,"bad', {})).toThrow("malformed_csv");
});
it("accepts raster file signatures and rejects active document formats", () => {
  expect(photoType(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])).ext).toBe(
    "png",
  );
  expect(() => photoType(Buffer.from("<svg>"))).toThrow("unsupported_photo");
});
