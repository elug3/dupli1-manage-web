import { describe, expect, it } from "vitest";
import {
  attributePresetsFor,
  categoryLabel,
  defaultSizeCode,
  filterSizesForCategory,
  isClothingCategory,
  mapCategories,
  mapSizeChart,
  sizeChartEditorRows,
  sizeChartFromEditorRows,
  sortSizes,
} from "./categories";

const APPAREL = ["XXS", "XS", "S", "M", "L", "XL", "XXL"];

const sizeMasters = [
  { code: "OS", name: "One size" },
  { code: "L", name: "Large" },
  { code: "M", name: "Medium" },
  { code: "MED", name: "Medium (bag)" },
  { code: "S", name: "Small" },
  { code: "XL", name: "Extra large" },
];

function row(size: string, values: Partial<Record<string, string>> = {}) {
  return {
    size,
    chestCm: values.chestCm ?? "",
    lengthCm: values.lengthCm ?? "",
    shoulderCm: values.shoulderCm ?? "",
    sleeveCm: values.sleeveCm ?? "",
  };
}

describe("mapCategories", () => {
  it("reads the catalog/categories response; no sizes means any size", () => {
    const cats = mapCategories([
      {
        code: "bags",
        name: "Bags",
        subCategories: [{ code: "tote", name: "Tote" }],
      },
      {
        code: "clothing",
        name: "Clothing",
        subCategories: [{ code: "padded", name: "Padded Jackets" }],
        sizes: APPAREL,
      },
      { name: "no code" },
    ]);
    expect(cats).toHaveLength(2);
    expect(cats[0]).toEqual({
      code: "bags",
      name: "Bags",
      subCategories: [{ code: "tote", name: "Tote" }],
    });
    expect(cats[1].sizes).toEqual(APPAREL);
  });

  it("tolerates a non-array body", () => {
    expect(mapCategories(null)).toEqual([]);
    expect(mapCategories({ results: [{ code: "bags" }] })[0].name).toBe("bags");
  });
});

describe("category helpers", () => {
  it("treats a blank category as bags", () => {
    expect(isClothingCategory("")).toBe(false);
    expect(isClothingCategory(" Clothing ")).toBe(true);
    expect(attributePresetsFor("bags")).toEqual([]);
    expect(attributePresetsFor("clothing")).toContain("fill_weight");
  });

  it("labels known categories through i18n and others by backend name", () => {
    const t = (key: string) => `[${key}]`;
    const cats = mapCategories([{ code: "shoes", name: "Shoes" }]);
    expect(categoryLabel(undefined, cats, t)).toBe("[products.category_bags]");
    expect(categoryLabel("shoes", cats, t)).toBe("Shoes");
    expect(categoryLabel("hats", cats, t)).toBe("hats");
  });
});

describe("filterSizesForCategory / defaultSizeCode", () => {
  it("keeps every size, OS first choice, when the category has no list", () => {
    expect(filterSizesForCategory(sizeMasters)).toBe(sizeMasters);
    expect(defaultSizeCode(sizeMasters)).toBe("OS");
  });

  it("limits clothing to its sizes in the category's order and defaults to M", () => {
    const filtered = filterSizesForCategory(sizeMasters, APPAREL);
    expect(filtered.map((s) => s.code)).toEqual(["S", "M", "L", "XL"]);
    expect(defaultSizeCode(filtered, APPAREL)).toBe("M");
  });

  it("falls back to the first allowed size when M is not a master", () => {
    const filtered = filterSizesForCategory(
      [{ code: "XL", name: "XL" }, { code: "S", name: "S" }],
      APPAREL
    );
    expect(defaultSizeCode(filtered, APPAREL)).toBe("S");
    expect(defaultSizeCode([], APPAREL)).toBe("");
  });
});

describe("sortSizes", () => {
  it("orders by the category list and keeps unknown sizes last", () => {
    expect(sortSizes(["XL", "OS", "S", "m"], APPAREL)).toEqual([
      "S",
      "m",
      "XL",
      "OS",
    ]);
    expect(sortSizes(["L", "S"])).toEqual(["L", "S"]);
  });
});

describe("size chart", () => {
  it("maps the API chart and drops zero / missing measurements", () => {
    expect(
      mapSizeChart([
        { size: "M", chestCm: 56, lengthCm: 0 },
        { chestCm: 50 },
      ])
    ).toEqual([{ size: "M", chestCm: 56 }]);
    expect(mapSizeChart(undefined)).toBeUndefined();
    expect(mapSizeChart([])).toBeUndefined();
  });

  it("prefills a row per variant size in the category's order", () => {
    const rows = sizeChartEditorRows(
      [{ size: "L", chestCm: 60, sleeveCm: 64.5 }],
      ["XL", "M", "L", "M"],
      APPAREL
    );
    expect(rows.map((r) => r.size)).toEqual(["M", "L", "XL"]);
    expect(rows[1]).toEqual(row("L", { chestCm: "60", sleeveCm: "64.5" }));
    expect(rows[0]).toEqual(row("M"));
  });

  it("serializes rounded measurements and skips unmeasured sizes", () => {
    const result = sizeChartFromEditorRows([
      row("m", { chestCm: "56.3", lengthCm: "70" }),
      row("L"),
      row("XL", { shoulderCm: "0", sleeveCm: "66.74" }),
    ]);
    expect(result).toEqual({
      chart: [
        { size: "M", chestCm: 56.5, lengthCm: 70 },
        { size: "XL", sleeveCm: 66.5 },
      ],
    });
  });

  it("serializes an untouched grid as [] so saving clears the chart", () => {
    expect(sizeChartFromEditorRows([row("M"), row("L")])).toEqual({ chart: [] });
    expect(sizeChartFromEditorRows([])).toEqual({ chart: [] });
  });

  it("refuses rows the backend would reject", () => {
    expect(sizeChartFromEditorRows([row("M", { chestCm: "301" })]).error).toEqual({
      code: "INVALID_MEASUREMENT",
      size: "M",
    });
    expect(sizeChartFromEditorRows([row("M", { chestCm: "-1" })]).error?.code).toBe(
      "INVALID_MEASUREMENT"
    );
    expect(sizeChartFromEditorRows([row("M", { chestCm: "0.2" })]).error).toEqual({
      code: "NO_MEASUREMENT",
      size: "M",
    });
    expect(
      sizeChartFromEditorRows([row("M", { chestCm: "50" }), row("m")]).error
    ).toEqual({ code: "DUPLICATE_SIZE", size: "M" });
    expect(sizeChartFromEditorRows([row("", { chestCm: "50" })]).error?.code).toBe(
      "SIZE_REQUIRED"
    );
    const many = Array.from({ length: 21 }, (_, i) => row(`S${i}`, { chestCm: "50" }));
    expect(sizeChartFromEditorRows(many).error?.code).toBe("TOO_MANY_ROWS");
  });
});
