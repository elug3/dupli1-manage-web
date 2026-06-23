const DEFAULT_API_URL = "http://localhost:8080";

export function backendUrl(path: string): string {
  const base = (process.env.SCHICK_API_URL ?? DEFAULT_API_URL).replace(
    /\/$/,
    ""
  );
  return `${base}${path}`;
}

export async function backendPost(
  path: string,
  body: unknown
): Promise<Response> {
  return fetch(backendUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
