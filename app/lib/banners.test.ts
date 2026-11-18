import { describe, expect, it } from "vitest";
import {
  type Banner,
  bannerFileProblem,
  bannerToForm,
  buildBannerInput,
  emptyBannerForm,
  isBannerLink,
  shownBanner,
} from "./banners";

function banner(over: Partial<Banner>): Banner {
  return {
    id: "b1",
    placement: "home_hero",
    image_url: "/product-images/banners/a.jpg",
    title: { ko: "", en: "", zh: "" },
    link_label: { ko: "", en: "", zh: "" },
    active: false,
    sort_order: 0,
    created_at: "2026-11-18T00:00:00Z",
    updated_at: "2026-11-18T00:00:00Z",
    ...over,
  };
}

describe("buildBannerInput", () => {
  it("needs a desktop image", () => {
    expect(buildBannerInput(emptyBannerForm()).errorKey).toBe("banners.errImageRequired");
  });

  it("trims and sends every field", () => {
    const form = {
      ...emptyBannerForm(),
      imageUrl: " https://dupli1.com/product-images/banners/a.jpg ",
      title: { ko: " 겨울 ", en: "Winter", zh: "" },
      linkUrl: "/category/new",
      sortOrder: "2",
      active: true,
    };
    const { input, errorKey } = buildBannerInput(form);
    expect(errorKey).toBeUndefined();
    expect(input).toMatchObject({
      placement: "home_hero",
      image_url: "https://dupli1.com/product-images/banners/a.jpg",
      mobile_image_url: "",
      title: { ko: "겨울", en: "Winter", zh: "" },
      link_url: "/category/new",
      sort_order: 2,
      active: true,
    });
  });

  it("refuses links the service refuses", () => {
    for (const link of ["javascript:alert(1)", "//evil.example", "http://example.com", "category/new"]) {
      expect(buildBannerInput({ ...emptyBannerForm(), imageUrl: "/a.jpg", linkUrl: link }).errorKey).toBe(
        "banners.errLink"
      );
    }
    expect(isBannerLink("https://brand.example/x")).toBe(true);
  });

  it("refuses a bad order and over-long text", () => {
    const base = { ...emptyBannerForm(), imageUrl: "/a.jpg" };
    expect(buildBannerInput({ ...base, sortOrder: "-1" }).errorKey).toBe("banners.errSortOrder");
    expect(buildBannerInput({ ...base, sortOrder: "1.5" }).errorKey).toBe("banners.errSortOrder");
    expect(
      buildBannerInput({ ...base, title: { ko: "가".repeat(121), en: "", zh: "" } }).errorKey
    ).toBe("banners.errTextLength");
    expect(buildBannerInput({ ...base, sortOrder: "" }).input?.sort_order).toBe(0);
  });

  it("round-trips a banner through the form", () => {
    const b = banner({ mobile_image_url: "/m.jpg", link_url: "/x", sort_order: 3, active: true, title: { ko: "가", en: "A", zh: "甲" } });
    expect(buildBannerInput(bannerToForm(b)).input).toMatchObject({
      image_url: b.image_url,
      mobile_image_url: "/m.jpg",
      link_url: "/x",
      sort_order: 3,
      active: true,
      title: b.title,
    });
  });
});

describe("bannerFileProblem", () => {
  it("takes JPEG, PNG and WebP up to 10 MB", () => {
    expect(bannerFileProblem({ type: "image/webp", size: 1000 })).toBeNull();
    expect(bannerFileProblem({ type: "image/gif", size: 1000 })).toBe("banners.errImageType");
    expect(bannerFileProblem({ type: "image/png", size: 11 * 1024 * 1024 })).toBe("banners.errImageSize");
  });
});

describe("shownBanner", () => {
  it("is the first live banner by order, then the most recently changed", () => {
    const list = [
      banner({ id: "hidden", active: false, sort_order: 0 }),
      banner({ id: "later", active: true, sort_order: 1 }),
      banner({ id: "older", active: true, sort_order: 0, updated_at: "2026-11-01T00:00:00Z" }),
      banner({ id: "newer", active: true, sort_order: 0, updated_at: "2026-11-10T00:00:00Z" }),
    ];
    expect(shownBanner(list, "home_hero")?.id).toBe("newer");
    expect(shownBanner([banner({})], "home_hero")).toBeNull();
  });
});
