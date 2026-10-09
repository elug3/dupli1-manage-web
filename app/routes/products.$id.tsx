import { Fragment, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  type CatalogCodeName,
  type Product,
  type ProductVariant,
  MAX_ATTRIBUTE_KEY_LEN,
  MAX_ATTRIBUTE_VALUE_LEN,
  MAX_PRODUCT_ATTRIBUTES,
  attributeRowsFromMap,
  attributesFromRows,
  createVariant,
  deleteVariantImage,
  dimensionsEmpty,
  formatDimensionsMm,
  formatVariantOption,
  getInventory,
  getInventoryBySkuId,
  getManageProduct,
  getMasterCatalog,
  listBrands,
  listCategories,
  listColors,
  listEditions,
  listSizes,
  parseDimensionsInput,
  reorderVariantImages,
  productSkuPath,
  productVariants,
  setInventory,
  setInventoryBySkuId,
  updateProduct,
  updateVariant,
  uploadProductImage,
  uploadVariantImage,
} from "~/lib/api";
import {
  type ProductCategory,
  type SizeChartEditorRow,
  type SizeChartMeasurement,
  DEFAULT_CATEGORY,
  MAX_SIZE_CHART_CM,
  MAX_SIZE_CHART_ROWS,
  SIZE_CHART_MEASUREMENTS,
  attributePresetsFor,
  categoryLabel as categoryDisplayName,
  defaultSizeCode,
  filterSizesForCategory,
  findCategory,
  isClothingCategory,
  normalizeCategory,
  sizeChartEditorRows,
  sizeChartFromEditorRows,
} from "~/lib/categories";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";
import { ProductExportButton } from "~/components/ProductExportButton";
import { DangerZone } from "~/components/DeleteConfirmDialog";
import { ImageGalleryEditor } from "~/components/ImageGalleryEditor";
import {
  ProductDeleteDialog,
  SkuDeleteDialog,
} from "~/components/ProductDeleteDialogs";

const LOW_STOCK_THRESHOLD = 5;
const inputCls =
  "rounded-lg border border-edge px-2 py-1.5 text-sm outline-none focus:border-accent";
const fieldCls =
  "w-full rounded-xl border border-edge bg-panel px-4 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";

export function meta() {
  return [{ title: "Product | Dupli1 Admin" }];
}

interface VariantRow extends ProductVariant {
  quantity: number | null;
  reserved: number | null;
}

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [variantRows, setVariantRows] = useState<VariantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<ProductCategory[]>([]);

  useEffect(() => {
    let cancelled = false;
    listCategories()
      .then((rows) => {
        if (!cancelled) setCategories(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const loadProduct = useCallback(async () => {
    if (!id) return;
    const productId = id;

    setLoading(true);
    setError(null);

    try {
      const p = await getManageProduct(productId);

      const variants = productVariants(p);
      const rows = await Promise.all(
        variants.map(async (variant) => {
          try {
            const stock = variant.skuId
              ? await getInventoryBySkuId(variant.skuId).catch(() =>
                  getInventory(variant.sku)
                )
              : await getInventory(variant.sku);
            return {
              ...variant,
              quantity: stock.quantity,
              reserved: stock.reserved,
            };
          } catch {
            // Always-tracked SKUs: missing row is qty 0, not "unknown".
            return { ...variant, quantity: 0, reserved: 0 };
          }
        })
      );

      setProduct(p);
      setVariantRows(rows);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("productDetail.productNotFound")
      );
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void loadProduct();
  }, [loadProduct]);

  async function refreshVariantStock(sku: string) {
    try {
      const row = variantRows.find((r) => r.sku === sku);
      const stock = row?.skuId
        ? await getInventoryBySkuId(row.skuId).catch(() => getInventory(sku))
        : await getInventory(sku);
      setVariantRows((rows) =>
        rows.map((r) =>
          r.sku === sku
            ? { ...r, quantity: stock.quantity, reserved: stock.reserved }
            : r
        )
      );
    } catch {
      setVariantRows((rows) =>
        rows.map((r) =>
          r.sku === sku ? { ...r, quantity: 0, reserved: 0 } : r
        )
      );
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="space-y-4">
        <Link to="/products" className="text-sm text-accent hover:underline">
          {t("productDetail.backToProducts")}
        </Link>
        <div className="rounded-2xl border border-edge bg-surface p-10 text-center text-muted">
          {error ?? t("productDetail.productNotFound")}
        </div>
      </div>
    );
  }

  const hasMultipleVariants =
    (product.variants?.length ?? 0) > 1 ||
    variantRows.length > 1 ||
    Boolean(product.availableColors?.length);

  return (
    <div className="space-y-6">
      <Link to="/products" className="text-sm text-accent hover:underline">
        {t("productDetail.backToProducts")}
      </Link>

      <div className="rounded-2xl border border-edge bg-surface p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)] sm:p-8">
        <ParentSummarySection
          product={product}
          categories={categories}
          hasVariants={
            variantRows.length > 0 || (product.variants?.length ?? 0) > 0
          }
          onUpdated={setProduct}
        />

        {isClothingCategory(product.category) && (
          <SizeChartSection
            product={product}
            variantSizes={variantRows.map((r) => r.sizeCode || r.size)}
            sizeOrder={findCategory(categories, product.category)?.sizes}
            onUpdated={setProduct}
          />
        )}

        <VariantsSection
          product={product}
          allowedSizes={findCategory(categories, product.category)?.sizes}
          rows={variantRows}
          onStockUpdated={refreshVariantStock}
          onProductUpdated={setProduct}
          onReload={loadProduct}
        />

        {!hasMultipleVariants && variantRows[0] && (
          <LegacyProductImages
            productId={product.id}
            variant={variantRows[0]}
            onUploaded={setProduct}
          />
        )}

        <div className="mt-8">
          <DangerZone
            hint={t("productDelete.zoneHint")}
            label={t("productDelete.button")}
            onClick={() => setDeleteOpen(true)}
          />
        </div>
      </div>

      <ProductDeleteDialog
        product={product}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => navigate("/products")}
      />
    </div>
  );
}

function catalogTermLabel(
  terms: CatalogCodeName[],
  code: string | undefined,
  empty: string
): string {
  if (!code) return empty;
  return terms.find((t) => t.code === code)?.name ?? code;
}

function ParentSummarySection({
  product,
  categories,
  hasVariants,
  onUpdated,
}: {
  product: Product;
  categories: ProductCategory[];
  /** Category is fixed once a SKU exists (its size must suit the category). */
  hasVariants: boolean;
  onUpdated: (product: Product) => void;
}) {
  const { notify } = useNotify();
  const { t, formatCurrency } = useI18n();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(product.name);
  const [category, setCategory] = useState(
    normalizeCategory(product.category)
  );
  const [brand, setBrand] = useState(product.brand ?? "");
  const [subCategory, setSubCategory] = useState(product.subCategory ?? "");
  const [style, setStyle] = useState(product.style ?? "");
  const [target, setTarget] = useState(product.target ?? "");
  const [material, setMaterial] = useState(product.material ?? "");
  const [status, setStatus] = useState(product.status ?? "active");
  const [description, setDescription] = useState(product.description ?? "");
  const [price, setPrice] = useState(
    product.price != null ? String(product.price) : ""
  );
  const [officialPrice, setOfficialPrice] = useState(
    product.officialPrice != null && product.officialPrice > 0
      ? String(product.officialPrice)
      : ""
  );
  const [attributeRows, setAttributeRows] = useState(
    () => attributeRowsFromMap(product.attributes)
  );
  const [saving, setSaving] = useState(false);
  const [brands, setBrands] = useState<CatalogCodeName[]>([]);
  const [subCategories, setSubCategories] = useState<CatalogCodeName[]>([]);
  const [styles, setStyles] = useState<CatalogCodeName[]>([]);
  const [targets, setTargets] = useState<CatalogCodeName[]>([]);
  const [mastersLoading, setMastersLoading] = useState(true);

  useEffect(() => {
    setName(product.name);
    setCategory(normalizeCategory(product.category));
    setBrand(product.brand ?? "");
    setSubCategory(product.subCategory ?? "");
    setStyle(product.style ?? "");
    setTarget(product.target ?? "");
    setMaterial(product.material ?? "");
    setStatus(product.status ?? "active");
    setDescription(product.description ?? "");
    setPrice(product.price != null ? String(product.price) : "");
    setOfficialPrice(
      product.officialPrice != null && product.officialPrice > 0
        ? String(product.officialPrice)
        : ""
    );
    setAttributeRows(attributeRowsFromMap(product.attributes));
  }, [product]);

  // Prefer catalog brand name when brandCode matches (does not clobber mid-edit).
  useEffect(() => {
    if (editing || !product.brandCode) return;
    const match = brands.find((b) => b.code === product.brandCode);
    if (match) setBrand(match.name);
  }, [brands, product.brandCode, editing]);

  useEffect(() => {
    let cancelled = false;
    setMastersLoading(true);
    Promise.all([
      listBrands(),
      getMasterCatalog(normalizeCategory(product.category)),
    ])
      .then(([brandRows, master]) => {
        if (cancelled) return;
        setBrands(brandRows);
        setSubCategories(master.subCategories);
        setStyles(master.styles);
        setTargets(master.targets);
      })
      .catch((err) => {
        if (cancelled) return;
        notify(
          err instanceof Error
            ? err.message
            : t("productDetail.failedToLoadCatalogMasters"),
          "error"
        );
      })
      .finally(() => {
        if (!cancelled) setMastersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [product.category, notify, t]);

  // Subcategories follow the category picked in the form; the master call
  // (scoped to the product's own category) covers a categories outage.
  const subCategoryOptions =
    findCategory(categories, category)?.subCategories ??
    (category === normalizeCategory(product.category) ? subCategories : []);
  const categoryLabel = categoryDisplayName(product.category, categories, t);
  const attributePresets = attributePresetsFor(category).filter(
    (key) => !attributeRows.some((row) => row.key.trim() === key)
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedPrice = Number.parseFloat(price);
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      notify(t("common.enterValidPrice"), "error");
      return;
    }
    let parsedOfficial: number | undefined;
    if (officialPrice.trim() !== "") {
      parsedOfficial = Number.parseFloat(officialPrice);
      if (Number.isNaN(parsedOfficial) || parsedOfficial < 0) {
        notify(t("common.enterValidPrice"), "error");
        return;
      }
    }

    const attrs = attributesFromRows(attributeRows);
    const attrKeys = Object.keys(attrs);
    if (attrKeys.length > MAX_PRODUCT_ATTRIBUTES) {
      notify(
        t("productDetail.attributesTooMany", {
          max: String(MAX_PRODUCT_ATTRIBUTES),
        }),
        "error"
      );
      return;
    }
    for (const key of attrKeys) {
      if ([...key].length > MAX_ATTRIBUTE_KEY_LEN) {
        notify(
          t("productDetail.attributeKeyTooLong", {
            max: String(MAX_ATTRIBUTE_KEY_LEN),
          }),
          "error"
        );
        return;
      }
      if ([...attrs[key]].length > MAX_ATTRIBUTE_VALUE_LEN) {
        notify(
          t("productDetail.attributeValueTooLong", {
            key,
            max: String(MAX_ATTRIBUTE_VALUE_LEN),
          }),
          "error"
        );
        return;
      }
    }

    setSaving(true);
    try {
      const updated = await updateProduct(product.id, {
        name: name.trim(),
        brand: brand.trim(),
        material: material.trim(),
        status: status.trim() || "active",
        description: description.trim() || undefined,
        price: parsedPrice,
        officialPrice: parsedOfficial,
        // Backend UpdateProduct merge keeps omitted taxonomy; send current values.
        category: category || DEFAULT_CATEGORY,
        subCategory: subCategory.trim(),
        style: style.trim(),
        target: target.trim(),
        // Full map replace; {} clears.
        attributes: attrs,
      });
      onUpdated(updated);
      setEditing(false);
      notify(t("productDetail.productUpdated"));
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : t("productDetail.failedToUpdateProduct"),
        "error"
      );
    } finally {
      setSaving(false);
    }
  }

  const colors =
    product.availableColors?.join(", ") ??
    product.color ??
    t("common.emptyValue");
  const priceLabel =
    product.price != null
      ? formatCurrency(product.price)
      : t("common.emptyValue");
  const officialPriceLabel =
    product.officialPrice != null && product.officialPrice > 0
      ? formatCurrency(product.officialPrice)
      : t("common.emptyValue");

  const brandOptions = (() => {
    const rows = [...brands];
    if (brand && !rows.some((b) => b.name === brand)) {
      rows.unshift({
        code: product.brandCode ?? brand,
        name: brand,
      });
    }
    return rows;
  })();

  function withCurrentTerm(
    terms: CatalogCodeName[],
    code: string
  ): CatalogCodeName[] {
    if (!code || terms.some((t) => t.code === code)) return terms;
    return [{ code, name: code }, ...terms];
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">{product.name}</h1>
          <p className="mt-1 text-sm text-muted">{categoryLabel}</p>
        </div>
        {!editing && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <ProductExportButton product={product} />
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-xl border border-edge px-4 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-subtle"
            >
              {t("productDetail.editStyle")}
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">
            {t("productDetail.editParentProduct")}
          </p>
          {mastersLoading && (
            <p className="text-sm text-muted">
              {t("productDetail.loadingCatalogMasters")}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                {t("productDetail.name")}
              </span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={fieldCls}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                {t("productDetail.brand")}
              </span>
              <select
                required
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className={fieldCls}
                disabled={mastersLoading && brandOptions.length === 0}
              >
                <option value="">{t("productDetail.selectBrand")}</option>
                {brandOptions.map((b) => (
                  <option key={b.code} value={b.name}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                {t("productDetail.category")}
              </span>
              <select
                value={category}
                onChange={(e) => {
                  const next = e.target.value;
                  setCategory(next);
                  const options = findCategory(categories, next)?.subCategories;
                  if (!options?.some((row) => row.code === subCategory)) {
                    setSubCategory("");
                  }
                }}
                className={fieldCls}
                disabled={hasVariants || categories.length === 0}
                title={
                  hasVariants ? t("productDetail.categoryLockedHint") : undefined
                }
              >
                {withCurrentTerm(
                  categories.map((c) => ({
                    code: c.code,
                    name: categoryDisplayName(c.code, categories, t),
                  })),
                  category
                ).map((row) => (
                  <option key={row.code} value={row.code}>
                    {row.name}
                  </option>
                ))}
              </select>
              {hasVariants && (
                <p className="text-xs text-faint">
                  {t("productDetail.categoryLockedHint")}
                </p>
              )}
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                {t("productDetail.subCategory")}
              </span>
              <select
                value={subCategory}
                onChange={(e) => setSubCategory(e.target.value)}
                className={fieldCls}
              >
                <option value="">{t("common.emptyValue")}</option>
                {withCurrentTerm(subCategoryOptions, subCategory).map((row) => (
                  <option key={row.code} value={row.code}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                {t("productDetail.style")}
              </span>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className={fieldCls}
              >
                <option value="">{t("common.emptyValue")}</option>
                {withCurrentTerm(styles, style).map((row) => (
                  <option key={row.code} value={row.code}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                {t("productDetail.target")}
              </span>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className={fieldCls}
              >
                <option value="">{t("common.emptyValue")}</option>
                {withCurrentTerm(targets, target).map((row) => (
                  <option key={row.code} value={row.code}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                {t("productDetail.material")}
              </span>
              <input
                required
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                className={fieldCls}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                {t("productDetail.officialPrice")}
              </span>
              <input
                type="number"
                min={0}
                step="1"
                value={officialPrice}
                onChange={(e) => setOfficialPrice(e.target.value)}
                className={fieldCls}
                placeholder={t("productNew.officialPricePlaceholder")}
                title={t("productDetail.officialPriceHint")}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                {t("productDetail.price")}
              </span>
              <input
                required
                type="number"
                min={0}
                step="1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className={fieldCls}
                placeholder={t("productNew.pricePlaceholder")}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                {t("productDetail.status")}
              </span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={fieldCls}
              >
                <option value="active">{t("common.statusActive")}</option>
                <option value="draft">{t("common.statusDraft")}</option>
                <option value="archived">{t("common.statusArchived")}</option>
              </select>
            </label>
            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                {t("productDetail.description")}
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={fieldCls}
              />
            </label>
            <div className="space-y-2 sm:col-span-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    {t("productDetail.attributes")}
                  </p>
                  <p className="mt-0.5 text-xs text-faint">
                    {t("productDetail.attributesHint")}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={attributeRows.length >= MAX_PRODUCT_ATTRIBUTES}
                  onClick={() =>
                    setAttributeRows((rows) => [...rows, { key: "", value: "" }])
                  }
                  className="rounded-lg border border-edge px-3 py-1.5 text-xs font-semibold text-accent hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t("productDetail.addAttribute")}
                </button>
              </div>
              {attributePresets.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-faint">
                    {t("productDetail.attributePresets")}
                  </span>
                  {attributePresets.map((key) => (
                    <button
                      key={key}
                      type="button"
                      disabled={attributeRows.length >= MAX_PRODUCT_ATTRIBUTES}
                      onClick={() =>
                        setAttributeRows((rows) => [
                          // Drop blank rows so repeated presets don't pile up empties.
                          ...rows.filter((r) => r.key.trim() || r.value.trim()),
                          { key, value: "" },
                        ])
                      }
                      title={t(`productDetail.attributePreset_${key}`)}
                      className="rounded-full border border-edge px-2.5 py-1 font-mono text-[11px] text-accent hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      + {key}
                    </button>
                  ))}
                </div>
              )}
              {attributeRows.length === 0 ? (
                <p className="text-sm text-muted">
                  {t("productDetail.noAttributes")}
                </p>
              ) : (
                <div className="space-y-2">
                  {attributeRows.map((row, index) => (
                    <div
                      key={index}
                      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]"
                    >
                      <input
                        value={row.key}
                        onChange={(e) => {
                          const next = e.target.value;
                          setAttributeRows((rows) =>
                            rows.map((r, i) =>
                              i === index ? { ...r, key: next } : r
                            )
                          );
                        }}
                        maxLength={MAX_ATTRIBUTE_KEY_LEN}
                        placeholder={t("productDetail.attributeKeyPlaceholder")}
                        className={fieldCls}
                      />
                      <input
                        value={row.value}
                        onChange={(e) => {
                          const next = e.target.value;
                          setAttributeRows((rows) =>
                            rows.map((r, i) =>
                              i === index ? { ...r, value: next } : r
                            )
                          );
                        }}
                        maxLength={MAX_ATTRIBUTE_VALUE_LEN}
                        placeholder={t(
                          "productDetail.attributeValuePlaceholder"
                        )}
                        className={fieldCls}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setAttributeRows((rows) =>
                            rows.filter((_, i) => i !== index)
                          )
                        }
                        className="rounded-xl border border-edge px-3 py-2.5 text-xs font-semibold text-danger-fg hover:border-red-200"
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? t("common.saving") : t("common.saveChanges")}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-xl border border-edge px-4 py-2 text-sm font-semibold text-muted"
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      ) : (
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          {[
            [t("productDetail.id"), product.id],
            [t("productDetail.category"), categoryLabel],
            [t("productDetail.brand"), product.brand],
            [t("productDetail.brandCode"), product.brandCode],
            [t("productDetail.styleCode"), product.styleCode],
            [
              t("productDetail.subCategory"),
              catalogTermLabel(
                findCategory(categories, product.category)?.subCategories ??
                  subCategories,
                product.subCategory,
                t("common.emptyValue")
              ),
            ],
            [
              t("productDetail.style"),
              catalogTermLabel(styles, product.style, t("common.emptyValue")),
            ],
            [
              t("productDetail.target"),
              catalogTermLabel(
                targets,
                product.target,
                t("common.emptyValue")
              ),
            ],
            [t("productDetail.material"), product.material],
            [t("productDetail.status"), product.status],
            [t("productDetail.colors"), colors],
            [t("productDetail.officialPrice"), officialPriceLabel],
            [t("productDetail.price"), priceLabel],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-faint">
                {label}
              </dt>
              <dd className="mt-1 text-sm text-ink">
                {value ?? t("common.emptyValue")}
              </dd>
            </div>
          ))}
          {product.description && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-faint">
                {t("productDetail.description")}
              </dt>
              <dd className="mt-1 text-sm text-ink">
                {product.description}
              </dd>
            </div>
          )}
          <div className="sm:col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-faint">
              {t("productDetail.attributes")}
            </dt>
            <dd className="mt-2">
              {product.attributes &&
              Object.keys(product.attributes).length > 0 ? (
                <dl className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(product.attributes).map(([key, value]) => (
                    <div
                      key={key}
                      className="rounded-xl border border-edge-soft bg-subtle px-3 py-2"
                    >
                      <dt className="font-mono text-[11px] text-faint">
                        {key}
                      </dt>
                      <dd className="mt-0.5 text-sm text-ink">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-muted">
                  {t("productDetail.noAttributes")}
                </p>
              )}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}

const SIZE_CHART_LABEL_KEYS: Record<SizeChartMeasurement, string> = {
  chestCm: "productDetail.sizeChartChest",
  lengthCm: "productDetail.sizeChartLength",
  shoulderCm: "productDetail.sizeChartShoulder",
  sleeveCm: "productDetail.sizeChartSleeve",
};

/** Clothing size guide: one row per size, measurements in cm. */
function SizeChartSection({
  product,
  variantSizes,
  sizeOrder,
  onUpdated,
}: {
  product: Product;
  /** Size codes of the product's SKUs; each gets a row to fill in. */
  variantSizes: string[];
  /** The category's sizes, smallest first; absent while categories load. */
  sizeOrder?: string[];
  onUpdated: (product: Product) => void;
}) {
  const { notify } = useNotify();
  const { t } = useI18n();
  const variantSizesKey = variantSizes.join(",");
  const [rows, setRows] = useState<SizeChartEditorRow[]>(() =>
    sizeChartEditorRows(product.sizeChart, variantSizes, sizeOrder)
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRows(
      sizeChartEditorRows(
        product.sizeChart,
        variantSizesKey ? variantSizesKey.split(",") : [],
        sizeOrder
      )
    );
  }, [product.sizeChart, variantSizesKey, sizeOrder]);

  const unusedSizes = (sizeOrder ?? []).filter(
    (size) => !rows.some((r) => r.size.trim().toUpperCase() === size)
  );

  function setCell(index: number, patch: Partial<SizeChartEditorRow>) {
    setRows((current) =>
      current.map((r, i) => (i === index ? { ...r, ...patch } : r))
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const result = sizeChartFromEditorRows(rows);
    if (result.error) {
      const err = result.error;
      notify(
        err.code === "TOO_MANY_ROWS"
          ? t("productDetail.sizeChartTooManyRows", {
              max: String(MAX_SIZE_CHART_ROWS),
            })
          : err.code === "SIZE_REQUIRED"
            ? t("productDetail.sizeChartSizeRequired")
            : err.code === "DUPLICATE_SIZE"
              ? t("productDetail.sizeChartDuplicateSize", { size: err.size })
              : t("productDetail.sizeChartInvalidMeasurement", {
                  size: err.size,
                  max: String(MAX_SIZE_CHART_CM),
                }),
        "error"
      );
      return;
    }
    setSaving(true);
    try {
      // `[]` clears the chart; the other parent fields are kept (omitted).
      const updated = await updateProduct(product.id, {
        sizeChart: result.chart,
      });
      onUpdated(updated);
      notify(t("productDetail.sizeChartSaved"));
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : t("productDetail.failedToUpdateProduct"),
        "error"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSave}
      className="mt-8 space-y-3 border-t border-edge-soft pt-6"
    >
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-faint">
          {t("productDetail.sizeChart")}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {t("productDetail.sizeChartHint")}
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{t("productDetail.sizeChartEmpty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-edge">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-edge-soft bg-subtle text-left">
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-faint">
                  {t("productDetail.size")}
                </th>
                {SIZE_CHART_MEASUREMENTS.map((m) => (
                  <th
                    key={m}
                    className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-faint"
                  >
                    {t(SIZE_CHART_LABEL_KEYS[m])}
                  </th>
                ))}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={index}
                  className="border-b border-edge-soft last:border-0"
                >
                  <td className="px-3 py-2">
                    {sizeOrder && sizeOrder.length > 0 ? (
                      <select
                        value={row.size}
                        onChange={(e) => setCell(index, { size: e.target.value })}
                        aria-label={t("productDetail.size")}
                        className={`w-24 ${inputCls}`}
                      >
                        {!sizeOrder.includes(row.size) && (
                          <option value={row.size}>{row.size || "—"}</option>
                        )}
                        {sizeOrder.map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={row.size}
                        onChange={(e) =>
                          setCell(index, { size: e.target.value.toUpperCase() })
                        }
                        aria-label={t("productDetail.size")}
                        className={`w-24 ${inputCls}`}
                      />
                    )}
                  </td>
                  {SIZE_CHART_MEASUREMENTS.map((m) => (
                    <td key={m} className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        max={MAX_SIZE_CHART_CM}
                        step={0.5}
                        inputMode="decimal"
                        value={row[m]}
                        onChange={(e) => setCell(index, { [m]: e.target.value })}
                        placeholder={t("productDetail.cmPlaceholder")}
                        aria-label={`${row.size} ${t(SIZE_CHART_LABEL_KEYS[m])}`}
                        className={`w-24 ${inputCls}`}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        setRows((current) => current.filter((_, i) => i !== index))
                      }
                      className="text-xs font-semibold text-danger-fg hover:underline"
                    >
                      {t("common.remove")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={
            rows.length >= MAX_SIZE_CHART_ROWS ||
            (Boolean(sizeOrder?.length) && unusedSizes.length === 0)
          }
          onClick={() =>
            setRows((current) => [
              ...current,
              {
                size: unusedSizes[0] ?? "",
                chestCm: "",
                lengthCm: "",
                shoulderCm: "",
                sleeveCm: "",
              },
            ])
          }
          className="rounded-lg border border-edge px-3 py-1.5 text-xs font-semibold text-accent hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("productDetail.sizeChartAddSize")}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          {saving ? t("common.saving") : t("productDetail.sizeChartSave")}
        </button>
      </div>
    </form>
  );
}

function VariantsSection({
  product,
  allowedSizes,
  rows,
  onStockUpdated,
  onProductUpdated,
  onReload,
}: {
  product: Product;
  /** The category's size codes; absent = any size. */
  allowedSizes?: string[];
  rows: VariantRow[];
  onStockUpdated: (sku: string) => Promise<void>;
  onProductUpdated: (product: Product) => void;
  onReload: () => Promise<void>;
}) {
  const { notify } = useNotify();
  const { t } = useI18n();
  const [editingSku, setEditingSku] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deletingSku, setDeletingSku] = useState<string | null>(null);
  const deletingRow = rows.find((r) => r.sku === deletingSku) ?? null;

  async function handleSetStock(sku: string, quantity: number) {
    try {
      const row = rows.find((r) => r.sku === sku);
      if (row?.skuId) {
        await setInventoryBySkuId(row.skuId, quantity).catch(() =>
          setInventory(sku, quantity)
        );
      } else {
        await setInventory(sku, quantity);
      }
      await onStockUpdated(sku);
      notify(t("productDetail.stockUpdatedFor", { sku }));
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : t("productDetail.failedToUpdateStock"),
        "error"
      );
    }
  }

  const headings = [
    t("productDetail.colSku"),
    t("productDetail.colSkuId"),
    t("productDetail.colOption"),
    t("productDetail.colStatus"),
    t("productDetail.colStock"),
    t("productDetail.colImages"),
    "",
    t("productDetail.colActions"),
  ];

  return (
    <div className="mt-8 border-t border-edge-soft pt-6">
      <div className="mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-faint">
          {t("productDetail.variants")}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {t("productDetail.variantsHint")}
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-edge">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-edge-soft bg-subtle text-left">
              {headings.map((heading, index) => (
                <th
                  key={heading || `spacer-${index}`}
                  className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-faint"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.sku}>
                <tr className="border-b border-edge-soft last:border-0 align-top">
                  <td className="px-4 py-3 font-mono text-xs text-ink">
                    <Link
                      to={productSkuPath(product.id, row.skuId ?? row.sku)}
                      className="text-accent hover:underline"
                    >
                      {row.sku}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] text-faint">
                    {row.skuId ? (
                      <Link
                        to={productSkuPath(product.id, row.skuId)}
                        className="hover:text-accent hover:underline"
                      >
                        {row.skuId}
                      </Link>
                    ) : (
                      t("common.emptyValue")
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {formatVariantOption(row)}
                    {(row.colorCode || row.sizeCode || row.editionCode) && (
                      <div className="mt-0.5 font-mono text-[10px] text-faint">
                        {[row.colorCode, row.editionCode, row.sizeCode]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    )}
                    {(() => {
                      const dims = formatDimensionsMm(row.dimensions);
                      return dims ? (
                        <div className="mt-0.5 text-[10px] text-faint">
                          {dims}
                        </div>
                      ) : null;
                    })()}
                  </td>
                  <td className="px-4 py-3 capitalize text-muted">
                    {row.status}
                  </td>
                  <td className="px-4 py-3">
                    <StockEditor
                      sku={row.sku}
                      quantity={row.quantity}
                      reserved={row.reserved}
                      onSave={handleSetStock}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <VariantImageUpload
                      productId={product.id}
                      variant={row}
                      onUploaded={(updated) => {
                        onProductUpdated({
                          ...product,
                          variants: productVariants(product).map((v) =>
                            v.sku === updated.sku ? updated : v
                          ),
                        });
                      }}
                    />
                  </td>
                  <td className="px-4 py-3">
                    {row.quantity === 0 && (
                      <span className="rounded-full bg-danger-bg px-2 py-0.5 text-xs font-medium text-danger-fg">
                        {t("productDetail.stockOut")}
                      </span>
                    )}
                    {row.quantity != null &&
                      row.quantity > 0 &&
                      row.quantity <= LOW_STOCK_THRESHOLD && (
                        <span className="rounded-full bg-warn-bg px-2 py-0.5 text-xs font-medium text-warn-fg">
                          {t("productDetail.stockLow")}
                        </span>
                      )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setEditingSku((current) =>
                            current === row.sku ? null : row.sku
                          )
                        }
                        className="text-xs font-semibold text-accent hover:underline"
                      >
                        {editingSku === row.sku
                          ? t("common.cancel")
                          : t("common.edit")}
                      </button>
                      <Link
                        to={productSkuPath(product.id, row.skuId ?? row.sku)}
                        className="text-xs font-semibold text-accent hover:underline"
                      >
                        {t("skuDetail.open")}
                      </Link>
                      <button
                        type="button"
                        disabled={rows.length <= 1}
                        title={
                          rows.length <= 1
                            ? t("productDetail.cannotDeleteOnlyVariant")
                            : undefined
                        }
                        onClick={() => setDeletingSku(row.sku)}
                        className="text-xs font-semibold text-danger-fg hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  </td>
                </tr>
                {editingSku === row.sku && (
                  <tr className="bg-subtle">
                    <td colSpan={8} className="px-4 py-4">
                      <VariantEditForm
                        productId={product.id}
                        variant={row}
                        showDimensions={!isClothingCategory(product.category)}
                        onSaved={async () => {
                          setEditingSku(null);
                          await onReload();
                          notify(t("productDetail.updatedSku", { sku: row.sku }));
                        }}
                        onCancel={() => setEditingSku(null)}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        {showAddForm ? (
          <AddVariantForm
            productId={product.id}
            allowedSizes={allowedSizes}
            showDimensions={!isClothingCategory(product.category)}
            onAdded={async () => {
              setShowAddForm(false);
              await onReload();
              notify(t("productDetail.variantAdded"));
            }}
            onCancel={() => setShowAddForm(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="rounded-xl border border-dashed border-edge px-4 py-2.5 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-subtle"
          >
            {t("productDetail.addVariant")}
          </button>
        )}
      </div>

      {deletingRow && (
        <SkuDeleteDialog
          product={product}
          variant={deletingRow}
          open
          onClose={() => setDeletingSku(null)}
          onDeleted={async () => {
            setDeletingSku(null);
            setEditingSku(null);
            await onReload();
          }}
        />
      )}
    </div>
  );
}

function VariantEditForm({
  productId,
  variant,
  showDimensions,
  onSaved,
  onCancel,
}: {
  productId: string;
  variant: ProductVariant;
  /** Bag-only W×H×D; hidden for clothing. */
  showDimensions: boolean;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const { notify } = useNotify();
  const { t } = useI18n();
  const [color, setColor] = useState(variant.color);
  const [size, setSize] = useState(variant.size);
  const [status, setStatus] = useState(variant.status);
  const [widthMm, setWidthMm] = useState(
    variant.dimensions?.widthMm?.toString() ?? ""
  );
  const [heightMm, setHeightMm] = useState(
    variant.dimensions?.heightMm?.toString() ?? ""
  );
  const [depthMm, setDepthMm] = useState(
    variant.dimensions?.depthMm?.toString() ?? ""
  );
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseDimensionsInput({ widthMm, heightMm, depthMm });
    if (parsed.error === "INVALID_DIMENSION") {
      notify(t("skuDetail.invalidDimension"), "error");
      return;
    }
    if (parsed.error === "DIMENSION_TOO_LARGE") {
      notify(t("skuDetail.dimensionTooLarge"), "error");
      return;
    }

    setSaving(true);
    try {
      const hadDimensions = !dimensionsEmpty(variant.dimensions);
      // Hidden editor: leave whatever is stored alone.
      const nextDimensions = !showDimensions
        ? null
        : (parsed.dimensions ?? (hadDimensions ? {} : null));
      await updateVariant(productId, variant.sku, {
        color: color.trim(),
        size: size.trim(),
        status: status.trim() || "active",
        dimensions: nextDimensions,
      });
      await onSaved();
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : t("productDetail.failedToUpdateVariant"),
        "error"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-faint">
        {t("productDetail.editVariantHeading", { sku: variant.sku })}
      </p>
      <p className="text-xs text-faint">
        {t("productDetail.priceOnParentHint")}
      </p>
      <div className="flex flex-wrap gap-3">
        <label className="space-y-1 text-xs text-muted">
          {t("productDetail.color")}
          <input
            required
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className={`block ${inputCls}`}
          />
        </label>
        <label className="space-y-1 text-xs text-muted">
          {t("productDetail.size")}
          <input
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className={`block ${inputCls}`}
          />
        </label>
        <label className="space-y-1 text-xs text-muted">
          {t("productDetail.status")}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={`block ${inputCls}`}
          >
            <option value="active">{t("common.statusActive")}</option>
            <option value="draft">{t("common.statusDraft")}</option>
            <option value="archived">{t("common.statusArchived")}</option>
          </select>
        </label>
      </div>
      {showDimensions && (
      <div className="space-y-1">
        <p className="text-xs text-muted">{t("skuDetail.dimensions")}</p>
        <p className="text-xs text-faint">{t("skuDetail.dimensionsHint")}</p>
        <div className="flex flex-wrap gap-3">
          <label className="space-y-1 text-xs text-muted">
            {t("skuDetail.widthMm")}
            <input
              type="number"
              min={0}
              max={10000}
              inputMode="numeric"
              value={widthMm}
              onChange={(e) => setWidthMm(e.target.value)}
              placeholder={t("skuDetail.mmPlaceholder")}
              className={`block w-24 ${inputCls}`}
            />
          </label>
          <label className="space-y-1 text-xs text-muted">
            {t("skuDetail.heightMm")}
            <input
              type="number"
              min={0}
              max={10000}
              inputMode="numeric"
              value={heightMm}
              onChange={(e) => setHeightMm(e.target.value)}
              placeholder={t("skuDetail.mmPlaceholder")}
              className={`block w-24 ${inputCls}`}
            />
          </label>
          <label className="space-y-1 text-xs text-muted">
            {t("skuDetail.depthMm")}
            <input
              type="number"
              min={0}
              max={10000}
              inputMode="numeric"
              value={depthMm}
              onChange={(e) => setDepthMm(e.target.value)}
              placeholder={t("skuDetail.mmPlaceholder")}
              className={`block w-24 ${inputCls}`}
            />
          </label>
        </div>
      </div>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          {saving ? t("common.saving") : t("common.saveChanges")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-page px-3 py-1.5 text-xs font-semibold text-muted"
        >
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

function AddVariantForm({
  productId,
  allowedSizes,
  showDimensions,
  onAdded,
  onCancel,
}: {
  productId: string;
  allowedSizes?: string[];
  /** Bag-only W×H×D; hidden for clothing. */
  showDimensions: boolean;
  onAdded: () => Promise<void>;
  onCancel: () => void;
}) {
  const { notify } = useNotify();
  const { t } = useI18n();
  const [colors, setColors] = useState<CatalogCodeName[]>([]);
  const [sizes, setSizes] = useState<CatalogCodeName[]>([]);
  const [editions, setEditions] = useState<CatalogCodeName[]>([]);
  const [colorCode, setColorCode] = useState("");
  const [sizeCode, setSizeCode] = useState("OS");
  const [editionCode, setEditionCode] = useState("");
  const [initialStock, setInitialStock] = useState("");
  const [status, setStatus] = useState("active");
  const [widthMm, setWidthMm] = useState("");
  const [heightMm, setHeightMm] = useState("");
  const [depthMm, setDepthMm] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingMasters, setLoadingMasters] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listColors(), listSizes(), listEditions()])
      .then(([c, s, e]) => {
        if (cancelled) return;
        setColors(c);
        setSizes(s);
        setEditions(e);
        if (c[0]) setColorCode(c[0].code);
        setSizeCode(
          defaultSizeCode(filterSizesForCategory(s, allowedSizes), allowedSizes)
        );
      })
      .catch((err) => {
        if (!cancelled) {
          notify(
            err instanceof Error
              ? err.message
              : t("common.failedToLoadCatalogMasters"),
            "error"
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMasters(false);
      });
    return () => {
      cancelled = true;
    };
  }, [allowedSizes, notify, t]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!colorCode || !sizeCode) {
      notify(t("productDetail.selectColorAndSizeCodes"), "error");
      return;
    }

    const parsed: ReturnType<typeof parseDimensionsInput> = showDimensions
      ? parseDimensionsInput({ widthMm, heightMm, depthMm })
      : {};
    if (parsed.error === "INVALID_DIMENSION") {
      notify(t("skuDetail.invalidDimension"), "error");
      return;
    }
    if (parsed.error === "DIMENSION_TOO_LARGE") {
      notify(t("skuDetail.dimensionTooLarge"), "error");
      return;
    }

    setSaving(true);
    try {
      const colorName = colors.find((c) => c.code === colorCode)?.name;
      const sizeName = sizes.find((s) => s.code === sizeCode)?.name;
      const variant = await createVariant(productId, {
        colorCode,
        sizeCode,
        editionCode: editionCode || undefined,
        color: colorName,
        size: sizeName,
        status,
        dimensions: parsed.dimensions,
      });

      const stockQty = Number.parseInt(initialStock, 10);
      if (!Number.isNaN(stockQty) && stockQty >= 0) {
        if (variant.skuId) {
          await setInventoryBySkuId(variant.skuId, stockQty).catch(() =>
            setInventory(variant.sku, stockQty)
          );
        } else {
          await setInventory(variant.sku, stockQty).catch(() => {});
        }
      }

      await onAdded();
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : t("productDetail.failedToAddVariant"),
        "error"
      );
    } finally {
      setSaving(false);
    }
  }

  if (loadingMasters) {
    return (
      <div className="rounded-xl border border-edge bg-subtle p-4 text-sm text-muted">
        {t("productDetail.loadingCatalogMasters")}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-edge bg-subtle p-4 space-y-3"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-faint">
        {t("productDetail.newVariant")}
      </p>
      <p className="text-xs text-muted">{t("productDetail.newVariantHint")}</p>
      <p className="text-xs text-faint">
        {t("productDetail.priceOnParentHint")}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="space-y-1 text-xs text-muted">
          {t("productDetail.colorCodeRequired")}
          <select
            required
            value={colorCode}
            onChange={(e) => setColorCode(e.target.value)}
            className={`block w-full ${inputCls}`}
          >
            {colors.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted">
          {t("productDetail.sizeCodeRequired")}
          <select
            required
            value={sizeCode}
            onChange={(e) => setSizeCode(e.target.value)}
            className={`block w-full ${inputCls}`}
          >
            {filterSizesForCategory(sizes, allowedSizes).map((s) => (
              <option key={s.code} value={s.code}>
                {s.code} — {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted">
          {t("productDetail.editionCode")}
          <select
            value={editionCode}
            onChange={(e) => setEditionCode(e.target.value)}
            className={`block w-full ${inputCls}`}
          >
            <option value="">{t("common.none")}</option>
            {editions.map((ed) => (
              <option key={ed.code} value={ed.code}>
                {ed.code} — {ed.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted">
          {t("productDetail.status")}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={`block w-full ${inputCls}`}
          >
            <option value="active">{t("common.statusActive")}</option>
            <option value="draft">{t("common.statusDraft")}</option>
            <option value="archived">{t("common.statusArchived")}</option>
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted">
          {t("productDetail.initialStock")}
          <input
            type="number"
            min={0}
            value={initialStock}
            onChange={(e) => setInitialStock(e.target.value)}
            className={`block w-full ${inputCls}`}
            placeholder={t("productDetail.initialStockPlaceholder")}
          />
        </label>
        {showDimensions && (
        <div className="space-y-1 sm:col-span-2 lg:col-span-3">
          <p className="text-xs text-muted">{t("skuDetail.dimensions")}</p>
          <p className="text-xs text-faint">{t("skuDetail.dimensionsHint")}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-xs text-muted">
              {t("skuDetail.widthMm")}
              <input
                type="number"
                min={0}
                max={10000}
                inputMode="numeric"
                value={widthMm}
                onChange={(e) => setWidthMm(e.target.value)}
                placeholder={t("skuDetail.mmPlaceholder")}
                className={`block w-full ${inputCls}`}
              />
            </label>
            <label className="space-y-1 text-xs text-muted">
              {t("skuDetail.heightMm")}
              <input
                type="number"
                min={0}
                max={10000}
                inputMode="numeric"
                value={heightMm}
                onChange={(e) => setHeightMm(e.target.value)}
                placeholder={t("skuDetail.mmPlaceholder")}
                className={`block w-full ${inputCls}`}
              />
            </label>
            <label className="space-y-1 text-xs text-muted">
              {t("skuDetail.depthMm")}
              <input
                type="number"
                min={0}
                max={10000}
                inputMode="numeric"
                value={depthMm}
                onChange={(e) => setDepthMm(e.target.value)}
                placeholder={t("skuDetail.mmPlaceholder")}
                className={`block w-full ${inputCls}`}
              />
            </label>
          </div>
        </div>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          {saving ? t("common.adding") : t("productDetail.addVariant")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-surface px-3 py-1.5 text-xs font-semibold text-muted border border-edge"
        >
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

function StockEditor({
  sku,
  quantity,
  reserved,
  onSave,
}: {
  sku: string;
  quantity: number | null;
  reserved: number | null;
  onSave: (sku: string, quantity: number) => Promise<void>;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(
    quantity != null ? String(quantity) : ""
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(quantity != null ? String(quantity) : "");
  }, [quantity]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 0) return;
    setSaving(true);
    try {
      await onSave(sku, parsed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("common.emptyValue")}
        className="w-20 rounded-lg border border-edge px-2 py-1 text-sm outline-none focus:border-accent"
      />
      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-page px-2 py-1 text-xs font-semibold text-accent hover:bg-edge disabled:opacity-60"
      >
        {saving ? t("common.loadingEllipsis") : t("productDetail.setStock")}
      </button>
      {reserved != null && reserved > 0 && (
        <span className="text-xs text-faint">
          {t("common.reservedCount", { count: reserved })}
        </span>
      )}
    </form>
  );
}

function VariantImageUpload({
  productId,
  variant,
  onUploaded,
}: {
  productId: string;
  variant: ProductVariant;
  onUploaded: (variant: ProductVariant) => void;
}) {
  return (
    <ImageGalleryEditor
      compact
      urls={variant.imageUrls}
      uploadOne={async (file) => {
        onUploaded(await uploadVariantImage(productId, variant.sku, file));
      }}
      saveOrder={async (next) => {
        onUploaded(
          await reorderVariantImages(productId, variant.sku, variant.imageUrls, next)
        );
      }}
      remove={async (url) => {
        onUploaded(
          await deleteVariantImage(productId, variant.sku, url, variant.imageUrls)
        );
      }}
    />
  );
}

function LegacyProductImages({
  productId,
  variant,
  onUploaded,
}: {
  productId: string;
  variant: ProductVariant;
  onUploaded: (product: Product) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="mt-6 border-t border-edge-soft pt-6">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-faint">
        {t("productDetail.images")}
      </h2>
      <ImageGalleryEditor
        urls={variant.imageUrls}
        hint={t("productDetail.imagesHint")}
        uploadOne={async (file) => {
          onUploaded(await uploadProductImage(productId, file));
        }}
        saveOrder={async (next) => {
          await reorderVariantImages(productId, variant.sku, variant.imageUrls, next);
          onUploaded(await getManageProduct(productId));
        }}
        remove={async (url) => {
          await deleteVariantImage(productId, variant.sku, url, variant.imageUrls);
          onUploaded(await getManageProduct(productId));
        }}
      />
    </div>
  );
}
