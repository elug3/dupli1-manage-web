import { describe, expect, it } from "vitest";
import {
  formatGapLabel,
  MANIFEST_SCHEMA_VERSION,
  parseManifestJson,
  type MasterGap,
} from "./product-transfer";

describe("parseManifestJson", () => {
  it("accepts a minimal valid manifest", () => {
    const manifest = parseManifestJson(
      JSON.stringify({
        schemaVersion: MANIFEST_SCHEMA_VERSION,
        exportedAt: "2026-09-07T10:00:00.000Z",
        source: "dupli1-manage-web",
        products: [
          {
            name: "Prada Galleria",
            brandCode: "PRA",
            styleCode: "GAL001",
            material: "leather",
            variants: [
              {
                colorCode: "BLK",
                sizeCode: "M",
                images: ["images/p1/v0/0.jpg"],
              },
            ],
          },
        ],
      })
    );

    expect(manifest.schemaVersion).toBe(MANIFEST_SCHEMA_VERSION);
    expect(manifest.products).toHaveLength(1);
    expect(manifest.products[0].variants[0].colorCode).toBe("BLK");
  });

  it("rejects invalid JSON and unsupported schema versions", () => {
    expect(() => parseManifestJson("{")).toThrow(/valid JSON/);
    expect(() =>
      parseManifestJson(JSON.stringify({ schemaVersion: 99, products: [] }))
    ).toThrow(/Unsupported schemaVersion/);
    expect(() =>
      parseManifestJson(JSON.stringify({ schemaVersion: MANIFEST_SCHEMA_VERSION }))
    ).toThrow(/products must be an array/);
  });
});

describe("formatGapLabel", () => {
  it("labels style gaps with brand context", () => {
    const gap: MasterGap = { kind: "style", code: "GAL001", brandCode: "PRA" };
    expect(formatGapLabel(gap)).toBe("style PRA/GAL001");
  });

  it("labels other master kinds by kind and code", () => {
    expect(formatGapLabel({ kind: "color", code: "BLK" })).toBe("color BLK");
    expect(formatGapLabel({ kind: "brand", code: "PRA" })).toBe("brand PRA");
  });
});
