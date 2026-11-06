import { describe, expect, it } from "vitest";
import type { Order } from "./api";
import {
  formatVideoBytes,
  inspectionVideoContentType,
  inspectionVideoEditable,
  inspectionVideoFileProblem,
  inspectionVideoSrc,
  shipNeedsInspectionVideo,
  showInspectionVideo,
} from "./inspection-video";

const video = {
  content_type: "video/mp4",
  size_bytes: 78_000_000,
  uploaded_by: "user-1",
  uploaded_at: "2026-11-06T08:42:00Z",
};

function order(overrides: Partial<Order>): Order {
  return {
    id: "ord_1",
    customer_id: "c",
    reservation_id: "r",
    items: [],
    status: "confirmed",
    subtotal_won: 0,
    discount_won: 0,
    total_won: 0,
    created_at: "",
    updated_at: "",
    ...overrides,
  } as Order;
}

describe("inspectionVideoContentType", () => {
  it("keeps an accepted browser type", () => {
    expect(inspectionVideoContentType({ name: "a.mp4", type: "video/mp4" })).toBe("video/mp4");
    expect(inspectionVideoContentType({ name: "a", type: "video/QuickTime" })).toBe("video/quicktime");
  });
  it("falls back to the extension when the browser gives no type", () => {
    expect(inspectionVideoContentType({ name: "IMG_0001.MOV", type: "" })).toBe("video/quicktime");
    expect(inspectionVideoContentType({ name: "a.webm", type: "application/octet-stream" })).toBe("video/webm");
  });
  it("refuses other files", () => {
    expect(inspectionVideoContentType({ name: "a.avi", type: "video/x-msvideo" })).toBeNull();
    expect(inspectionVideoContentType({ name: "a.mp4", type: "image/png" })).toBeNull();
    expect(inspectionVideoContentType({ name: "notes.txt", type: "" })).toBeNull();
  });
});

describe("inspectionVideoFileProblem", () => {
  it("checks type, emptiness and the 100 MB cap", () => {
    expect(inspectionVideoFileProblem({ name: "a.mp4", type: "video/mp4", size: 1 })).toBeNull();
    expect(inspectionVideoFileProblem({ name: "a.mp4", type: "video/mp4", size: 100_000_000 })).toBeNull();
    expect(inspectionVideoFileProblem({ name: "a.mp4", type: "video/mp4", size: 100_000_001 })).toBe("too_large");
    expect(inspectionVideoFileProblem({ name: "a.mp4", type: "video/mp4", size: 0 })).toBe("empty");
    expect(inspectionVideoFileProblem({ name: "a.gif", type: "image/gif", size: 5 })).toBe("type");
  });
});

describe("order rules", () => {
  it("blocks ship only on a confirmed order without a video", () => {
    expect(shipNeedsInspectionVideo(order({}))).toBe(true);
    expect(shipNeedsInspectionVideo(order({ inspection_video: video }))).toBe(false);
    expect(shipNeedsInspectionVideo(order({ status: "paid" }))).toBe(false);
  });
  it("is editable from paid until fulfilled or canceled", () => {
    for (const status of ["paid", "confirmed", "in_transit", "delivered", "disputed"] as const) {
      expect(inspectionVideoEditable(order({ status }))).toBe(true);
    }
    expect(inspectionVideoEditable(order({ status: "fulfilled", inspection_video_locked: true }))).toBe(false);
    expect(inspectionVideoEditable(order({ status: "canceled" }))).toBe(false);
    expect(inspectionVideoEditable(order({ status: "pending" }))).toBe(false);
  });
  it("hides the card while pending and on a canceled order without a video", () => {
    expect(showInspectionVideo(order({ status: "pending" }))).toBe(false);
    expect(showInspectionVideo(order({ status: "canceled" }))).toBe(false);
    expect(showInspectionVideo(order({ status: "canceled", inspection_video: video }))).toBe(true);
    expect(showInspectionVideo(order({ status: "fulfilled" }))).toBe(true);
  });
  it("versions the player URL by upload time", () => {
    expect(inspectionVideoSrc(order({}))).toBeNull();
    expect(inspectionVideoSrc(order({ inspection_video: video }))).toBe(
      "/auth/session/gateway/order/api/v1/orders/ord_1/inspection-video?v=2026-11-06T08%3A42%3A00Z"
    );
  });
});

describe("formatVideoBytes", () => {
  it("uses decimal megabytes like the cap", () => {
    expect(formatVideoBytes(78_000_000)).toBe("78.0 MB");
    expect(formatVideoBytes(100_000_000)).toBe("100 MB");
    expect(formatVideoBytes(132_400_000)).toBe("132 MB");
    expect(formatVideoBytes(400_000)).toBe("400 KB");
  });
});
