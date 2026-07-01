export const SESSION_COOKIE = "schick_sid";

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

export function getSessionId(request: Request): string | null {
  const cookie = request.headers.get("Cookie");
  if (!cookie) return null;

  for (const part of cookie.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === SESSION_COOKIE) {
      const value = valueParts.join("=");
      return value || null;
    }
  }

  return null;
}

function isSecureRequest(request?: Request): boolean {
  if (!request) return false;
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() === "https";
  }
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

function cookieAttributes(maxAge: number, request?: Request): string {
  const parts = [
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (isSecureRequest(request)) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function setSessionCookieHeader(
  sessionId: string,
  request?: Request
): string {
  return `${SESSION_COOKIE}=${sessionId}; ${cookieAttributes(SESSION_MAX_AGE, request)}`;
}

export function clearSessionCookieHeader(request?: Request): string {
  return `${SESSION_COOKIE}=; ${cookieAttributes(0, request)}`;
}
