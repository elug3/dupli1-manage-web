import { authedFetch } from "./auth";
import { productPath } from "./gateway";

/** Staff hide reason, matching product's ReviewHideReasonMaxChars. */
export const HIDE_REASON_MAX = 200;

export type ReviewStatus = "visible" | "hidden";

export interface StaffReviewPhoto {
  id: string;
  url: string;
  thumbUrl: string;
}

/** A review as `GET /api/v1/products/reviews` returns it to staff. */
export interface StaffReview {
  id: string;
  productId: string;
  skuId: string;
  variantLabel: string;
  rating: number;
  body: string;
  author: string;
  createdAt: string;
  editedAt: string;
  orderId: string;
  hidden: boolean;
  hiddenReason: string;
  customerId: string;
  photos: StaffReviewPhoto[];
}

export interface StaffReviewQuery {
  status?: ReviewStatus;
  productId?: string;
  rating?: number;
  limit?: number;
  cursor?: string;
}

export interface StaffReviewPage {
  reviews: StaffReview[];
  nextCursor: string;
}

export class ReviewRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ReviewRequestError";
    this.status = status;
  }
}

export function staffReviewQuery(query: StaffReviewQuery): string {
  const params = new URLSearchParams();
  params.set("status", query.status === "hidden" ? "hidden" : "visible");
  const productId = query.productId?.trim() ?? "";
  if (productId) params.set("productId", productId);
  if (query.rating != null && query.rating >= 1 && query.rating <= 5) {
    params.set("rating", String(query.rating));
  }
  if (query.limit != null) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);
  return params.toString();
}

/** Why a hide reason cannot be sent, or null when it can. */
export function hideReasonError(reason: string, hiding: boolean): "required" | "tooLong" | null {
  const text = reason.trim();
  if (hiding && text.length === 0) return "required";
  if ([...text].length > HIDE_REASON_MAX) return "tooLong";
  return null;
}

export function hideReviewBody(hidden: boolean, reason: string): { hidden: boolean; reason?: string } {
  return hidden ? { hidden: true, reason: reason.trim() } : { hidden: false };
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parsePhoto(value: unknown): StaffReviewPhoto | null {
  if (!value || typeof value !== "object") return null;
  const photo = value as Record<string, unknown>;
  const url = text(photo.url);
  if (!url) return null;
  return { id: text(photo.id), url, thumbUrl: text(photo.thumbUrl) || url };
}

function parseReview(value: unknown): StaffReview {
  const review = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rating = Number(review.rating);
  const photos = Array.isArray(review.photos)
    ? review.photos.flatMap((photo) => {
        const parsed = parsePhoto(photo);
        return parsed ? [parsed] : [];
      })
    : [];
  return {
    id: text(review.id),
    productId: text(review.productId),
    skuId: text(review.skuId),
    variantLabel: text(review.variantLabel),
    rating: rating >= 1 && rating <= 5 ? rating : 0,
    body: text(review.body),
    author: text(review.author),
    createdAt: text(review.createdAt),
    editedAt: text(review.editedAt),
    orderId: text(review.orderId),
    hidden: review.hidden === true,
    hiddenReason: text(review.hiddenReason),
    customerId: text(review.customerId),
    photos,
  };
}

export function parseStaffReviewPage(data: unknown): StaffReviewPage {
  const body = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  return {
    reviews: Array.isArray(body.reviews) ? body.reviews.map(parseReview) : [],
    nextCursor: text(body.nextCursor),
  };
}

async function readError(res: Response): Promise<ReviewRequestError> {
  let message = res.statusText || "request failed";
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) message = body.error;
  } catch {
    // The status is enough when the body is not JSON.
  }
  return new ReviewRequestError(res.status, message);
}

/** Staff list. `product.review.moderate`. Newest first. */
export async function listStaffReviews(
  query: StaffReviewQuery,
  init?: RequestInit
): Promise<StaffReviewPage> {
  const res = await authedFetch(productPath(`/api/v1/products/reviews?${staffReviewQuery(query)}`), init);
  if (!res.ok) throw await readError(res);
  return parseStaffReviewPage(await res.json());
}

/** Hide (reason required) or unhide one review. Returns the updated review. */
export async function setReviewHidden(
  reviewId: string,
  hidden: boolean,
  reason: string
): Promise<StaffReview> {
  const res = await authedFetch(
    productPath(`/api/v1/products/reviews/by-id/${encodeURIComponent(reviewId)}/hide`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(hideReviewBody(hidden, reason)),
    }
  );
  if (!res.ok) throw await readError(res);
  return parseReview(await res.json());
}
