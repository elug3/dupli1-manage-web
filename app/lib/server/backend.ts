const DEFAULT_GATEWAY_URL = "http://localhost:8080";

const SERVICE_PREFIXES = {
  auth: "/auth",
  product: "/product",
  inventory: "/inventory",
  order: "/order",
} as const;

type Service = keyof typeof SERVICE_PREFIXES;

function gatewayBase(): string {
  return (process.env.SCHICK_GATEWAY_URL ?? DEFAULT_GATEWAY_URL).replace(
    /\/$/,
    ""
  );
}

/** Build a gateway URL; nginx strips the service prefix before proxying upstream. */
export function serviceUrl(service: Service, path: string): string {
  const prefix = SERVICE_PREFIXES[service];
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${gatewayBase()}${prefix}${normalized}`;
}

export async function backendPost(
  service: Service,
  path: string,
  body?: unknown
): Promise<Response> {
  return fetch(serviceUrl(service, path), {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function backendGet(
  service: Service,
  path: string
): Promise<Response> {
  return fetch(serviceUrl(service, path));
}
