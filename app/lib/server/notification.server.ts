/**
 * Server-only Telegram / notification API helpers.
 * Call these from loaders/actions so the browser never hits `/notification/…`.
 */
import { redirect } from "react-router";
import type {
  NotificationSettings,
  TelegramAlertFlags,
  TelegramSubscription,
  TelegramSubscriptionInput,
} from "~/lib/api";
import { accessTokenFromSession } from "./auth-session";

const DEFAULT_GATEWAY_URL = "http://localhost:8080";

const SUBSCRIPTIONS_PATH = "/api/v1/notification/telegram/subscriptions";
const SETTINGS_PATH = "/api/v1/notification/settings";

function gatewayBase(): string {
  return (
    process.env.DUPLI1_GATEWAY_URL ??
    process.env.DUPLI1_API_BASE_URL ??
    DEFAULT_GATEWAY_URL
  ).replace(/\/$/, "");
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

async function requireAccessToken(request: Request): Promise<string> {
  const tokenResult = await accessTokenFromSession(request);
  if (tokenResult instanceof Response) {
    throw redirect("/login");
  }
  return tokenResult.accessToken;
}

/** Authenticated fetch to the notification service via the nginx gateway. */
async function notificationFetch(
  request: Request,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const url = `${gatewayBase()}${path}`;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let accessToken = await requireAccessToken(request);
  headers.set("Authorization", `Bearer ${accessToken}`);

  let res = await fetch(url, { ...init, headers });
  if (res.status !== 401) return res;

  // Token may have been revoked mid-request — force refresh once, same as BFF.
  const refreshed = await accessTokenFromSession(request, {
    forceRefresh: true,
  });
  if (refreshed instanceof Response) {
    throw redirect("/login");
  }
  accessToken = refreshed.accessToken;
  headers.set("Authorization", `Bearer ${accessToken}`);
  return fetch(url, { ...init, headers });
}

function parseSubscriptions(data: unknown): TelegramSubscription[] {
  const items = (data as { items?: TelegramSubscription[] | null })?.items;
  return Array.isArray(items) ? items : [];
}

export async function loadTelegramSubscriptions(
  request: Request
): Promise<TelegramSubscription[]> {
  const res = await notificationFetch(request, SUBSCRIPTIONS_PATH);
  if (!res.ok) {
    throw new Error(
      await readError(res, "Failed to load Telegram subscriptions")
    );
  }
  return parseSubscriptions(await res.json());
}

/** Settings is public; still server-side so the browser does not call notification. */
export async function loadNotificationSettings(
  request: Request
): Promise<NotificationSettings | null> {
  try {
    // Prefer unauthenticated GET; fall back to session token if gateway requires it.
    const url = `${gatewayBase()}${SETTINGS_PATH}`;
    let res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.status === 401 || res.status === 403) {
      res = await notificationFetch(request, SETTINGS_PATH);
    }
    if (!res.ok) return null;
    return (await res.json()) as NotificationSettings;
  } catch {
    return null;
  }
}

export async function createTelegramSubscriptionServer(
  request: Request,
  input: TelegramSubscriptionInput
): Promise<TelegramSubscription> {
  const res = await notificationFetch(request, SUBSCRIPTIONS_PATH, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(
      await readError(res, "Failed to add Telegram subscription")
    );
  }
  return res.json() as Promise<TelegramSubscription>;
}

export async function acceptTelegramSubscriptionServer(
  request: Request,
  id: string,
  alerts: TelegramAlertFlags
): Promise<TelegramSubscription> {
  const res = await notificationFetch(
    request,
    `${SUBSCRIPTIONS_PATH}/${encodeURIComponent(id)}/accept`,
    { method: "POST", body: JSON.stringify(alerts) }
  );
  if (!res.ok) {
    throw new Error(
      await readError(res, "Failed to accept Telegram subscription")
    );
  }
  return res.json() as Promise<TelegramSubscription>;
}

export async function rejectTelegramSubscriptionServer(
  request: Request,
  id: string
): Promise<TelegramSubscription> {
  const res = await notificationFetch(
    request,
    `${SUBSCRIPTIONS_PATH}/${encodeURIComponent(id)}/reject`,
    { method: "POST" }
  );
  if (!res.ok) {
    throw new Error(
      await readError(res, "Failed to reject Telegram subscription")
    );
  }
  return res.json() as Promise<TelegramSubscription>;
}

export async function deleteTelegramSubscriptionServer(
  request: Request,
  id: string
): Promise<void> {
  const res = await notificationFetch(
    request,
    `${SUBSCRIPTIONS_PATH}/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
  if (!res.ok) {
    throw new Error(
      await readError(res, "Failed to remove Telegram subscription")
    );
  }
}
