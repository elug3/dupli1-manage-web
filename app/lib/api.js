import { authedFetch } from "./auth";
import {
  authPath,
  inventoryPath,
  orderPath,
  productPath
} from "./gateway";
function hitId(hit, index) {
  const id = hit.id ?? hit.sku ?? hit.title;
  return typeof id === "string" ? id : `item-${index}`;
}
function hitName(hit) {
  const name = hit.name ?? hit.title ?? hit.sku;
  return typeof name === "string" ? name : "Untitled";
}
function hitNumber(hit, key) {
  const value = hit[key];
  return typeof value === "number" ? value : void 0;
}
function hitString(hit, key) {
  const value = hit[key];
  return typeof value === "string" ? value : void 0;
}
function hitStringArray(hit, key) {
  const value = hit[key];
  if (!Array.isArray(value)) return void 0;
  const strings = value.filter((v) => typeof v === "string");
  return strings.length > 0 ? strings : void 0;
}
function hitStringMap(hit, key) {
  const value = hit[key];
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return void 0;
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof k === "string" && typeof v === "string") {
      out[k] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : void 0;
}
const MAX_PRODUCT_ATTRIBUTES = 32;
const MAX_ATTRIBUTE_KEY_LEN = 64;
const MAX_ATTRIBUTE_VALUE_LEN = 512;
function attributesFromRows(rows) {
  const out = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    out[key] = row.value.trim();
  }
  return out;
}
function attributeRowsFromMap(attrs) {
  if (!attrs) return [];
  return Object.entries(attrs).map(([key, value]) => ({ key, value }));
}
function mapVariant(hit) {
  const sku = hitString(hit, "sku") ?? hitString(hit, "id") ?? "unknown-sku";
  return {
    skuId: hitString(hit, "skuId") ?? hitString(hit, "sku_id"),
    sku,
    productId: hitString(hit, "product_id") ?? hitString(hit, "productId"),
    color: hitString(hit, "color") ?? "",
    size: hitString(hit, "size") ?? "",
    colorCode: hitString(hit, "colorCode") ?? hitString(hit, "color_code"),
    sizeCode: hitString(hit, "sizeCode") ?? hitString(hit, "size_code"),
    editionCode: hitString(hit, "editionCode") ?? hitString(hit, "edition_code"),
    officialPrice: hitNumber(hit, "officialPrice") ?? hitNumber(hit, "official_price") ?? hitNumber(hit, "sellingPrice") ?? hitNumber(hit, "selling_price"),
    price: hitNumber(hit, "price") ?? 0,
    status: hitString(hit, "status") ?? "active",
    imageUrls: hitStringArray(hit, "imageUrls") ?? [],
    inStock: typeof hit.inStock === "boolean" ? hit.inStock : typeof hit.in_stock === "boolean" ? hit.in_stock : void 0,
    raw: hit
  };
}
function mapVariantsFromHit(hit) {
  const raw = hit.variants;
  if (!Array.isArray(raw) || raw.length === 0) return void 0;
  return raw.filter((v) => v != null && typeof v === "object").map((v) => mapVariant(v));
}
function legacyVariantFromProduct(product) {
  return {
    sku: product.sku ?? product.id,
    productId: product.id,
    color: product.color ?? "",
    size: "",
    officialPrice: product.officialPrice,
    price: product.price ?? 0,
    status: product.status ?? "active",
    imageUrls: product.imageUrls ?? [],
    raw: product.raw
  };
}
function productVariants(product) {
  if (product.variants && product.variants.length > 0) {
    return product.variants;
  }
  return [legacyVariantFromProduct(product)];
}
function findVariant(product, skuIdOrSku) {
  const variants = productVariants(product);
  return variants.find((v) => v.skuId === skuIdOrSku) ?? variants.find((v) => v.sku === skuIdOrSku);
}
function productSkuPath(productId, skuIdOrSku) {
  return `/products/${encodeURIComponent(productId)}/SKU/${encodeURIComponent(skuIdOrSku)}`;
}
function formatVariantOption(variant) {
  const parts = [variant.color, variant.size].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : variant.sku;
}
function formatProductColors(product) {
  if (product.availableColors && product.availableColors.length > 0) {
    return product.availableColors.join(", ");
  }
  if (product.color) return product.color;
  return "\u2014";
}
function productVariantCount(product) {
  if (product.variants && product.variants.length > 0) {
    return product.variants.length;
  }
  return 1;
}
function productListPrice(product) {
  if (product.price == null) return null;
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(product.price);
}
function productImageSrc(url) {
  if (!url || url.startsWith("/")) return url;
  try {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith("/product-images/")) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
  }
  return url;
}
function productPreviewImage(product) {
  let url = null;
  if (product.defaultImageUrl) url = product.defaultImageUrl;
  else if (product.imageUrls && product.imageUrls.length > 0) {
    url = product.imageUrls[0];
  } else {
    for (const variant of productVariants(product)) {
      if (variant.imageUrls.length > 0) {
        url = variant.imageUrls[0];
        break;
      }
    }
  }
  return url ? productImageSrc(url) : null;
}
function buildVariantSkuIndex(products) {
  const index = /* @__PURE__ */ new Map();
  for (const product of products) {
    for (const variant of productVariants(product)) {
      index.set(variant.sku, {
        productId: product.id,
        productName: product.name,
        color: variant.color,
        size: variant.size
      });
    }
  }
  return index;
}
function formatOrderItemVariant(sku, lookup) {
  const ctx = lookup.get(sku);
  if (!ctx) return null;
  const option = [ctx.color, ctx.size].filter(Boolean).join(" / ");
  return option || null;
}
function mapProduct(hit, category, index = 0) {
  const variants = mapVariantsFromHit(hit);
  const defaultImageUrl = hitString(hit, "defaultImageUrl") ?? hitString(hit, "default_image_url") ?? variants?.[0]?.imageUrls[0];
  return {
    id: hitId(hit, index),
    name: hitName(hit),
    category: category ?? hitString(hit, "category") ?? "bags",
    price: hitNumber(hit, "price") ?? hitNumber(hit, "priceFrom") ?? hitNumber(hit, "price_from") ?? hitNumber(hit, "unit_price_cents"),
    officialPrice: hitNumber(hit, "officialPrice") ?? hitNumber(hit, "official_price") ?? hitNumber(hit, "sellingPrice") ?? hitNumber(hit, "selling_price") ?? hitNumber(hit, "sellingPriceFrom") ?? hitNumber(hit, "selling_price_from"),
    stock: hitNumber(hit, "stock") ?? hitNumber(hit, "quantity"),
    description: hitString(hit, "description"),
    brand: hitString(hit, "brand"),
    brandCode: hitString(hit, "brandCode") ?? hitString(hit, "brand_code"),
    styleCode: hitString(hit, "styleCode") ?? hitString(hit, "style_code"),
    subCategory: hitString(hit, "subCategory") ?? hitString(hit, "sub_category"),
    style: hitString(hit, "style") ?? hitString(hit, "bag_style"),
    target: hitString(hit, "target"),
    attributes: hitStringMap(hit, "attributes"),
    color: hitString(hit, "color"),
    material: hitString(hit, "material"),
    sku: hitString(hit, "sku") ?? hitString(hit, "id"),
    status: hitString(hit, "status"),
    imageUrls: hitStringArray(hit, "imageUrls") ?? (defaultImageUrl ? [defaultImageUrl] : void 0),
    availableColors: hitStringArray(hit, "availableColors") ?? hitStringArray(hit, "available_colors"),
    availableSizes: hitStringArray(hit, "availableSizes") ?? hitStringArray(hit, "available_sizes"),
    defaultImageUrl,
    variants,
    raw: hit
  };
}
async function readError(res, fallback) {
  try {
    const body = await res.json();
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}
async function searchProducts(query = {}) {
  const params = new URLSearchParams();
  const set = (key, value) => {
    if (value == null) return;
    const text = String(value).trim();
    if (text) params.set(key, text);
  };
  set("q", query.q);
  set("category", query.category);
  set("brand", query.brand);
  set("color", query.color);
  set("size", query.size);
  set("material", query.material);
  set("status", query.status);
  set("sort", query.sort);
  set("order", query.order);
  set("period", query.period);
  set("limit", query.limit);
  set("offset", query.offset);
  const qs = params.toString();
  const res = await authedFetch(
    productPath(`/api/v1/products${qs ? `?${qs}` : ""}`)
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to list products"));
  const data = await res.json();
  const hits = Array.isArray(data.results) ? data.results : [];
  return {
    products: hits.map((hit, i) => mapProduct(hit, void 0, i)),
    total: typeof data.total === "number" ? data.total : hits.length,
    limit: typeof data.limit === "number" ? data.limit : query.limit ?? 50,
    offset: typeof data.offset === "number" ? data.offset : query.offset ?? 0,
    sort: data.sort,
    order: data.order
  };
}
async function listAllProducts(query = {}) {
  const { products } = await searchProducts(query);
  return products;
}
async function getProducts() {
  return listAllProducts();
}
async function getManageProduct(id) {
  try {
    return await getProductDetail(id);
  } catch {
    const all = await listAllProducts();
    const found = all.find((p) => p.id === id || p.sku === id);
    if (!found) throw new Error("Product not found");
    return found;
  }
}
async function getProductDetail(id) {
  const res = await authedFetch(
    productPath(`/api/v1/products/${encodeURIComponent(id)}`)
  );
  if (!res.ok) throw new Error(await readError(res, "Product not found"));
  const hit = await res.json();
  return mapProduct(hit);
}
async function uploadProductImage(id, file) {
  const form = new FormData();
  form.append("image", file);
  const res = await authedFetch(
    productPath(`/api/v1/products/${encodeURIComponent(id)}/images`),
    { method: "POST", body: form }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to upload image"));
  const hit = await res.json();
  return mapProduct(hit);
}
async function uploadVariantImage(productId, sku, file) {
  const form = new FormData();
  form.append("image", file);
  const res = await authedFetch(
    productPath(
      `/api/v1/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(sku)}/images`
    ),
    { method: "POST", body: form }
  );
  if (!res.ok) {
    throw new Error(await readError(res, "Failed to upload variant image"));
  }
  const hit = await res.json();
  return mapVariant(hit);
}
async function createProductParent(input) {
  const res = await authedFetch(productPath("/api/v1/products"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      brandCode: input.brandCode,
      styleCode: input.styleCode,
      brand: input.brand,
      material: input.material,
      category: input.category ?? "bags",
      description: input.description,
      status: input.status ?? "active",
      price: input.price,
      officialPrice: input.officialPrice,
      attributes: input.attributes
    })
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to create product"));
  const hit = await res.json();
  return mapProduct(hit, input.category ?? "bags");
}
async function createVariant(productId, input) {
  const res = await authedFetch(
    productPath(
      `/api/v1/products/${encodeURIComponent(productId)}/variants`
    ),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        colorCode: input.colorCode,
        sizeCode: input.sizeCode,
        editionCode: input.editionCode || void 0,
        color: input.color,
        size: input.size,
        status: input.status ?? "active"
      })
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to create variant"));
  const hit = await res.json();
  return mapVariant(hit);
}
async function updateVariant(productId, sku, input) {
  const res = await authedFetch(
    productPath(
      `/api/v1/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(sku)}`
    ),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to update variant"));
  const hit = await res.json();
  return mapVariant(hit);
}
class LastImageDeleteError extends Error {
  code = "LAST_IMAGE";
  constructor() {
    super("LAST_IMAGE");
    this.name = "LastImageDeleteError";
  }
}
async function deleteVariantImage(productId, sku, imageUrl, currentUrls) {
  const next = currentUrls.filter((url) => url !== imageUrl);
  if (next.length === currentUrls.length) {
    throw new Error("Image not found on variant");
  }
  if (next.length === 0) {
    throw new LastImageDeleteError();
  }
  return updateVariant(productId, sku, { imageUrls: next });
}
async function deleteVariant(productId, sku) {
  const res = await authedFetch(
    productPath(
      `/api/v1/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(sku)}`
    ),
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to delete variant"));
}
async function createBagProduct(input) {
  const res = await authedFetch(productPath("/api/v1/products"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      id: input.id,
      brand: input.brand,
      color: input.color,
      material: input.material,
      category: "bags"
    })
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to create product"));
  const hit = await res.json();
  return mapProduct(hit, "bags");
}
async function updateProduct(id, input) {
  const res = await authedFetch(
    productPath(`/api/v1/products/${encodeURIComponent(id)}`),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to update product"));
  const hit = await res.json();
  return mapProduct(hit);
}
async function deleteProduct(id) {
  const res = await authedFetch(
    productPath(`/api/v1/products/${encodeURIComponent(id)}`),
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to delete product"));
}
async function parseCatalogList(res, fallback) {
  if (!res.ok) throw new Error(await readError(res, fallback));
  const data = await res.json();
  if (Array.isArray(data)) return data;
  return Array.isArray(data.results) ? data.results : [];
}
async function getMasterCatalog() {
  const res = await authedFetch(productPath("/api/v1/catalog/master"));
  if (!res.ok) {
    throw new Error(await readError(res, "Failed to load master catalog"));
  }
  const data = await res.json();
  return {
    subCategories: Array.isArray(data.subCategories) ? data.subCategories : [],
    styles: Array.isArray(data.styles) ? data.styles : [],
    targets: Array.isArray(data.targets) ? data.targets : []
  };
}
async function listBrands() {
  const res = await authedFetch(productPath("/api/v1/catalog/brands"));
  return parseCatalogList(res, "Failed to list brands");
}
async function createBrand(code, name) {
  const res = await authedFetch(productPath("/api/v1/catalog/brands"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, name })
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to create brand"));
  return res.json();
}
async function renameBrand(code, name) {
  const res = await authedFetch(
    productPath(`/api/v1/catalog/brands/${encodeURIComponent(code)}`),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to rename brand"));
  return res.json();
}
async function deleteBrand(code) {
  const res = await authedFetch(
    productPath(`/api/v1/catalog/brands/${encodeURIComponent(code)}`),
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to delete brand"));
}
async function listStyles(brandCode) {
  const res = await authedFetch(
    productPath(
      `/api/v1/catalog/brands/${encodeURIComponent(brandCode)}/styles`
    )
  );
  return parseCatalogList(res, "Failed to list styles");
}
async function createStyle(brandCode, code, name) {
  const res = await authedFetch(
    productPath(
      `/api/v1/catalog/brands/${encodeURIComponent(brandCode)}/styles`
    ),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name })
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to create style"));
  return res.json();
}
async function renameStyle(brandCode, styleCode, name) {
  const res = await authedFetch(
    productPath(
      `/api/v1/catalog/brands/${encodeURIComponent(brandCode)}/styles/${encodeURIComponent(styleCode)}`
    ),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to rename style"));
  return res.json();
}
async function deleteStyle(brandCode, styleCode) {
  const res = await authedFetch(
    productPath(
      `/api/v1/catalog/brands/${encodeURIComponent(brandCode)}/styles/${encodeURIComponent(styleCode)}`
    ),
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to delete style"));
}
async function listColors() {
  const res = await authedFetch(productPath("/api/v1/catalog/colors"));
  return parseCatalogList(res, "Failed to list colors");
}
async function createColor(code, name) {
  const res = await authedFetch(productPath("/api/v1/catalog/colors"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, name })
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to create color"));
  return res.json();
}
async function renameColor(code, name) {
  const res = await authedFetch(
    productPath(`/api/v1/catalog/colors/${encodeURIComponent(code)}`),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to rename color"));
  return res.json();
}
async function deleteColor(code) {
  const res = await authedFetch(
    productPath(`/api/v1/catalog/colors/${encodeURIComponent(code)}`),
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to delete color"));
}
async function listSizes() {
  const res = await authedFetch(productPath("/api/v1/catalog/sizes"));
  return parseCatalogList(res, "Failed to list sizes");
}
async function createSize(code, name) {
  const res = await authedFetch(productPath("/api/v1/catalog/sizes"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, name })
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to create size"));
  return res.json();
}
async function renameSize(code, name) {
  const res = await authedFetch(
    productPath(`/api/v1/catalog/sizes/${encodeURIComponent(code)}`),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to rename size"));
  return res.json();
}
async function deleteSize(code) {
  const res = await authedFetch(
    productPath(`/api/v1/catalog/sizes/${encodeURIComponent(code)}`),
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to delete size"));
}
async function listEditions() {
  const res = await authedFetch(productPath("/api/v1/catalog/editions"));
  return parseCatalogList(res, "Failed to list editions");
}
async function createEdition(code, name) {
  const res = await authedFetch(productPath("/api/v1/catalog/editions"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, name })
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to create edition"));
  return res.json();
}
async function renameEdition(code, name) {
  const res = await authedFetch(
    productPath(`/api/v1/catalog/editions/${encodeURIComponent(code)}`),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to rename edition"));
  return res.json();
}
async function deleteEdition(code) {
  const res = await authedFetch(
    productPath(`/api/v1/catalog/editions/${encodeURIComponent(code)}`),
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to delete edition"));
}
async function getCoupons() {
  const res = await authedFetch(productPath("/api/v1/coupons"));
  if (!res.ok) throw new Error(await readError(res, "Failed to fetch coupons"));
  const data = await res.json();
  return Array.isArray(data.results) ? data.results : [];
}
async function createCoupon(input) {
  const res = await authedFetch(productPath("/api/v1/coupons"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to create coupon"));
  return res.json();
}
async function updateCoupon(code, input) {
  const res = await authedFetch(
    productPath(`/api/v1/coupons/${encodeURIComponent(code)}`),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to update coupon"));
  return res.json();
}
async function deleteCoupon(code) {
  const res = await authedFetch(
    productPath(`/api/v1/coupons/${encodeURIComponent(code)}`),
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to delete coupon"));
}
async function fetchCustomerOrders(customerId) {
  const res = await authedFetch(
    orderPath(`/api/v1/orders?customer_id=${encodeURIComponent(customerId)}`)
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to fetch orders"));
  const data = await res.json();
  return data.orders ?? [];
}
async function getOrders(customerId) {
  if (customerId) {
    return fetchCustomerOrders(customerId);
  }
  const users = await listUsers().catch(() => []);
  if (users.length === 0) return [];
  const batches = await Promise.all(
    users.map(
      (u) => fetchCustomerOrders(u.user_id).catch(() => [])
    )
  );
  const merged = batches.flat();
  merged.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return merged;
}
async function getOrder(id) {
  const res = await authedFetch(orderPath(`/api/v1/orders/${id}`));
  if (!res.ok) throw new Error(await readError(res, "Order not found"));
  return res.json();
}
async function shipOrder(id) {
  const res = await authedFetch(orderPath(`/api/v1/orders/${id}/ship`), {
    method: "POST"
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to ship order"));
  return res.json();
}
async function updateOrderStatus(id, status) {
  const res = await authedFetch(orderPath(`/api/v1/orders/${id}/status`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to update order"));
  return res.json();
}
async function getInventory(sku) {
  const res = await authedFetch(
    inventoryPath(`/api/v1/inventory/${encodeURIComponent(sku)}`)
  );
  if (!res.ok) throw new Error(await readError(res, "Stock item not found"));
  return res.json();
}
async function getInventoryBySkuId(skuId) {
  const res = await authedFetch(
    inventoryPath(
      `/api/v1/inventory/by-sku-id/${encodeURIComponent(skuId)}`
    )
  );
  if (!res.ok) throw new Error(await readError(res, "Stock item not found"));
  return res.json();
}
async function setInventory(sku, quantity) {
  const res = await authedFetch(
    inventoryPath(`/api/v1/inventory/${encodeURIComponent(sku)}`),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity })
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to update stock"));
  return res.json();
}
async function adjustInventory(sku, delta) {
  const res = await authedFetch(
    inventoryPath(`/api/v1/inventory/${encodeURIComponent(sku)}/adjust`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delta })
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to adjust stock"));
  return res.json();
}
async function inventoryQuantityForSku(sku) {
  try {
    const item = await getInventory(sku);
    return item.quantity;
  } catch {
    return null;
  }
}
async function getCatalogStockAlerts() {
  const products = await listAllProducts();
  const rows = [];
  await Promise.all(
    products.flatMap(
      (product) => productVariants(product).map(async (variant) => {
        const quantity = await inventoryQuantityForSku(variant.sku);
        if (quantity == null) return;
        rows.push({
          parentId: product.id,
          parentName: product.name,
          sku: variant.sku,
          color: variant.color,
          size: variant.size,
          quantity,
          available: Math.max(0, quantity)
        });
      })
    )
  );
  return rows.sort((a, b) => a.parentName.localeCompare(b.parentName));
}
const PERMISSION_WILDCARDS = [
  "*",
  "admin.*",
  "product.*",
  "coupon.*",
  "user.*"
];
const PERMISSION_CATALOG = [
  "user.create",
  "user.read",
  "user.permissions.update",
  "user.password.update",
  "user.status.update",
  "product.create",
  "product.update",
  "product.delete",
  "product.read",
  "product.variant.create",
  "product.variant.update",
  "product.variant.delete",
  "product.image.upload",
  "product.master.read",
  "product.master.write",
  "coupon.read",
  "coupon.create",
  "coupon.update",
  "coupon.delete",
  "inventory.stock.read",
  "inventory.stock.write",
  "inventory.reservation.manage",
  "order.create",
  "order.read.all",
  "order.ship",
  "order.status.update",
  "cart.read",
  "payment.create",
  "payment.read.all"
];
const ALL_PERMISSIONS = [
  ...PERMISSION_WILDCARDS,
  ...PERMISSION_CATALOG
];
function normalizeAccountType(value) {
  switch (value) {
    case "manager":
    case "admin":
      return "manager";
    case "service":
      return "service";
    case "customer":
    default:
      return "customer";
  }
}
function toApiAccountType(value) {
  return value;
}
function mapAuthUser(raw) {
  return {
    user_id: typeof raw.user_id === "string" ? raw.user_id : "",
    email: typeof raw.email === "string" ? raw.email : "",
    account_type: normalizeAccountType(
      typeof raw.account_type === "string" ? raw.account_type : void 0
    ),
    permissions: Array.isArray(raw.permissions) ? raw.permissions.filter((p) => typeof p === "string") : [],
    is_active: raw.is_active !== false,
    locked_at: typeof raw.locked_at === "string" ? raw.locked_at : null,
    failed_login_attempts: typeof raw.failed_login_attempts === "number" ? raw.failed_login_attempts : 0
  };
}
function isManagerUser(user) {
  return user.account_type === "manager";
}
function isCustomerUser(user) {
  return user.account_type === "customer";
}
function isServiceUser(user) {
  return user.account_type === "service";
}
function formatPermissions(permissions) {
  return permissions.length > 0 ? permissions.join(", ") : "\u2014";
}
async function listUsers() {
  const res = await authedFetch(authPath("/api/v1/auth/users"));
  if (!res.ok) throw new Error(await readError(res, "Failed to list users"));
  const data = await res.json();
  return (data.users ?? []).map(mapAuthUser);
}
async function getUserById(userId) {
  const users = await listUsers();
  return users.find((user) => user.user_id === userId) ?? null;
}
async function registerUser(email, password) {
  const res = await authedFetch(authPath("/api/v1/auth/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to register user"));
  return res.json();
}
async function setUserPermissions(userId, permissions, accountType) {
  const res = await authedFetch(
    authPath(`/api/v1/auth/users/${encodeURIComponent(userId)}/permissions`),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        accountType ? {
          permissions,
          account_type: toApiAccountType(accountType)
        } : { permissions }
      )
    }
  );
  if (!res.ok)
    throw new Error(await readError(res, "Failed to update permissions"));
  const raw = await res.json();
  return mapAuthUser(raw);
}
async function setUserPassword(userId, password) {
  const res = await authedFetch(
    authPath(`/api/v1/auth/users/${encodeURIComponent(userId)}/password`),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to update password"));
}
async function setUserStatus(userId, isActive) {
  const res = await authedFetch(
    authPath(`/api/v1/auth/users/${encodeURIComponent(userId)}/status`),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: isActive })
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to update status"));
  const raw = await res.json();
  return mapAuthUser(raw);
}
async function getDashboardStats() {
  const [products, orders] = await Promise.all([
    getProducts().catch(() => []),
    getOrders().catch(() => [])
  ]);
  return { productCount: products.length, orderCount: orders.length };
}
async function getAnalytics() {
  const orders = await getOrders();
  if (orders.length === 0) return null;
  const now = Date.now();
  const day = 24 * 60 * 60 * 1e3;
  const within = (days) => (o) => now - new Date(o.created_at).getTime() <= days * day;
  const sumRevenue = (list) => list.reduce((sum, o) => sum + o.total_cents, 0);
  const last7 = orders.filter(within(7));
  const last30 = orders.filter(within(30));
  return {
    revenue7d: sumRevenue(last7),
    revenue30d: sumRevenue(last30),
    orders7d: last7.length,
    orders30d: last30.length
  };
}
export {
  ALL_PERMISSIONS,
  LastImageDeleteError,
  MAX_ATTRIBUTE_KEY_LEN,
  MAX_ATTRIBUTE_VALUE_LEN,
  MAX_PRODUCT_ATTRIBUTES,
  PERMISSION_CATALOG,
  PERMISSION_WILDCARDS,
  adjustInventory,
  attributeRowsFromMap,
  attributesFromRows,
  buildVariantSkuIndex,
  createBagProduct,
  createBrand,
  createColor,
  createCoupon,
  createEdition,
  createProductParent,
  createSize,
  createStyle,
  createVariant,
  deleteBrand,
  deleteColor,
  deleteCoupon,
  deleteEdition,
  deleteProduct,
  deleteSize,
  deleteStyle,
  deleteVariant,
  deleteVariantImage,
  findVariant,
  formatOrderItemVariant,
  formatPermissions,
  formatProductColors,
  formatVariantOption,
  getAnalytics,
  getCatalogStockAlerts,
  getCoupons,
  getDashboardStats,
  getInventory,
  getInventoryBySkuId,
  getManageProduct,
  getMasterCatalog,
  getOrder,
  getOrders,
  getProductDetail,
  getProducts,
  getUserById,
  isCustomerUser,
  isManagerUser,
  isServiceUser,
  legacyVariantFromProduct,
  listAllProducts,
  listBrands,
  listColors,
  listEditions,
  listSizes,
  listStyles,
  listUsers,
  mapProduct,
  normalizeAccountType,
  productImageSrc,
  productListPrice,
  productPreviewImage,
  productSkuPath,
  productVariantCount,
  productVariants,
  registerUser,
  renameBrand,
  renameColor,
  renameEdition,
  renameSize,
  renameStyle,
  searchProducts,
  setInventory,
  setUserPassword,
  setUserPermissions,
  setUserStatus,
  shipOrder,
  toApiAccountType,
  updateCoupon,
  updateOrderStatus,
  updateProduct,
  updateVariant,
  uploadProductImage,
  uploadVariantImage
};
