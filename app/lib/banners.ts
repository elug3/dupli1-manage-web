import { authedFetch } from "./auth";
import { productPath } from "./gateway";

/**
 * Storefront image banners (backend docs/product-storefront-banners.md).
 * Staff upload an image, show it and take it down by hand; there is no
 * schedule. `home_hero` is the home page's top image, and while none is shown
 * the storefront keeps its built-in video.
 */

export type BannerPlacement = "home_hero";
export const BANNER_PLACEMENTS: BannerPlacement[] = ["home_hero"];

export const BANNER_LANGS = ["ko", "en", "zh"] as const;
export type BannerLang = (typeof BANNER_LANGS)[number];
export type LocalizedText = Record<BannerLang, string>;

export const BANNER_TEXT_MAX = 120;
export const BANNER_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const BANNER_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export interface Banner {
  id: string;
  placement: BannerPlacement;
  image_url: string;
  mobile_image_url?: string;
  title: LocalizedText;
  link_url?: string;
  link_label: LocalizedText;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  updated_by?: string;
}

export type BannerInput = Omit<Banner, "id" | "created_at" | "updated_at" | "updated_by">;

export function emptyText(): LocalizedText {
  return { ko: "", en: "", zh: "" };
}

function text(raw: Partial<LocalizedText> | null | undefined): LocalizedText {
  return { ko: raw?.ko ?? "", en: raw?.en ?? "", zh: raw?.zh ?? "" };
}

function mapBanner(raw: Banner): Banner {
  return {
    ...raw,
    placement: raw.placement || "home_hero",
    title: text(raw.title),
    link_label: text(raw.link_label),
    sort_order: raw.sort_order ?? 0,
    active: Boolean(raw.active),
  };
}

async function errorText(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

/** Every banner, shown or not. Needs `banner.manage`. */
export async function listBanners(): Promise<Banner[]> {
  const res = await authedFetch(productPath("/api/v1/products/banners/all"));
  if (!res.ok) throw new BannerError(res.status, await errorText(res, "Failed to load banners"));
  const body = (await res.json()) as { banners?: Banner[] };
  return (body.banners ?? []).map(mapBanner);
}

export async function createBanner(input: BannerInput): Promise<Banner> {
  const res = await authedFetch(productPath("/api/v1/products/banners"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new BannerError(res.status, await errorText(res, "Failed to create the banner"));
  return mapBanner((await res.json()) as Banner);
}

export async function updateBanner(id: string, input: BannerInput): Promise<Banner> {
  const res = await authedFetch(
    productPath(`/api/v1/products/banners/by-id/${encodeURIComponent(id)}`),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );
  if (!res.ok) throw new BannerError(res.status, await errorText(res, "Failed to save the banner"));
  return mapBanner((await res.json()) as Banner);
}

/** Show (true) or take down (false), leaving everything else as it is. */
export async function setBannerActive(id: string, active: boolean): Promise<Banner> {
  const res = await authedFetch(
    productPath(`/api/v1/products/banners/by-id/${encodeURIComponent(id)}/active`),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    }
  );
  if (!res.ok) throw new BannerError(res.status, await errorText(res, "Failed to update the banner"));
  return mapBanner((await res.json()) as Banner);
}

export async function deleteBanner(id: string): Promise<void> {
  const res = await authedFetch(
    productPath(`/api/v1/products/banners/by-id/${encodeURIComponent(id)}`),
    { method: "DELETE" }
  );
  if (!res.ok && res.status !== 404) {
    throw new BannerError(res.status, await errorText(res, "Failed to delete the banner"));
  }
}

/** Uploads one image as it is and returns its public URL. */
export async function uploadBannerImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("image", file);
  const res = await authedFetch(productPath("/api/v1/products/banners/images"), {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new BannerError(res.status, await errorText(res, "Failed to upload the image"));
  const body = (await res.json()) as { url?: string };
  if (!body.url) throw new BannerError(500, "The upload returned no URL");
  return body.url;
}

/** A failed banner call; `status` 403 means the operator lacks `banner.manage`. */
export class BannerError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "BannerError";
  }
}

/** Checks a file before uploading; returns a message key or null. */
export function bannerFileProblem(file: { type: string; size: number }): string | null {
  if (!BANNER_IMAGE_TYPES.includes(file.type)) return "banners.errImageType";
  if (file.size > BANNER_IMAGE_MAX_BYTES) return "banners.errImageSize";
  return null;
}

// ── Form ──────────────────────────────────────────────────────────────────────

export interface BannerFormState {
  placement: BannerPlacement;
  imageUrl: string;
  mobileImageUrl: string;
  title: LocalizedText;
  linkUrl: string;
  linkLabel: LocalizedText;
  active: boolean;
  sortOrder: string;
}

export function emptyBannerForm(): BannerFormState {
  return {
    placement: "home_hero",
    imageUrl: "",
    mobileImageUrl: "",
    title: emptyText(),
    linkUrl: "",
    linkLabel: emptyText(),
    active: false,
    sortOrder: "0",
  };
}

export function bannerToForm(b: Banner): BannerFormState {
  return {
    placement: b.placement,
    imageUrl: b.image_url,
    mobileImageUrl: b.mobile_image_url ?? "",
    title: text(b.title),
    linkUrl: b.link_url ?? "",
    linkLabel: text(b.link_label),
    active: b.active,
    sortOrder: String(b.sort_order ?? 0),
  };
}

function trimText(t: LocalizedText): LocalizedText {
  return { ko: t.ko.trim(), en: t.en.trim(), zh: t.zh.trim() };
}

/** A storefront path or an https URL, like the service accepts. */
export function isBannerLink(url: string): boolean {
  if (url.startsWith("https://")) return true;
  return url.startsWith("/") && !url.startsWith("//") && !/[\s\\]/.test(url);
}

/**
 * Turns the form into what the service takes, or a message key for the first
 * problem. Mirrors the service's own checks so most mistakes never leave the
 * page; the service still decides.
 */
export function buildBannerInput(
  form: BannerFormState
): { input: BannerInput; errorKey?: undefined } | { input?: undefined; errorKey: string } {
  const imageUrl = form.imageUrl.trim();
  if (!imageUrl) return { errorKey: "banners.errImageRequired" };
  const linkUrl = form.linkUrl.trim();
  if (linkUrl && !isBannerLink(linkUrl)) return { errorKey: "banners.errLink" };
  const order = form.sortOrder.trim() === "" ? 0 : Number(form.sortOrder);
  if (!Number.isInteger(order) || order < 0) return { errorKey: "banners.errSortOrder" };
  const title = trimText(form.title);
  const linkLabel = trimText(form.linkLabel);
  for (const t of [title, linkLabel]) {
    for (const lang of BANNER_LANGS) {
      if ([...t[lang]].length > BANNER_TEXT_MAX) return { errorKey: "banners.errTextLength" };
    }
  }
  return {
    input: {
      placement: form.placement,
      image_url: imageUrl,
      mobile_image_url: form.mobileImageUrl.trim(),
      title,
      link_url: linkUrl,
      link_label: linkLabel,
      active: form.active,
      sort_order: order,
    },
  };
}

/** The banner the storefront shows in a placement: the first live one. */
export function shownBanner(banners: Banner[], placement: BannerPlacement): Banner | null {
  const live = banners
    .filter((b) => b.active && b.placement === placement)
    .sort(
      (a, b) =>
        a.sort_order - b.sort_order ||
        Date.parse(b.updated_at || "") - Date.parse(a.updated_at || "")
    );
  return live[0] ?? null;
}
