const DEFAULT_GATEWAY_URL = "http://localhost:8080";

const GATEWAY_PREFIXES = [
  "/auth",
  "/product",
  "/inventory",
  "/order",
  "/notification",
] as const;

function gatewayBase(): string {
  return (
    process.env.DUPLI1_GATEWAY_URL ??
    process.env.DUPLI1_API_BASE_URL ??
    DEFAULT_GATEWAY_URL
  ).replace(/\/$/, "");
}

/**
 * Proxy MinIO/S3 image GETs via the API gateway (`/product-images/…`).
 * Path is forwarded unchanged (unlike service prefixes that strip `/product` etc.).
 */
export async function proxyProductImagesRequest(
  request: Request
): Promise<Response> {
  const requestUrl = new URL(request.url);
  if (!requestUrl.pathname.startsWith("/product-images/")) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const upstream = new URL(
    `${requestUrl.pathname}${requestUrl.search}`,
    `${gatewayBase()}/`
  );

  // Forward the validators too, so a browser holding the image gets a 304
  // instead of the whole file again.
  const headers = new Headers();
  for (const name of FORWARDED_IMAGE_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const res = await fetch(upstream, {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers,
  });
  if (res.status !== 200 && res.status !== 304) return res;

  // Object keys end in an upload UUID (or its `.w600.jpg` sibling) and are
  // never rewritten in place, so the browser may keep them indefinitely.
  // Storage sends no Cache-Control, which otherwise leaves caching to the
  // browser's heuristics.
  const out = new Headers(res.headers);
  out.set("Cache-Control", PRODUCT_IMAGE_CACHE_CONTROL);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: out,
  });
}

const FORWARDED_IMAGE_REQUEST_HEADERS = [
  "Accept",
  "If-None-Match",
  "If-Modified-Since",
] as const;

export const PRODUCT_IMAGE_CACHE_CONTROL =
  "public, max-age=31536000, immutable";

export function gatewayRelativePath(pathname: string): string | null {
  for (const prefix of GATEWAY_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      const stripped = pathname.slice(prefix.length);
      return stripped.startsWith("/") ? stripped : `/${stripped}`;
    }
  }
  return null;
}

/** Proxy a gateway-prefix request to the upstream API (mirrors Vite dev proxy). */
export async function proxyGatewayRequestForPath(
  request: Request,
  gatewayPathname: string,
  accessToken?: string,
  /** Pre-buffered body for retries — Request streams can only be read once. */
  body?: ArrayBuffer
): Promise<Response> {
  const path = gatewayRelativePath(gatewayPathname);
  if (!path) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const requestUrl = new URL(request.url);
  const upstream = new URL(path, `${gatewayBase()}/`);
  upstream.search = requestUrl.search;

  const headers = new Headers();
  const authorization =
    accessToken != null
      ? `Bearer ${accessToken}`
      : request.headers.get("Authorization");
  if (authorization) headers.set("Authorization", authorization);

  const contentType = request.headers.get("Content-Type");
  if (contentType) headers.set("Content-Type", contentType);

  headers.set("Accept", request.headers.get("Accept") ?? "application/json");

  // Server-sent event streams resume from their cursor after a reconnect. The
  // header set is rebuilt from scratch above, so without this the upstream
  // cannot tell what the client already saw and replay is silently lost.
  const lastEventId = request.headers.get("Last-Event-ID");
  if (lastEventId) headers.set("Last-Event-ID", lastEventId);

  // Video playback (order inspection videos) seeks with byte ranges; without
  // these a player gets the whole file every time and Safari will not play.
  for (const name of ["Range", "If-Range"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const payload =
    hasBody ? (body ?? (await request.arrayBuffer())) : undefined;

  return fetch(upstream, {
    method: request.method,
    headers,
    body: payload,
  });
}

/** Proxy browser gateway-prefix requests to the upstream API (mirrors Vite dev proxy). */
export async function proxyGatewayRequest(request: Request): Promise<Response> {
  return proxyGatewayRequestForPath(request, new URL(request.url).pathname);
}
