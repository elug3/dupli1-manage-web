import { describe, expect, it } from "vitest";
import type { CatalogReport } from "~/lib/api";
import { brandsCsv, buildMatrix, heat, parseCountBy, productsHref } from "~/lib/catalog-report";

const t = (products: number, skus = products * 2, units = products * 5, reserved = 0) => ({
  products,
  skus,
  units,
  reserved,
});

const report: CatalogReport = {
  totals: t(4),
  products_by_status: { active: 4, draft: 0, archived: 0 },
  brands: [
    { code: "PRD", name: "Prada", ...t(3) },
    { code: "", name: "Vintage, Co", ...t(1) },
    { code: "FND", name: "Fendi", ...t(0) },
  ],
  categories: [
    {
      code: "bags",
      name: "Bags",
      ...t(4),
      sub_categories: [
        { code: "tote", name: "Tote", ...t(3) },
        { code: "mini", name: "Mini", ...t(0) },
        { code: "", name: "", ...t(1) },
      ],
    },
  ],
  cells: [
    { brand_code: "PRD", brand: "Prada", category: "bags", sub_category: "tote", ...t(3) },
    { brand_code: "", brand: "Vintage, Co", category: "bags", sub_category: "", ...t(1) },
  ],
};

describe("catalog report helpers", () => {
  it("links a count to the products list it stands for", () => {
    expect(productsHref({ brandCode: "PRD", brand: "Prada", category: "bags", subcategory: "tote", status: "active" })).toBe(
      "/products?category=bags&subcategory=tote&brand_code=PRD&status=active"
    );
    expect(productsHref({ brand: "Vintage" })).toBe("/products?brand=Vintage");
    expect(productsHref({})).toBe("/products");
  });

  it("builds the grid with a column per subcategory and a row per non-empty brand", () => {
    const m = buildMatrix(report, "products");
    expect(m.columns.map((c) => c.subCategory)).toEqual(["tote", "mini", ""]);
    expect(m.rows.map((r) => r.brand)).toEqual(["Prada", "Vintage, Co"]);
    expect(m.rows[0].cells["bags/tote"].products).toBe(3);
    expect(m.rows[1].cells["bags/"].products).toBe(1);
    expect(m.totals["bags/tote"].products).toBe(3);
  });

  it("reads the count-by param and scales heat", () => {
    expect(parseCountBy("units")).toBe("units");
    expect(parseCountBy("nonsense")).toBe("products");
    expect(heat(0, 10)).toBe(0);
    expect(heat(10, 10)).toBe(1);
  });

  it("quotes CSV fields that need it", () => {
    expect(brandsCsv(report).split("\n")[2]).toBe(',"Vintage, Co",1,2,5,0');
  });
});
