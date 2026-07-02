const DEFAULT_GATEWAY_URL = "http://localhost:8080";
const GATEWAY_PREFIXES = ["/auth", "/product", "/inventory", "/order"];
function gatewayBase() {
    return (process.env.DUPLI1_GATEWAY_URL ??
        process.env.DUPLI1_API_BASE_URL ??
        DEFAULT_GATEWAY_URL).replace(/\/$/, "");
}
export function gatewayRelativePath(pathname) {
    for (const prefix of GATEWAY_PREFIXES) {
        if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
            const stripped = pathname.slice(prefix.length);
            return stripped.startsWith("/") ? stripped : `/${stripped}`;
        }
    }
    return null;
}
/** Proxy a gateway-prefix request to the upstream API (mirrors Vite dev proxy). */
export async function proxyGatewayRequestForPath(request, gatewayPathname, accessToken) {
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
    const authorization = accessToken != null
        ? `Bearer ${accessToken}`
        : request.headers.get("Authorization");
    if (authorization)
        headers.set("Authorization", authorization);
    const contentType = request.headers.get("Content-Type");
    if (contentType)
        headers.set("Content-Type", contentType);
    headers.set("Accept", request.headers.get("Accept") ?? "application/json");
    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    return fetch(upstream, {
        method: request.method,
        headers,
        body: hasBody ? await request.arrayBuffer() : undefined,
    });
}
/** Proxy browser gateway-prefix requests to the upstream API (mirrors Vite dev proxy). */
export async function proxyGatewayRequest(request) {
    return proxyGatewayRequestForPath(request, new URL(request.url).pathname);
}
