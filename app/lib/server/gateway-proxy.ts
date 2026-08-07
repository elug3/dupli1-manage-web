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

  const headers = new Headers();
  const accept = request.headers.get("Accept");
  if (accept) headers.set("Accept", accept);

  return fetch(upstream, {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers,
  });
}

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
