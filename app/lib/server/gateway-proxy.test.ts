import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PRODUCT_IMAGE_CACHE_CONTROL,
  proxyProductImagesRequest,
} from "./gateway-proxy";

const IMAGE_URL = "https://manage.example/product-images/p1/STYLE/abc.w600.jpg";

function stubUpstream(response: Response) {
  const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) => response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("proxyProductImagesRequest", () => {
  it("forwards conditional headers so the browser can get a 304", async () => {
    const fetchMock = stubUpstream(new Response(null, { status: 304 }));

    const res = await proxyProductImagesRequest(
      new Request(IMAGE_URL, {
        headers: {
          Accept: "image/avif,image/webp,*/*",
          "If-None-Match": '"etag-1"',
          "If-Modified-Since": "Thu, 05 Nov 2026 03:13:47 GMT",
          Cookie: "session=secret",
        },
      })
    );

    expect(res.status).toBe(304);
    const sent = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(sent.get("If-None-Match")).toBe('"etag-1"');
    expect(sent.get("If-Modified-Since")).toBe("Thu, 05 Nov 2026 03:13:47 GMT");
    expect(sent.get("Accept")).toBe("image/avif,image/webp,*/*");
    expect(sent.get("Cookie")).toBeNull();
  });

  it("marks image responses as long-lived and keeps upstream headers", async () => {
    stubUpstream(
      new Response("jpeg-bytes", {
        status: 200,
        headers: { "Content-Type": "image/jpeg", ETag: '"etag-1"' },
      })
    );

    const res = await proxyProductImagesRequest(new Request(IMAGE_URL));

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(PRODUCT_IMAGE_CACHE_CONTROL);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("ETag")).toBe('"etag-1"');
    expect(await res.text()).toBe("jpeg-bytes");
  });

  it("does not let a missing image be cached", async () => {
    stubUpstream(new Response("not found", { status: 404 }));

    const res = await proxyProductImagesRequest(new Request(IMAGE_URL));

    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBeNull();
  });
});
