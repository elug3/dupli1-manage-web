import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  type Product,
  type ProductVariant,
  LastImageDeleteError,
  deleteVariant,
  deleteVariantImage,
  dimensionsEmpty,
  findVariant,
  formatDimensionsMm,
  formatVariantOption,
  getInventory,
  getInventoryBySkuId,
  getManageProduct,
  parseDimensionsInput,
  productImageSrc,
  setInventory,
  updateVariant,
  uploadVariantImage,
} from "~/lib/api";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";

export function meta() {
  return [{ title: "SKU | Dupli1 Admin" }];
}

const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const fieldCls =
  "w-full rounded-xl border border-edge bg-panel px-4 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";

export default function SkuDetail() {
  const { id, skuId } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { notify } = useNotify();
  const [product, setProduct] = useState<Product | null>(null);
  const [variant, setVariant] = useState<ProductVariant | null>(null);
  const [quantity, setQuantity] = useState<number | null>(null);
  const [reserved, setReserved] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !skuId) return;
    setLoading(true);
    setError(null);
    try {
      const p = await getManageProduct(id);
      const v = findVariant(p, skuId);
      if (!v) {
        setProduct(p);
        setVariant(null);
        setError(t("skuDetail.skuNotFound"));
        return;
      }
      setProduct(p);
      setVariant(v);

      try {
        const stock = v.skuId
          ? await getInventoryBySkuId(v.skuId).catch(() => getInventory(v.sku))
          : await getInventory(v.sku);
        setQuantity(stock.quantity);
        setReserved(stock.reserved);
      } catch {
        setQuantity(null);
        setReserved(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("skuDetail.failedToLoad"));
      setProduct(null);
      setVariant(null);
    } finally {
      setLoading(false);
    }
  }, [id, skuId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (error || !product || !variant) {
    return (
      <div className="space-y-4">
        <Link
          to={id ? `/products/${encodeURIComponent(id)}` : "/products"}
          className="text-sm text-accent hover:underline"
        >
          {t("skuDetail.backToProduct")}
        </Link>
        <div className="rounded-2xl border border-edge bg-surface p-10 text-center text-muted">
          {error ?? t("skuDetail.skuNotFound")}
        </div>
      </div>
    );
  }

  const stockLabel =
    quantity == null
      ? t("common.emptyValue")
      : reserved != null && reserved > 0
        ? t("skuDetail.stockWithReserved", {
            quantity: String(quantity),
            reserved: String(reserved),
          })
        : String(quantity);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link to="/products" className="text-accent hover:underline">
          {t("nav.products")}
        </Link>
        <span className="text-faint">/</span>
        <Link
          to={`/products/${encodeURIComponent(product.id)}`}
          className="text-accent hover:underline"
        >
          {product.name}
        </Link>
        <span className="text-faint">/</span>
        <span className="font-mono text-xs text-ink">{variant.sku}</span>
      </div>

      <div className="space-y-8 rounded-2xl border border-edge bg-surface p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)] sm:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">
            {t("skuDetail.heading")}
          </p>
          <h1 className="mt-1 font-mono text-xl font-bold text-ink sm:text-2xl">
            {variant.sku}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {formatVariantOption(variant)} · {product.name}
          </p>
        </div>

        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            [t("skuDetail.humanSku"), variant.sku],
            [t("skuDetail.skuId"), variant.skuId ?? t("common.emptyValue")],
            [t("skuDetail.productId"), product.id],
            [t("productDetail.color"), variant.color || t("common.emptyValue")],
            [t("productDetail.size"), variant.size || t("common.emptyValue")],
            [
              t("skuDetail.colorCode"),
              variant.colorCode ?? t("common.emptyValue"),
            ],
            [t("skuDetail.sizeCode"), variant.sizeCode ?? t("common.emptyValue")],
            [
              t("skuDetail.editionCode"),
              variant.editionCode ?? t("common.emptyValue"),
            ],
            [
              t("skuDetail.dimensions"),
              formatDimensionsMm(variant.dimensions) ?? t("common.emptyValue"),
            ],
            [t("productDetail.status"), variant.status],
            [t("productDetail.colStock"), stockLabel],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-faint">
                {label}
              </dt>
              <dd className="mt-1 break-all text-sm text-ink">{value}</dd>
            </div>
          ))}
        </dl>

        <PriceSection product={product} />

        <StockSection
          sku={variant.sku}
          quantity={quantity}
          onSaved={async (qty) => {
            setQuantity(qty);
            notify(t("productDetail.stockUpdatedFor", { sku: variant.sku }));
          }}
        />

        <ImagesSection
          productId={product.id}
          variant={variant}
          onUploaded={(updated) => {
            setVariant(updated);
          }}
        />

        <EditSection
          productId={product.id}
          variant={variant}
          onSaved={async () => {
            await load();
            notify(t("productDetail.updatedSku", { sku: variant.sku }));
          }}
        />

        <div className="border-t border-edge-soft pt-6">
          <button
            type="button"
            className="text-sm font-semibold text-danger-fg hover:underline"
            onClick={async () => {
              if (
                !window.confirm(
                  t("productDetail.deleteVariantConfirm", { sku: variant.sku })
                )
              ) {
                return;
              }
              try {
                await deleteVariant(product.id, variant.sku);
                notify(t("productDetail.deletedSku", { sku: variant.sku }));
                navigate(`/products/${encodeURIComponent(product.id)}`);
              } catch (err) {
                notify(
                  err instanceof Error
                    ? err.message
                    : t("productDetail.failedToDeleteVariant"),
                  "error"
                );
              }
            }}
          >
            {t("skuDetail.deleteSku")}
          </button>
        </div>
      </div>
    </div>
  );
}

function PriceSection({ product }: { product: Product }) {
  const { t, formatCurrency } = useI18n();
  const officialLabel =
    product.officialPrice != null && product.officialPrice > 0
      ? formatCurrency(product.officialPrice)
      : t("common.emptyValue");
  const priceLabel =
    product.price != null
      ? formatCurrency(product.price)
      : t("common.emptyValue");

  return (
    <section className="space-y-3 border-t border-edge-soft pt-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-faint">
        {t("skuDetail.price")}
      </h2>
      <p className="text-sm text-muted">
        {t("skuDetail.currentOfficialPrice", { price: officialLabel })}
        {" · "}
        {t("skuDetail.currentPrice", { price: priceLabel })}
      </p>
      <p className="text-xs text-faint">
        {t("productDetail.priceOnParentHint")}
      </p>
      <Link
        to={`/products/${encodeURIComponent(product.id)}`}
        className="inline-flex text-sm font-semibold text-accent hover:underline"
      >
        {t("skuDetail.editPriceOnParent")}
      </Link>
    </section>
  );
}

function StockSection({
  sku,
  quantity,
  onSaved,
}: {
  sku: string;
  quantity: number | null;
  onSaved: (quantity: number) => Promise<void>;
}) {
  const { t } = useI18n();
  const { notify } = useNotify();
  const [value, setValue] = useState(quantity == null ? "" : String(quantity));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(quantity == null ? "" : String(quantity));
  }, [quantity]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number.parseInt(value, 10);
    if (Number.isNaN(qty) || qty < 0) {
      notify(t("skuDetail.enterValidStock"), "error");
      return;
    }
    setSaving(true);
    try {
      const item = await setInventory(sku, qty);
      await onSaved(item.quantity);
    } catch (err) {
      notify(
        err instanceof Error ? err.message : t("productDetail.failedToUpdateStock"),
        "error"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3 border-t border-edge-soft pt-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-faint">
        {t("skuDetail.inventory")}
      </h2>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <label className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("skuDetail.quantity")}
          </span>
          <input
            type="number"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={`w-36 ${fieldCls}`}
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? t("common.saving") : t("skuDetail.updateStock")}
        </button>
      </form>
    </section>
  );
}

function ImagesSection({
  productId,
  variant,
  onUploaded,
}: {
  productId: string;
  variant: ProductVariant;
  onUploaded: (variant: ProductVariant) => void;
}) {
  const { t } = useI18n();
  const { notify } = useNotify();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
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

  async function handleDelete(url: string) {
    if (!window.confirm(t("productDetail.deleteImageConfirm"))) return;
    setDeletingUrl(url);
    try {
      const updated = await deleteVariantImage(
        productId,
        variant.sku,
        url,
        variant.imageUrls
      );
      onUploaded(updated);
      notify(t("productDetail.imageDeleted"));
    } catch (err) {
      notify(
        err instanceof LastImageDeleteError
          ? t("productDetail.cannotDeleteLastImage")
          : err instanceof Error
            ? err.message
            : t("productDetail.failedToDeleteImage"),
        "error"
      );
    } finally {
      setDeletingUrl(null);
    }
  }

  return (
    <section className="space-y-3 border-t border-edge-soft pt-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-faint">
        {t("productDetail.images")}
      </h2>
      {variant.imageUrls.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {variant.imageUrls.map((url) => (
            <div key={url} className="relative">
              <img
                src={productImageSrc(url)}
                alt=""
                className="h-28 w-28 rounded-xl border border-edge object-cover"
              />
              <button
                type="button"
                disabled={deletingUrl === url}
                onClick={() => void handleDelete(url)}
                className="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white disabled:opacity-60"
              >
                {deletingUrl === url ? "…" : t("common.delete")}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">{t("productDetail.noImagesYet")}</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
        disabled={uploading}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="rounded-xl border border-dashed border-edge px-4 py-2.5 text-sm font-semibold text-accent hover:border-accent/40 disabled:opacity-60"
      >
        {uploading ? t("common.uploading") : t("productDetail.uploadImage")}
      </button>
    </section>
  );
}

function EditSection({
  productId,
  variant,
  onSaved,
}: {
  productId: string;
  variant: ProductVariant;
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const { notify } = useNotify();
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

  useEffect(() => {
    setColor(variant.color);
    setSize(variant.size);
    setStatus(variant.status);
    setWidthMm(variant.dimensions?.widthMm?.toString() ?? "");
    setHeightMm(variant.dimensions?.heightMm?.toString() ?? "");
    setDepthMm(variant.dimensions?.depthMm?.toString() ?? "");
  }, [variant]);

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
      const nextDimensions =
        parsed.dimensions ?? (hadDimensions ? {} : null);
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
    <section className="space-y-4 border-t border-edge-soft pt-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-faint">
        {t("skuDetail.editSku")}
      </h2>
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("productDetail.color")}
          </span>
          <input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className={fieldCls}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("productDetail.size")}
          </span>
          <input
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className={fieldCls}
          />
        </label>
        <label className="space-y-1.5 sm:col-span-2">
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
        <div className="sm:col-span-2 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("skuDetail.dimensions")}
          </p>
          <p className="text-xs text-faint">{t("skuDetail.dimensionsHint")}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1.5">
              <span className="text-xs text-muted">
                {t("skuDetail.widthMm")}
              </span>
              <input
                type="number"
                min={0}
                max={10000}
                inputMode="numeric"
                value={widthMm}
                onChange={(e) => setWidthMm(e.target.value)}
                placeholder={t("skuDetail.mmPlaceholder")}
                className={fieldCls}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs text-muted">
                {t("skuDetail.heightMm")}
              </span>
              <input
                type="number"
                min={0}
                max={10000}
                inputMode="numeric"
                value={heightMm}
                onChange={(e) => setHeightMm(e.target.value)}
                placeholder={t("skuDetail.mmPlaceholder")}
                className={fieldCls}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs text-muted">
                {t("skuDetail.depthMm")}
              </span>
              <input
                type="number"
                min={0}
                max={10000}
                inputMode="numeric"
                value={depthMm}
                onChange={(e) => setDepthMm(e.target.value)}
                placeholder={t("skuDetail.mmPlaceholder")}
                className={fieldCls}
              />
            </label>
          </div>
        </div>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? t("common.saving") : t("common.saveChanges")}
          </button>
        </div>
      </form>
    </section>
  );
}
