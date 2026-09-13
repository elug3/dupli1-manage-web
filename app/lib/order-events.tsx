import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ORDER_PREFIX } from "~/lib/gateway";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";
import type { Order } from "~/lib/api";

/**
 * Live order feed (`GET /order/api/v1/orders/events`, Server-Sent Events).
 *
 * The stream goes through the session gateway like every other API call, so the
 * browser authenticates with the httpOnly `dupli1_sid` cookie and never holds a
 * token. That is also why this uses SSE rather than a WebSocket: the BFF proxies
 * with `fetch`, which cannot perform an HTTP upgrade, and the browser WebSocket
 * API cannot send an Authorization header.
 */
const ORDER_EVENTS_URL = `/auth/session/gateway${ORDER_PREFIX}/api/v1/orders/events`;

/** Order subjects the backend relays (see shared/pkg/events). */
export type OrderEventType =
  | "order.created"
  | "order.paid"
  | "order.status_updated";

interface OrderEventPayload {
  type: OrderEventType;
  /** Same representation as `GET /orders/{id}` — no follow-up fetch needed. */
  order: Order;
}

export type OrderStreamStatus = "connecting" | "live" | "offline";

/** Manual reconnects after a hard rejection, before giving up. */
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_MS = 1000;

export interface UseOrderEventsOptions {
  /** An order changed; `order` is the authoritative snapshot. */
  onOrder: (order: Order, type: OrderEventType) => void;
  /** The stream cannot prove continuity — reload the list from REST. */
  onResync: () => void;
  /** Hold off connecting (e.g. until the first list load has finished). */
  enabled?: boolean;
}

function parseOrderEvent(data: string): OrderEventPayload | null {
  try {
    const parsed = JSON.parse(data) as OrderEventPayload;
    return parsed?.order?.id ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Subscribe to order changes for as long as the component is mounted.
 *
 * Reconnects come in two flavours. When the browser retries by itself it keeps
 * its `Last-Event-ID`, and the server replays what was missed or asks for a
 * resync. When the response was not a stream at all (403, 503, a deploy without
 * the endpoint) EventSource gives up permanently, so this rebuilds the
 * connection with backoff — a new EventSource starts with no cursor, so those
 * reconnects resync instead of replaying.
 *
 * Deliberately no auth handling here. EventSource cannot expose a status code,
 * so a permanently-closed stream is indistinguishable from an expired session,
 * and refreshing on the guess is actively harmful: auth rotates refresh tokens,
 * so a needless exchange spends the session's token and logs the operator out
 * over a stream that merely 404'd. The resync each reconnect performs goes
 * through `authedFetch`, which handles a real 401 properly.
 */
export function useOrderEvents({
  onOrder,
  onResync,
  enabled = true,
}: UseOrderEventsOptions): OrderStreamStatus {
  const [status, setStatus] = useState<OrderStreamStatus>("connecting");

  // Callbacks are usually inline, so keep them in refs: depending on them would
  // tear down and rebuild the stream on every render.
  const onOrderRef = useRef(onOrder);
  const onResyncRef = useRef(onResync);
  useEffect(() => {
    onOrderRef.current = onOrder;
    onResyncRef.current = onResync;
  }, [onOrder, onResync]);

  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;

    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let stopped = false;

    const connect = (resync: boolean) => {
      if (stopped) return;
      if (resync) onResyncRef.current();

      const stream = new EventSource(ORDER_EVENTS_URL, {
        withCredentials: true,
      });
      source = stream;
      setStatus("connecting");

      stream.onopen = () => {
        attempts = 0;
        setStatus("live");
      };

      stream.addEventListener("order", (event) => {
        const payload = parseOrderEvent((event as MessageEvent<string>).data);
        if (payload) onOrderRef.current(payload.order, payload.type);
      });

      stream.addEventListener("reset", () => onResyncRef.current());

      stream.onerror = () => {
        if (stopped) return;

        // Still CONNECTING: the browser is retrying on its own and will resume
        // from its cursor. Leave it alone.
        if (stream.readyState !== EventSource.CLOSED) {
          setStatus("connecting");
          return;
        }

        stream.close();
        if (attempts >= MAX_RECONNECT_ATTEMPTS) {
          setStatus("offline");
          return;
        }
        const delay = RECONNECT_BASE_MS * 2 ** attempts;
        attempts += 1;
        setStatus("connecting");
        retryTimer = setTimeout(() => connect(true), delay);
      };
    };

    connect(false);

    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
    };
  }, [enabled]);

  return status;
}

// ── Shared feed ──────────────────────────────────────────────────────────────

/** What a page wants to hear from the shared feed. */
export interface OrderFeedListener {
  onOrder?: (order: Order, type: OrderEventType) => void;
  onResync?: () => void;
}

interface OrderFeedValue {
  status: OrderStreamStatus;
  subscribe: (listener: OrderFeedListener) => () => void;
}

const OrderFeedContext = createContext<OrderFeedValue | null>(null);

/**
 * Owns the one order stream for the whole admin console and raises a
 * notification for each new or paid order.
 *
 * Mounted in the admin layout rather than in a page so that (a) an operator
 * hears about a new order wherever they are in the console, not only on
 * /orders, and (b) there is a single connection per tab that survives
 * navigation — browsers cap concurrent connections per origin, and pages each
 * opening their own stream would spend that budget for nothing.
 */
export function OrderFeedProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { notify } = useNotify();
  const listeners = useRef(new Set<OrderFeedListener>());

  const handleOrder = useCallback(
    (order: Order, type: OrderEventType) => {
      if (type === "order.created") {
        notify(t("orders.liveNewOrder", { id: order.id }));
      } else if (type === "order.paid") {
        notify(t("orders.liveOrderPaid", { id: order.id }));
      }
      // order.status_updated is normally the operator's own ship or cancel,
      // which already raises its own toast — pass it on without notifying.
      for (const listener of listeners.current) listener.onOrder?.(order, type);
    },
    [notify, t]
  );

  const handleResync = useCallback(() => {
    for (const listener of listeners.current) listener.onResync?.();
  }, []);

  const status = useOrderEvents({
    onOrder: handleOrder,
    onResync: handleResync,
  });

  const subscribe = useCallback((listener: OrderFeedListener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const value = useMemo(() => ({ status, subscribe }), [status, subscribe]);

  return (
    <OrderFeedContext.Provider value={value}>
      {children}
    </OrderFeedContext.Provider>
  );
}

/**
 * Listen to the shared order feed for as long as `enabled` is true, and report
 * the connection state. Pages hold their own lists, so they gate on `enabled`
 * until their first load has landed — a snapshot merged into an empty list
 * would render as the only row there is.
 */
export function useOrderFeed(
  listener: OrderFeedListener,
  enabled = true
): OrderStreamStatus {
  const feed = useContext(OrderFeedContext);
  if (!feed) {
    throw new Error("useOrderFeed must be used within OrderFeedProvider");
  }

  const listenerRef = useRef(listener);
  useEffect(() => {
    listenerRef.current = listener;
  }, [listener]);

  const { subscribe } = feed;
  useEffect(() => {
    if (!enabled) return;
    return subscribe({
      onOrder: (order, type) => listenerRef.current.onOrder?.(order, type),
      onResync: () => listenerRef.current.onResync?.(),
    });
  }, [subscribe, enabled]);

  return feed.status;
}

/** Newest first, matching the order `getOrders` returns. */
function byNewestFirst(a: Order, b: Order): number {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

/**
 * Fold a streamed snapshot into a list: replace the row if it is already there,
 * otherwise insert it. Idempotent, so a replayed or duplicated event is safe.
 */
export function mergeOrder(orders: Order[], incoming: Order): Order[] {
  const existing = orders.findIndex((order) => order.id === incoming.id);
  if (existing === -1) {
    return [incoming, ...orders].sort(byNewestFirst);
  }
  const next = orders.slice();
  next[existing] = incoming;
  return next;
}
