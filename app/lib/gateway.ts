/** Gateway prefixes (Vite dev proxy strips these before forwarding to the gateway). */
export const AUTH_PREFIX = "/auth";
export const PRODUCT_PREFIX = "/product";
export const INVENTORY_PREFIX = "/inventory";
export const ORDER_PREFIX = "/order";
export const NOTIFICATION_PREFIX = "/notification";
/** Payment (points ledger). Reached only through the session gateway. */
export const PAYMENT_PREFIX = "/payment";

export function authPath(path: string): string {
  return `${AUTH_PREFIX}${path}`;
}

export function productPath(path: string): string {
  return `${PRODUCT_PREFIX}${path}`;
}

export function inventoryPath(path: string): string {
  return `${INVENTORY_PREFIX}${path}`;
}

export function orderPath(path: string): string {
  return `${ORDER_PREFIX}${path}`;
}

export function notificationPath(path: string): string {
  return `${NOTIFICATION_PREFIX}${path}`;
}

export function paymentPath(path: string): string {
  return `${PAYMENT_PREFIX}${path}`;
}
