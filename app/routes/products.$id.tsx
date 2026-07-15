import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import {
  type CatalogCodeName,
  type Product,
  type ProductVariant,
  createVariant,
  deleteVariant,
  formatVariantOption,
  getInventory,
  getManageProduct,
  listColors,
  listEditions,
  listSizes,
  productVariants,
  setInventory,
  updateProduct,
  updateVariant,
  uploadProductImage,
  uploadVariantImage,
} from "~/lib/api";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";

const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const LOW_STOCK_THRESHOLD = 5;
const inputCls =
  "rounded-lg border border-[#E5E3EE] px-2 py-1.5 text-sm outline-none focus:border-[#6D4AFF]";
const fieldCls =
  "w-full rounded-xl border border-[#E5E3EE] bg-[#F8F7FC] px-4 py-2.5 text-sm text-[#1C1B1F] outline-none transition focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20";

export function meta() {
  return [{ title: "Product | Dupli1 Admin" }];
}

interface VariantRow extends ProductVariant {
  quantity: number | null;
  reserved: number | null;
}

export default function ProductDetail() {
  const { id } = useParams();
  const { t } = useI18n();
  const [product, setProduct] = useState<Product | null>(null);
  const [variantRows, setVariantRows] = useState<VariantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
            const stock = await getInventory(variant.sku);
            return {
              ...variant,
              quantity: stock.quantity,
              reserved: stock.reserved,
            };
          } catch {
            return { ...variant, quantity: null, reserved: null };
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
      const stock = await getInventory(sku);
      setVariantRows((rows) =>
        rows.map((row) =>
          row.sku === sku
            ? { ...row, quantity: stock.quantity, reserved: stock.reserved }
            : row
        )
      );
    } catch {
      setVariantRows((rows) =>
        rows.map((row) =>
          row.sku === sku ? { ...row, quantity: null, reserved: null } : row
        )
      );
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#6D4AFF] border-t-transparent" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="space-y-4">
        <Link to="/products" className="text-sm text-[#6D4AFF] hover:underline">
          {t("productDetail.backToProducts")}
        </Link>
        <div className="rounded-2xl border border-[#E5E3EE] bg-white p-10 text-center text-[#6B6480]">
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
      <Link to="/products" className="text-sm text-[#6D4AFF] hover:underline">
        {t("productDetail.backToProducts")}
      </Link>

      <div className="rounded-2xl border border-[#E5E3EE] bg-white p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)] sm:p-8">
        <ParentSummarySection product={product} onUpdated={setProduct} />

        <VariantsSection
          product={product}
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
      </div>
    </div>
  );
}

function ParentSummarySection({
  product,
  onUpdated,
}: {
  product: Product;
  onUpdated: (product: Product) => void;
}) {
  const { notify } = useNotify();
  const { t, formatCurrency } = useI18n();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(product.name);
  const [brand, setBrand] = useState(product.brand ?? "");
  const [material, setMaterial] = useState(product.material ?? "");
  const [status, setStatus] = useState(product.status ?? "active");
  const [description, setDescription] = useState(product.description ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(product.name);
    setBrand(product.brand ?? "");
    setMaterial(product.material ?? "");
    setStatus(product.status ?? "active");
    setDescription(product.description ?? "");
  }, [product]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await updateProduct(product.id, {
        name: name.trim(),
        brand: brand.trim(),
        material: material.trim(),
        status: status.trim() || "active",
        description: description.trim() || undefined,
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
  const priceFrom =
    product.priceFrom != null
      ? formatCurrency(product.priceFrom)
      : product.price != null
        ? formatCurrency(product.price)
        : t("common.emptyValue");

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1C1B1F]">{product.name}</h1>
          <p className="mt-1 text-sm capitalize text-[#6B6480]">
            {product.category}
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-xl border border-[#E5E3EE] px-4 py-2 text-sm font-semibold text-[#6D4AFF] transition hover:border-[#6D4AFF]/40 hover:bg-[#FAFAFA]"
          >
            {t("productDetail.editStyle")}
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#9D98B3]">
            {t("productDetail.editParentProduct")}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-[#6B6480]">
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
              <span className="text-xs font-semibold uppercase tracking-wide text-[#6B6480]">
                {t("productDetail.brand")}
              </span>
              <input
                required
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className={fieldCls}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-[#6B6480]">
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
              <span className="text-xs font-semibold uppercase tracking-wide text-[#6B6480]">
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
              <span className="text-xs font-semibold uppercase tracking-wide text-[#6B6480]">
                {t("productDetail.description")}
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={fieldCls}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-[#6D4AFF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? t("common.saving") : t("common.saveChanges")}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-xl border border-[#E5E3EE] px-4 py-2 text-sm font-semibold text-[#6B6480]"
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      ) : (
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          {[
            [t("productDetail.id"), product.id],
            [t("productDetail.brand"), product.brand],
            [t("productDetail.brandCode"), product.brandCode],
            [t("productDetail.styleCode"), product.styleCode],
            [t("productDetail.material"), product.material],
            [t("productDetail.status"), product.status],
            [t("productDetail.colors"), colors],
            [t("productDetail.priceFrom"), priceFrom],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-[#9D98B3]">
                {label}
              </dt>
              <dd className="mt-1 text-sm text-[#1C1B1F]">
                {value ?? t("common.emptyValue")}
              </dd>
            </div>
          ))}
          {product.description && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-[#9D98B3]">
                {t("productDetail.description")}
              </dt>
              <dd className="mt-1 text-sm text-[#1C1B1F]">
                {product.description}
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

function VariantsSection({
  product,
  rows,
  onStockUpdated,
  onProductUpdated,
  onReload,
}: {
  product: Product;
  rows: VariantRow[];
  onStockUpdated: (sku: string) => Promise<void>;
  onProductUpdated: (product: Product) => void;
  onReload: () => Promise<void>;
}) {
  const { notify } = useNotify();
  const { t, formatCurrency } = useI18n();
  const [editingSku, setEditingSku] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  async function handleSetStock(sku: string, quantity: number) {
    try {
      await setInventory(sku, quantity);
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
    t("productDetail.colPrice"),
    t("productDetail.colStatus"),
    t("productDetail.colStock"),
    t("productDetail.colImages"),
    "",
    t("productDetail.colActions"),
  ];

  return (
    <div className="mt-8 border-t border-[#F0EEF8] pt-6">
      <div className="mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[#9D98B3]">
          {t("productDetail.variants")}
        </h2>
        <p className="mt-1 text-sm text-[#6B6480]">
          {t("productDetail.variantsHint")}
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#E5E3EE]">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-[#F0EEF8] bg-[#FAFAFA] text-left">
              {headings.map((heading, index) => (
                <th
                  key={heading || `spacer-${index}`}
                  className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#9D98B3]"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.sku}>
                <tr className="border-b border-[#F0EEF8] last:border-0 align-top">
                  <td className="px-4 py-3 font-mono text-xs text-[#1C1B1F]">
                    {row.sku}
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] text-[#9D98B3]">
                    {row.skuId ?? t("common.emptyValue")}
                  </td>
                  <td className="px-4 py-3 text-[#6B6480]">
                    {formatVariantOption(row)}
                    {(row.colorCode || row.sizeCode || row.editionCode) && (
                      <div className="mt-0.5 font-mono text-[10px] text-[#9D98B3]">
                        {[row.colorCode, row.editionCode, row.sizeCode]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#1C1B1F]">
                    {formatCurrency(row.price)}
                  </td>
                  <td className="px-4 py-3 capitalize text-[#6B6480]">
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
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                        {t("productDetail.stockOut")}
                      </span>
                    )}
                    {row.quantity != null &&
                      row.quantity > 0 &&
                      row.quantity <= LOW_STOCK_THRESHOLD && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
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
                        className="text-xs font-semibold text-[#6D4AFF] hover:underline"
                      >
                        {editingSku === row.sku
                          ? t("common.cancel")
                          : t("common.edit")}
                      </button>
                      <button
                        type="button"
                        disabled={rows.length <= 1}
                        title={
                          rows.length <= 1
                            ? t("productDetail.cannotDeleteOnlyVariant")
                            : undefined
                        }
                        onClick={async () => {
                          if (
                            !window.confirm(
                              t("productDetail.deleteVariantConfirm", {
                                sku: row.sku,
                              })
                            )
                          ) {
                            return;
                          }
                          try {
                            await deleteVariant(product.id, row.sku);
                            notify(t("productDetail.deletedSku", { sku: row.sku }));
                            setEditingSku(null);
                            await onReload();
                          } catch (err) {
                            notify(
                              err instanceof Error
                                ? err.message
                                : t("productDetail.failedToDeleteVariant"),
                              "error"
                            );
                          }
                        }}
                        className="text-xs font-semibold text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  </td>
                </tr>
                {editingSku === row.sku && (
                  <tr className="bg-[#FAFAFA]">
                    <td colSpan={9} className="px-4 py-4">
                      <VariantEditForm
                        productId={product.id}
                        variant={row}
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
            className="rounded-xl border border-dashed border-[#E5E3EE] px-4 py-2.5 text-sm font-semibold text-[#6D4AFF] transition hover:border-[#6D4AFF]/40 hover:bg-[#FAFAFA]"
          >
            {t("productDetail.addVariant")}
          </button>
        )}
      </div>
    </div>
  );
}

function VariantEditForm({
  productId,
  variant,
  onSaved,
  onCancel,
}: {
  productId: string;
  variant: ProductVariant;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const { notify } = useNotify();
  const { t } = useI18n();
  const [color, setColor] = useState(variant.color);
  const [size, setSize] = useState(variant.size);
  const [price, setPrice] = useState(String(variant.price));
  const [status, setStatus] = useState(variant.status);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedPrice = Number.parseFloat(price);
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      notify(t("common.enterValidPrice"), "error");
      return;
    }

    setSaving(true);
    try {
      await updateVariant(productId, variant.sku, {
        color: color.trim(),
        size: size.trim(),
        price: parsedPrice,
        status: status.trim() || "active",
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
      <p className="text-xs font-semibold uppercase tracking-wide text-[#9D98B3]">
        {t("productDetail.editVariantHeading", { sku: variant.sku })}
      </p>
      <div className="flex flex-wrap gap-3">
        <label className="space-y-1 text-xs text-[#6B6480]">
          {t("productDetail.color")}
          <input
            required
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className={`block ${inputCls}`}
          />
        </label>
        <label className="space-y-1 text-xs text-[#6B6480]">
          {t("productDetail.size")}
          <input
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className={`block ${inputCls}`}
          />
        </label>
        <label className="space-y-1 text-xs text-[#6B6480]">
          {t("productDetail.price")}
          <input
            required
            type="number"
            min={0}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={`block w-28 ${inputCls}`}
          />
        </label>
        <label className="space-y-1 text-xs text-[#6B6480]">
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
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[#6D4AFF] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          {saving ? t("common.saving") : t("common.saveChanges")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-[#F4F3F8] px-3 py-1.5 text-xs font-semibold text-[#6B6480]"
        >
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

function AddVariantForm({
  productId,
  onAdded,
  onCancel,
}: {
  productId: string;
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
  const [price, setPrice] = useState("");
  const [initialStock, setInitialStock] = useState("");
  const [status, setStatus] = useState("active");
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
        if (s.some((row) => row.code === "OS")) setSizeCode("OS");
        else if (s[0]) setSizeCode(s[0].code);
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
  }, [notify, t]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedPrice = Number.parseFloat(price);
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      notify(t("common.enterValidPrice"), "error");
      return;
    }
    if (!colorCode || !sizeCode) {
      notify(t("productDetail.selectColorAndSizeCodes"), "error");
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
        price: parsedPrice,
        status,
      });

      const stockQty = Number.parseInt(initialStock, 10);
      if (!Number.isNaN(stockQty) && stockQty >= 0) {
        await setInventory(variant.sku, stockQty).catch(() => {});
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
      <div className="rounded-xl border border-[#E5E3EE] bg-[#FAFAFA] p-4 text-sm text-[#6B6480]">
        {t("productDetail.loadingCatalogMasters")}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-[#E5E3EE] bg-[#FAFAFA] p-4 space-y-3"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[#9D98B3]">
        {t("productDetail.newVariant")}
      </p>
      <p className="text-xs text-[#6B6480]">{t("productDetail.newVariantHint")}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="space-y-1 text-xs text-[#6B6480]">
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
        <label className="space-y-1 text-xs text-[#6B6480]">
          {t("productDetail.sizeCodeRequired")}
          <select
            required
            value={sizeCode}
            onChange={(e) => setSizeCode(e.target.value)}
            className={`block w-full ${inputCls}`}
          >
            {sizes.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code} — {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-[#6B6480]">
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
        <label className="space-y-1 text-xs text-[#6B6480]">
          {t("productDetail.priceUsdRequired")}
          <input
            required
            type="number"
            min={0}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={`block w-full ${inputCls}`}
          />
        </label>
        <label className="space-y-1 text-xs text-[#6B6480]">
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
        <label className="space-y-1 text-xs text-[#6B6480]">
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
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[#6D4AFF] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          {saving ? t("common.adding") : t("productDetail.addVariant")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#6B6480] border border-[#E5E3EE]"
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
        className="w-20 rounded-lg border border-[#E5E3EE] px-2 py-1 text-sm outline-none focus:border-[#6D4AFF]"
      />
      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-[#F4F3F8] px-2 py-1 text-xs font-semibold text-[#6D4AFF] hover:bg-[#E5E3EE] disabled:opacity-60"
      >
        {saving ? t("common.loadingEllipsis") : t("productDetail.setStock")}
      </button>
      {reserved != null && reserved > 0 && (
        <span className="text-xs text-[#9D98B3]">
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
  const { notify } = useNotify();
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      notify(t("common.pleaseChooseImageFile"), "error");
      e.target.value = "";
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      notify(t("common.imageMustBe50MiBOrSmaller"), "error");
      e.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const updated = await uploadVariantImage(productId, variant.sku, file);
      onUploaded(updated);
      notify(t("productDetail.variantImageUploaded"));
    } catch (err) {
      notify(
        err instanceof Error ? err.message : t("productDetail.uploadFailed"),
        "error"
      );
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        disabled={uploading}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="text-xs font-semibold text-[#6D4AFF] hover:underline disabled:opacity-60"
      >
        {uploading
          ? t("common.uploading")
          : t("productDetail.uploadWithCount", {
              count: variant.imageUrls.length,
            })}
      </button>
    </div>
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
  const { notify } = useNotify();
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      notify(t("common.pleaseChooseImageFile"), "error");
      e.target.value = "";
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      notify(t("common.imageMustBe50MiBOrSmaller"), "error");
      e.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const updated = await uploadProductImage(productId, file);
      onUploaded(updated);
      notify(t("productDetail.imageUploaded"));
    } catch (err) {
      notify(
        err instanceof Error ? err.message : t("productDetail.uploadFailed"),
        "error"
      );
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  const imageUrls = variant.imageUrls;

  return (
    <div className="mt-6 border-t border-[#F0EEF8] pt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#9D98B3]">
            {t("productDetail.images")}
          </h2>
          <p className="mt-1 text-sm text-[#6B6480]">
            {t("productDetail.imagesHint")}
          </p>
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#6D4AFF] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5A38E8] disabled:opacity-60 sm:w-auto"
          >
            {uploading
              ? t("common.uploading")
              : t("productDetail.uploadImage")}
          </button>
        </div>
      </div>

      {imageUrls.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {imageUrls.map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="group overflow-hidden rounded-xl border border-[#E5E3EE] bg-[#FAFAFA]"
            >
              <img
                src={url}
                alt=""
                className="aspect-square w-full object-cover transition group-hover:scale-105"
              />
            </a>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-[#E5E3EE] bg-[#FAFAFA] px-4 py-10 text-center text-sm text-[#9D98B3]">
          {t("productDetail.noImagesYet")}
        </div>
      )}
    </div>
  );
}
