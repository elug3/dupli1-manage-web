import type { Order } from "~/lib/api";

/**
 * In-tab channel for orders this console just changed (confirm, ship, cancel
 * approve/reject, status update). The order service does not push changes
 * back yet, so without this the header badge would only notice an operator's
 * own action on its next refresh. `OrderFeedProvider` relays each update to
 * its listeners exactly like a streamed `order.status_updated` snapshot.
 */
type Listener = (order: Order) => void;

const listeners = new Set<Listener>();

export function publishOrderUpdate(order: Order): void {
  for (const listener of listeners) listener(order);
}

export function subscribeOrderUpdates(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
