/**
 * Server-only payment kill switch helpers (backend
 * docs/payment-kill-switches.md). Called from the `/kill-switches` loader and
 * action with the operator's own token, like the Telegram and support pages.
 */
import { redirect } from "react-router";
import type { KillSwitch, PaymentMethodStatus } from "~/lib/api";
import { accessTokenFromSession } from "./auth-session";

const DEFAULT_GATEWAY_URL = "http://localhost:8080";

const KILL_SWITCHES_PATH = "/api/v1/payments/kill-switches";
const METHODS_PATH = "/api/v1/payments/methods";

function gatewayBase(): string {
  return (
    process.env.DUPLI1_GATEWAY_URL ??
    process.env.DUPLI1_API_BASE_URL ??
    DEFAULT_GATEWAY_URL
  ).replace(/\/$/, "");
}

/** Error carrying the upstream status, so the page can tell 403 from an outage. */
export class KillSwitchError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

async function paymentFetch(
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

  const token = await accessTokenFromSession(request);
  if (token instanceof Response) throw redirect("/login");
  headers.set("Authorization", `Bearer ${token.accessToken}`);

  const res = await fetch(url, { ...init, headers });
  if (res.status !== 401) return res;

  // Token may have been revoked mid-request — force refresh once, same as BFF.
  const refreshed = await accessTokenFromSession(request, {
    forceRefresh: true,
  });
  if (refreshed instanceof Response) throw redirect("/login");
  headers.set("Authorization", `Bearer ${refreshed.accessToken}`);
  return fetch(url, { ...init, headers });
}

export async function loadKillSwitches(request: Request): Promise<KillSwitch[]> {
  const res = await paymentFetch(request, KILL_SWITCHES_PATH);
  if (!res.ok) {
    throw new KillSwitchError(
      await readError(res, "Failed to load kill switches"),
      res.status
    );
  }
  const body = (await res.json()) as { kill_switches?: KillSwitch[] | null };
  return Array.isArray(body.kill_switches) ? body.kill_switches : [];
}

/**
 * What checkout sees right now. Public on the payment service; `null` when it
 * cannot be read, which the page shows as "unknown" rather than an error.
 */
export async function loadPaymentMethods(): Promise<PaymentMethodStatus[] | null> {
  try {
    const res = await fetch(`${gatewayBase()}${METHODS_PATH}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { methods?: PaymentMethodStatus[] | null };
    return Array.isArray(body.methods) ? body.methods : null;
  } catch {
    return null;
  }
}

export interface KillSwitchUpdate {
  engaged: boolean;
  message?: string;
  reason?: string;
}

export async function setKillSwitchServer(
  request: Request,
  key: string,
  update: KillSwitchUpdate
): Promise<KillSwitch> {
  const res = await paymentFetch(
    request,
    `${KILL_SWITCHES_PATH}/${encodeURIComponent(key)}`,
    { method: "PUT", body: JSON.stringify(update) }
  );
  if (!res.ok) {
    throw new KillSwitchError(
      await readError(res, "Failed to update kill switch"),
      res.status
    );
  }
  return res.json() as Promise<KillSwitch>;
}
