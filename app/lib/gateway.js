/** Gateway prefixes (nginx strips these before proxying to upstream services). */
export const AUTH_PREFIX = "/auth";
export const PRODUCT_PREFIX = "/product";
export const INVENTORY_PREFIX = "/inventory";
export const ORDER_PREFIX = "/order";
export function authPath(path) {
    return `${AUTH_PREFIX}${path}`;
}
export function productPath(path) {
    return `${PRODUCT_PREFIX}${path}`;
}
export function inventoryPath(path) {
    return `${INVENTORY_PREFIX}${path}`;
}
export function orderPath(path) {
    return `${ORDER_PREFIX}${path}`;
}
