import { describe, expect, it } from "vitest";
import {
  MANIFEST_SCHEMA_VERSION,
  formatGapLabel,
  parseManifestJson,
} from "./product-transfer";

function minimalManifest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    exportedAt: "2026-08-31T10:00:00.000Z",
    source: "dupli1-manage-web",
    products: [
      {
        name: "Test Bag",
        brandCode: "prada",
        styleCode: "galleria",
        material: "leather",
        variants: [
          {
            colorCode: "blk",
            sizeCode: "m",
            images: ["images/p1/v0/0.jpg"],
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("parseManifestJson", () => {
  it("parses a valid manifest and normalizes master codes", () => {
    const manifest = parseManifestJson(JSON.stringify(minimalManifest()));
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.products).toHaveLength(1);
    const p = manifest.products[0]!;
    expect(p.name).toBe("Test Bag");
    expect(p.brandCode).toBe("PRADA");
    expect(p.styleCode).toBe("GALLERIA");
    expect(p.variants[0]!.colorCode).toBe("BLK");
    expect(p.variants[0]!.sizeCode).toBe("M");
  });

  it("rejects invalid JSON", () => {
    expect(() => parseManifestJson("{")).toThrow(/not valid JSON/);
  });

  it("rejects unsupported schemaVersion", () => {
    const raw = minimalManifest({ schemaVersion: 99 });
    expect(() => parseManifestJson(JSON.stringify(raw))).toThrow(
      /Unsupported schemaVersion/
    );
  });

  it("requires product name, brandCode, and styleCode", () => {
    const noName = minimalManifest({
      products: [{ brandCode: "prada", styleCode: "x", variants: [{ colorCode: "a", sizeCode: "b", images: [] }] }],
    });
    (noName.products as Record<string, unknown>[])[0]!.name = "   ";
    expect(() => parseManifestJson(JSON.stringify(noName))).toThrow(
      /name is required/
    );

    const noBrand = minimalManifest({
      products: [{ name: "Bag", brandCode: "", styleCode: "x", variants: [{ colorCode: "a", sizeCode: "b", images: [] }] }],
    });
    expect(() => parseManifestJson(JSON.stringify(noBrand))).toThrow(
      /brandCode is required/
    );
  });

  it("requires at least one variant with color and size codes", () => {
    const noVariants = minimalManifest({
      products: [{ name: "Bag", brandCode: "prada", styleCode: "x", variants: [] }],
    });
    expect(() => parseManifestJson(JSON.stringify(noVariants))).toThrow(
      /variants must be non-empty/
    );

    const missingColor = minimalManifest({
      products: [
        {
          name: "Bag",
          brandCode: "prada",
          styleCode: "x",
          variants: [{ colorCode: "", sizeCode: "m", images: [] }],
        },
      ],
    });
    expect(() => parseManifestJson(JSON.stringify(missingColor))).toThrow(
      /colorCode is required/
    );
  });

  it("parses optional dimensions and drops empty dimension objects", () => {
    const withDims = minimalManifest({
      products: [
        {
          name: "Bag",
          brandCode: "prada",
          styleCode: "x",
          material: "leather",
          variants: [
            {
              colorCode: "blk",
              sizeCode: "m",
              images: [],
              dimensions: { widthMm: 200, heightMm: 150, depthMm: 80 },
            },
          ],
        },
      ],
    });
    const manifest = parseManifestJson(JSON.stringify(withDims));
    expect(manifest.products[0]!.variants[0]!.dimensions).toEqual({
      widthMm: 200,
      heightMm: 150,
      depthMm: 80,
    });

    const emptyDims = minimalManifest({
      products: [
        {
          name: "Bag",
          brandCode: "prada",
          styleCode: "x",
          material: "leather",
          variants: [
            {
              colorCode: "blk",
              sizeCode: "m",
              images: [],
              dimensions: {},
            },
          ],
        },
      ],
    });
    const noDims = parseManifestJson(JSON.stringify(emptyDims));
    expect(noDims.products[0]!.variants[0]!.dimensions).toBeUndefined();
  });
});

describe("formatGapLabel", () => {
  it("includes brand for style gaps", () => {
    expect(
      formatGapLabel({ kind: "style", code: "GALLERIA", brandCode: "PRADA" })
    ).toBe("style PRADA/GALLERIA");
  });

  it("formats other master kinds as kind + code", () => {
    expect(formatGapLabel({ kind: "brand", code: "PRADA" })).toBe(
      "brand PRADA"
    );
    expect(formatGapLabel({ kind: "color", code: "BLK" })).toBe("color BLK");
  });
});
