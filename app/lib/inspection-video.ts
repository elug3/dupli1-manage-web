/**
 * Pre-shipment inspection video (검수영상) — one per order, filmed by staff
 * before shipping. Backend: dupli1 docs/order-inspection-video.md.
 *
 * - `PUT /api/v1/orders/{id}/inspection-video` takes the file as the raw body
 *   (not multipart) with its Content-Type and Content-Length (`order.ship`).
 * - `GET` the same path streams it back (Range requests honoured).
 * - Ship answers `409 inspection_video_required` until one is attached.
 * - It can be replaced until the order is fulfilled or canceled
 *   (`409 inspection_video_locked` after that).
 */
import type { Order, OrderStatus } from "~/lib/api";
import { orderPath } from "~/lib/gateway";

/** Same cap as the order service default: Cloudflare refuses bigger bodies. */
export const INSPECTION_VIDEO_MAX_BYTES = 100_000_000;

/** Content types order accepts, keyed by the extensions we pick them from. */
const TYPE_BY_EXTENSION: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  qt: "video/quicktime",
  webm: "video/webm",
};

const ACCEPTED_TYPES = new Set(Object.values(TYPE_BY_EXTENSION));

/** `accept` attribute for the file input. */
export const INSPECTION_VIDEO_ACCEPT =
  "video/mp4,video/quicktime,video/webm,.mp4,.m4v,.mov,.webm";

/** Statuses in which order still lets staff attach or replace the video. */
const EDITABLE: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  "paid",
  "confirmed",
  "in_transit",
  "delivered",
  "disputed",
]);

/**
 * The content type to send, or `null` when order would refuse the file.
 * Browsers leave `File.type` empty for some `.mov` files, so the extension
 * decides when the type is missing or generic.
 */
export function inspectionVideoContentType(file: {
  name: string;
  type: string;
}): string | null {
  const type = file.type.split(";")[0].trim().toLowerCase();
  if (ACCEPTED_TYPES.has(type)) return type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (type && type !== "application/octet-stream" && !type.startsWith("video/")) {
    return null;
  }
  return TYPE_BY_EXTENSION[ext] ?? null;
}

export type InspectionVideoFileProblem = "type" | "too_large" | "empty";

/** Checks the browser can make before spending an upload on the file. */
export function inspectionVideoFileProblem(file: {
  name: string;
  type: string;
  size: number;
}): InspectionVideoFileProblem | null {
  if (!inspectionVideoContentType(file)) return "type";
  if (file.size <= 0) return "empty";
  if (file.size > INSPECTION_VIDEO_MAX_BYTES) return "too_large";
  return null;
}

/** Whether the card shows at all: from payment on, and on a canceled order only if one was attached. */
export function showInspectionVideo(order: Order): boolean {
  if (order.status === "pending") return false;
  if (order.status === "canceled") return Boolean(order.inspection_video);
  return true;
}

/** Whether staff may attach or replace the video now. */
export function inspectionVideoEditable(order: Order): boolean {
  return EDITABLE.has(order.status) && !order.inspection_video_locked;
}

/** True when shipping is waiting on the video. */
export function shipNeedsInspectionVideo(order: Order): boolean {
  return order.status === "confirmed" && !order.inspection_video;
}

/** Order-service path of the video (before the browser gateway prefix). */
export function inspectionVideoPath(orderId: string): string {
  return orderPath(`/api/v1/orders/${encodeURIComponent(orderId)}/inspection-video`);
}

/**
 * `<video src>` through the cookie session gateway. The upload time is in the
 * query so a replaced video is fetched again rather than reused by the player.
 */
export function inspectionVideoSrc(order: Order): string | null {
  const video = order.inspection_video;
  if (!video) return null;
  return `/auth/session/gateway${inspectionVideoPath(order.id)}?v=${encodeURIComponent(video.uploaded_at)}`;
}

/** Decimal megabytes, matching the 100 MB cap ("78.0 MB"). */
export function formatVideoBytes(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  const mb = bytes / 1_000_000;
  return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

/** Short label for the stored content type. */
export function videoTypeLabel(contentType: string): string {
  switch (contentType) {
    case "video/mp4":
      return "MP4";
    case "video/quicktime":
      return "MOV";
    case "video/webm":
      return "WebM";
    default:
      return contentType;
  }
}
