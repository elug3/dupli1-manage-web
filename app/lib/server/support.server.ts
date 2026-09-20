/**
 * Server-only support (consultation inbox) API helpers.
 *
 * Called from loaders/actions so the browser never talks to `/support/…`
 * directly, exactly as the Telegram tab does. A shopper's transcript is
 * customer data: it is fetched with the operator's own access token and
 * rendered server-side, never exposed as a browser-callable endpoint.
 */
import { redirect } from "react-router";
import { accessTokenFromSession } from "./auth-session";

const DEFAULT_GATEWAY_URL = "http://localhost:8080";
const INQUIRIES_PATH = "/api/v1/support/inquiries";

export type SupportMessage = {
  id: string;
  direction: "inbound" | "outbound";
  author?: string;
  body: string;
  /** Outbound only: "sent", or "failed" when the shopper never received it. */
  delivery?: string;
  delivery_error?: string;
  created_at: string;
};

export type SupportInquiry = {
  id: string;
  topic: string;
  status: "open" | "assigned" | "answered" | "closed";
  assigned_to?: string;
  language?: string;
  username?: string;
  entry_context?: string;
  last_message?: string;
  opened_at: string;
  closed_at?: string;
  transcript?: SupportMessage[];
};

/** The inbox's three lists. */
export type SupportQueue = "waiting" | "mine" | "closed";

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

async function supportFetch(
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

  const tokenResult = await accessTokenFromSession(request);
  if (tokenResult instanceof Response) throw redirect("/login");
  headers.set("Authorization", `Bearer ${tokenResult.accessToken}`);

  const res = await fetch(url, { ...init, headers });
  if (res.status !== 401) return res;

  // Token may have been revoked mid-request — force refresh once, as the BFF does.
  const refreshed = await accessTokenFromSession(request, { forceRefresh: true });
  if (refreshed instanceof Response) throw redirect("/login");
  headers.set("Authorization", `Bearer ${refreshed.accessToken}`);
  return fetch(url, { ...init, headers });
}

function queueQuery(queue: SupportQueue): string {
  switch (queue) {
    case "mine":
      // `me` resolves to the caller server-side, so the console never needs to
      // know its own user id.
      return "?assigned_to=me";
    case "closed":
      return "?status=closed";
    default:
      return "?queue=waiting";
  }
}

export async function loadInquiries(
  request: Request,
  queue: SupportQueue
): Promise<SupportInquiry[]> {
  const res = await supportFetch(request, `${INQUIRIES_PATH}${queueQuery(queue)}`);
  if (!res.ok) {
    throw new Error(await readError(res, "Failed to load consultations"));
  }
  const body = (await res.json()) as { inquiries?: SupportInquiry[] | null };
  return Array.isArray(body.inquiries) ? body.inquiries : [];
}

export async function loadInquiry(
  request: Request,
  id: string
): Promise<SupportInquiry> {
  const res = await supportFetch(request, `${INQUIRIES_PATH}/${encodeURIComponent(id)}`);
  if (!res.ok) {
    throw new Error(await readError(res, "Failed to load the consultation"));
  }
  const body = (await res.json()) as { inquiry: SupportInquiry };
  return body.inquiry;
}

export async function claimInquiry(
  request: Request,
  id: string
): Promise<SupportInquiry> {
  const res = await supportFetch(
    request,
    `${INQUIRIES_PATH}/${encodeURIComponent(id)}/assign`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to claim"));
  const body = (await res.json()) as { inquiry: SupportInquiry };
  return body.inquiry;
}

export type ReplyResult = {
  inquiry: SupportInquiry;
  /** False when the shopper never received it — shown as 미전송. */
  delivered: boolean;
};

export async function replyToInquiry(
  request: Request,
  id: string,
  body: string
): Promise<ReplyResult> {
  const res = await supportFetch(
    request,
    `${INQUIRIES_PATH}/${encodeURIComponent(id)}/reply`,
    { method: "POST", body: JSON.stringify({ body }) }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to send the reply"));
  const payload = (await res.json()) as ReplyResult;
  return payload;
}

export async function closeInquiry(
  request: Request,
  id: string
): Promise<SupportInquiry> {
  const res = await supportFetch(
    request,
    `${INQUIRIES_PATH}/${encodeURIComponent(id)}/close`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to close"));
  const body = (await res.json()) as { inquiry: SupportInquiry };
  return body.inquiry;
}
