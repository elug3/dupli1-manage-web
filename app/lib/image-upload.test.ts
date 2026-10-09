import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES,
  checkImageFile,
  isSameImageSet,
  moveItem,
  partitionImageFiles,
  sortFilesByName,
  uploadInOrder,
} from "~/lib/image-upload";

describe("checkImageFile / partitionImageFiles", () => {
  it("accepts images up to the size limit and rejects the rest", () => {
    const ok = { name: "a.jpg", type: "image/jpeg", size: MAX_IMAGE_BYTES };
    const big = { name: "b.jpg", type: "image/jpeg", size: MAX_IMAGE_BYTES + 1 };
    const pdf = { name: "c.pdf", type: "application/pdf", size: 10 };
    expect(checkImageFile(ok)).toBeNull();
    expect(checkImageFile(big)).toBe("too_large");
    expect(checkImageFile(pdf)).toBe("not_image");
    expect(partitionImageFiles([ok, big, pdf])).toEqual({
      accepted: [ok],
      rejected: [big, pdf],
    });
  });
});

describe("sortFilesByName", () => {
  it("compares numbers numerically and ignores case", () => {
    const names = ["10.jpg", "2.jpg", "B.jpg", "1.jpg", "a.jpg"].map((name) => ({ name }));
    expect(sortFilesByName(names).map((f) => f.name)).toEqual([
      "1.jpg",
      "2.jpg",
      "10.jpg",
      "a.jpg",
      "B.jpg",
    ]);
  });
});

describe("moveItem", () => {
  it("moves forward and backward without mutating the input", () => {
    const items = ["a", "b", "c", "d"];
    expect(moveItem(items, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(items, 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(items).toEqual(["a", "b", "c", "d"]);
  });

  it("ignores out-of-range moves", () => {
    expect(moveItem(["a", "b"], 0, 2)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], -1, 0)).toEqual(["a", "b"]);
  });
});

describe("isSameImageSet", () => {
  it("is true only for a reordering", () => {
    expect(isSameImageSet(["a", "b"], ["b", "a"])).toBe(true);
    expect(isSameImageSet(["a", "b"], ["a"])).toBe(false);
    expect(isSameImageSet(["a", "b"], ["a", "c"])).toBe(false);
  });
});

describe("uploadInOrder", () => {
  it("uploads one at a time in queue order", async () => {
    const started: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const result = await uploadInOrder(["1", "2", "3"], async (item) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      started.push(item);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
    });
    expect(result).toEqual({ done: 3 });
    expect(started).toEqual(["1", "2", "3"]);
    expect(maxInFlight).toBe(1);
  });

  it("stops at the first failure and reports progress", async () => {
    const progress: number[] = [];
    const boom = new Error("boom");
    const result = await uploadInOrder(
      ["1", "2", "3"],
      async (item) => {
        if (item === "2") throw boom;
      },
      (done) => progress.push(done)
    );
    expect(result).toEqual({ done: 1, error: boom });
    expect(progress).toEqual([0, 1]);
  });
});
