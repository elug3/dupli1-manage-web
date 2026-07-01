/** Gateway prefixes (Vite dev proxy strips these before forwarding to the gateway). */
export const AUTH_PREFIX = "/auth";
export const PRODUCT_PREFIX = "/product";
export const INVENTORY_PREFIX = "/inventory";
export const ORDER_PREFIX = "/order";

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
