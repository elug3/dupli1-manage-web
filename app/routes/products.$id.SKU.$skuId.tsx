import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  type Product,
  type ProductVariant,
  LastImageDeleteError,
  deleteVariant,
  deleteVariantImage,
  findVariant,
  formatVariantOption,
  getInventory,
  getInventoryBySkuId,
  getManageProduct,
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
  "w-full rounded-xl border border-[#E5E3EE] bg-[#F8F7FC] px-4 py-2.5 text-sm text-[#1C1B1F] outline-none transition focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20";

export default function SkuDetail() {
  const { id, skuId } = useParams();
  const navigate = useNavigate();
  const { t, formatCurrency } = useI18n();
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
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#6D4AFF] border-t-transparent" />
      </div>
    );
  }

  if (error || !product || !variant) {
    return (
      <div className="space-y-4">
        <Link
          to={id ? `/products/${encodeURIComponent(id)}` : "/products"}
          className="text-sm text-[#6D4AFF] hover:underline"
        >
          {t("skuDetail.backToProduct")}
        </Link>
        <div className="rounded-2xl border border-[#E5E3EE] bg-white p-10 text-center text-[#6B6480]">
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
        <Link to="/products" className="text-[#6D4AFF] hover:underline">
          {t("nav.products")}
        </Link>
        <span className="text-[#9D98B3]">/</span>
        <Link
          to={`/products/${encodeURIComponent(product.id)}`}
          className="text-[#6D4AFF] hover:underline"
        >
          {product.name}
        </Link>
        <span className="text-[#9D98B3]">/</span>
        <span className="font-mono text-xs text-[#1C1B1F]">{variant.sku}</span>
      </div>

      <div className="space-y-8 rounded-2xl border border-[#E5E3EE] bg-white p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)] sm:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#9D98B3]">
            {t("skuDetail.heading")}
          </p>
          <h1 className="mt-1 font-mono text-xl font-bold text-[#1C1B1F] sm:text-2xl">
            {variant.sku}
          </h1>
          <p className="mt-1 text-sm text-[#6B6480]">
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
            [t("productDetail.price"), formatCurrency(variant.price)],
            [t("productDetail.status"), variant.status],
            [t("productDetail.colStock"), stockLabel],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-[#9D98B3]">
                {label}
              </dt>
              <dd className="mt-1 break-all text-sm text-[#1C1B1F]">{value}</dd>
            </div>
          ))}
        </dl>

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

        <div className="border-t border-[#F0EEF8] pt-6">
          <button
            type="button"
            className="text-sm font-semibold text-red-600 hover:underline"
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
    <section className="space-y-3 border-t border-[#F0EEF8] pt-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[#9D98B3]">
        {t("skuDetail.inventory")}
      </h2>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <label className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-[#6B6480]">
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
          className="rounded-xl bg-[#6D4AFF] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
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
    <section className="space-y-3 border-t border-[#F0EEF8] pt-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[#9D98B3]">
        {t("productDetail.images")}
      </h2>
      {variant.imageUrls.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {variant.imageUrls.map((url) => (
            <div key={url} className="relative">
              <img
                src={productImageSrc(url)}
                alt=""
                className="h-28 w-28 rounded-xl border border-[#E5E3EE] object-cover"
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
        <p className="text-sm text-[#6B6480]">{t("productDetail.noImagesYet")}</p>
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
        className="rounded-xl border border-dashed border-[#E5E3EE] px-4 py-2.5 text-sm font-semibold text-[#6D4AFF] hover:border-[#6D4AFF]/40 disabled:opacity-60"
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
  const [price, setPrice] = useState(String(variant.price));
  const [status, setStatus] = useState(variant.status);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setColor(variant.color);
    setSize(variant.size);
    setPrice(String(variant.price));
    setStatus(variant.status);
  }, [variant]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedSale = Number.parseFloat(price);
    if (Number.isNaN(parsedSale) || parsedSale < 0) {
      notify(t("common.enterValidPrice"), "error");
      return;
    }
    setSaving(true);
    try {
      await updateVariant(productId, variant.sku, {
        color: color.trim(),
        size: size.trim(),
        price: parsedSale,
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
    <section className="space-y-4 border-t border-[#F0EEF8] pt-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[#9D98B3]">
        {t("skuDetail.editSku")}
      </h2>
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-[#6B6480]">
            {t("productDetail.color")}
          </span>
          <input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className={fieldCls}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-[#6B6480]">
            {t("productDetail.size")}
          </span>
          <input
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className={fieldCls}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-[#6B6480]">
            {t("productDetail.price")}
          </span>
          <input
            type="number"
            min={0}
            step="1"
            required
            value={price}
            onChange={(e) => setPrice(e.target.value)}
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
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-[#6D4AFF] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? t("common.saving") : t("common.saveChanges")}
          </button>
        </div>
      </form>
    </section>
  );
}
