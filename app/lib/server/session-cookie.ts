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

function cookieAttributes(maxAge: number): string {
  const parts = [
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function setSessionCookieHeader(sessionId: string): string {
  return `${SESSION_COOKIE}=${sessionId}; ${cookieAttributes(SESSION_MAX_AGE)}`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; ${cookieAttributes(0)}`;
}
