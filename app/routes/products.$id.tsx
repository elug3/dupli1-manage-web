import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import {
  type Product,
  type ProductVariant,
  createVariant,
  deleteVariant,
  formatVariantOption,
  getInventory,
  getManageProduct,
  getProduct,
  productVariants,
  setInventory,
  updateVariant,
  uploadProductImage,
  uploadVariantImage,
} from "~/lib/api";
import { useNotify } from "~/lib/notifications";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const LOW_STOCK_THRESHOLD = 5;
const inputCls =
  "rounded-lg border border-[#E5E3EE] px-2 py-1.5 text-sm outline-none focus:border-[#6D4AFF]";

export function meta() {
  return [{ title: "Product | Dupli1 Admin" }];
}

interface VariantRow extends ProductVariant {
  quantity: number | null;
  reserved: number | null;
}

export default function ProductDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const category = searchParams.get("category") ?? "bags";
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
      let p: Product;
      try {
        p = await getManageProduct(productId);
      } catch {
        const fallback = await getProduct(category, productId);
        if (!fallback) throw new Error("Product not found");
        p = fallback;
      }

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
      setError(err instanceof Error ? err.message : "Product not found");
    } finally {
      setLoading(false);
    }
  }, [id, category]);

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
          ← Back to products
        </Link>
        <div className="rounded-2xl border border-[#E5E3EE] bg-white p-10 text-center text-[#6B6480]">
          {error ?? "Product not found"}
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
        ← Back to products
      </Link>

      <div className="rounded-2xl border border-[#E5E3EE] bg-white p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)] sm:p-8">
        <h1 className="text-2xl font-bold text-[#1C1B1F]">{product.name}</h1>
        <p className="mt-1 text-sm capitalize text-[#6B6480]">{product.category}</p>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          {[
            ["ID", product.id],
            ["Brand", product.brand],
            ["Material", product.material],
            ["Status", product.status],
            [
              "Colors",
              product.availableColors?.join(", ") ?? product.color ?? "—",
            ],
            [
              "Price from",
              product.priceFrom != null
                ? formatCurrency(product.priceFrom)
                : product.price != null
                  ? formatCurrency(product.price)
                  : "—",
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-[#9D98B3]">
                {label}
              </dt>
              <dd className="mt-1 text-sm text-[#1C1B1F]">{value ?? "—"}</dd>
            </div>
          ))}
        </dl>

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
  const [editingSku, setEditingSku] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  async function handleSetStock(sku: string, quantity: number) {
    try {
      await setInventory(sku, quantity);
      await onStockUpdated(sku);
      notify(`Stock updated for ${sku}`);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to update stock", "error");
    }
  }

  return (
    <div className="mt-8 border-t border-[#F0EEF8] pt-6">
      <div className="mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[#9D98B3]">
          Variants
        </h2>
        <p className="mt-1 text-sm text-[#6B6480]">
          Sellable SKUs with inventory keyed by{" "}
          <code className="text-xs">/inventory/api/v1/inventory/{"{sku}"}</code>
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#E5E3EE]">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-[#F0EEF8] bg-[#FAFAFA] text-left">
              {[
                "SKU",
                "Option",
                "Price",
                "Status",
                "Stock",
                "Images",
                "",
                "Actions",
              ].map((heading) => (
                  <th
                    key={heading}
                    className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#9D98B3]"
                  >
                    {heading}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.sku}>
                <tr className="border-b border-[#F0EEF8] last:border-0 align-top">
                  <td className="px-4 py-3 font-mono text-xs text-[#1C1B1F]">
                    {row.sku}
                  </td>
                  <td className="px-4 py-3 text-[#6B6480]">
                    {formatVariantOption(row)}
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
                        Out
                      </span>
                    )}
                    {row.quantity != null &&
                      row.quantity > 0 &&
                      row.quantity <= LOW_STOCK_THRESHOLD && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                          Low
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
                        {editingSku === row.sku ? "Cancel" : "Edit"}
                      </button>
                      <button
                        type="button"
                        disabled={rows.length <= 1}
                        title={
                          rows.length <= 1
                            ? "Cannot delete the only variant"
                            : undefined
                        }
                        onClick={async () => {
                          if (
                            !window.confirm(
                              `Delete variant ${row.sku}? This cannot be undone.`
                            )
                          ) {
                            return;
                          }
                          try {
                            await deleteVariant(product.id, row.sku);
                            notify(`Deleted ${row.sku}`);
                            setEditingSku(null);
                            await onReload();
                          } catch (err) {
                            notify(
                              err instanceof Error
                                ? err.message
                                : "Failed to delete variant",
                              "error"
                            );
                          }
                        }}
                        className="text-xs font-semibold text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
                {editingSku === row.sku && (
                  <tr className="bg-[#FAFAFA]">
                    <td colSpan={8} className="px-4 py-4">
                      <VariantEditForm
                        productId={product.id}
                        variant={row}
                        onSaved={async () => {
                          setEditingSku(null);
                          await onReload();
                          notify(`Updated ${row.sku}`);
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
              notify("Variant added");
            }}
            onCancel={() => setShowAddForm(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="rounded-xl border border-dashed border-[#E5E3EE] px-4 py-2.5 text-sm font-semibold text-[#6D4AFF] transition hover:border-[#6D4AFF]/40 hover:bg-[#FAFAFA]"
          >
            + Add variant
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
  const [color, setColor] = useState(variant.color);
  const [size, setSize] = useState(variant.size);
  const [price, setPrice] = useState(String(variant.price));
  const [status, setStatus] = useState(variant.status);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedPrice = Number.parseFloat(price);
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      notify("Enter a valid price", "error");
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
      notify(err instanceof Error ? err.message : "Failed to update variant", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#9D98B3]">
        Edit {variant.sku}
      </p>
      <div className="flex flex-wrap gap-3">
        <label className="space-y-1 text-xs text-[#6B6480]">
          Color
          <input
            required
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className={`block ${inputCls}`}
          />
        </label>
        <label className="space-y-1 text-xs text-[#6B6480]">
          Size
          <input
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className={`block ${inputCls}`}
          />
        </label>
        <label className="space-y-1 text-xs text-[#6B6480]">
          Price
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
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={`block ${inputCls}`}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="draft">Draft</option>
          </select>
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[#6D4AFF] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-[#F4F3F8] px-3 py-1.5 text-xs font-semibold text-[#6B6480]"
        >
          Cancel
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
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [status, setStatus] = useState("active");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedPrice = Number.parseFloat(price);
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      notify("Enter a valid price", "error");
      return;
    }

    setSaving(true);
    try {
      await createVariant(productId, {
        color: color.trim(),
        size: size.trim(),
        price: parsedPrice,
        sku: sku.trim() || undefined,
        status,
      });
      await onAdded();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to add variant", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-[#E5E3EE] bg-[#FAFAFA] p-4 space-y-3"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[#9D98B3]">
        New variant
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="space-y-1 text-xs text-[#6B6480]">
          Color *
          <input
            required
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className={`block w-full ${inputCls}`}
            placeholder="Navy"
          />
        </label>
        <label className="space-y-1 text-xs text-[#6B6480]">
          Size
          <input
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className={`block w-full ${inputCls}`}
          />
        </label>
        <label className="space-y-1 text-xs text-[#6B6480]">
          SKU
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className={`block w-full ${inputCls}`}
            placeholder="Auto-generated if empty"
          />
        </label>
        <label className="space-y-1 text-xs text-[#6B6480]">
          Price (USD) *
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
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={`block w-full ${inputCls}`}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="draft">Draft</option>
          </select>
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[#6D4AFF] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Adding…" : "Add variant"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#6B6480] border border-[#E5E3EE]"
        >
          Cancel
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
        placeholder="—"
        className="w-20 rounded-lg border border-[#E5E3EE] px-2 py-1 text-sm outline-none focus:border-[#6D4AFF]"
      />
      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-[#F4F3F8] px-2 py-1 text-xs font-semibold text-[#6D4AFF] hover:bg-[#E5E3EE] disabled:opacity-60"
      >
        {saving ? "…" : "Set"}
      </button>
      {reserved != null && reserved > 0 && (
        <span className="text-xs text-[#9D98B3]">{reserved} reserved</span>
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      notify("Please choose an image file", "error");
      e.target.value = "";
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      notify("Image must be 10 MB or smaller", "error");
      e.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const updated = await uploadVariantImage(productId, variant.sku, file);
      onUploaded(updated);
      notify("Variant image uploaded");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Upload failed", "error");
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
        {uploading ? "Uploading…" : `Upload (${variant.imageUrls.length})`}
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      notify("Please choose an image file", "error");
      e.target.value = "";
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      notify("Image must be 10 MB or smaller", "error");
      e.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const updated = await uploadProductImage(productId, file);
      onUploaded(updated);
      notify("Image uploaded");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Upload failed", "error");
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
            Images
          </h2>
          <p className="mt-1 text-sm text-[#6B6480]">
            Legacy parent upload or variant upload when multi-SKU is enabled
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
            {uploading ? "Uploading…" : "Upload image"}
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
          No images yet.
        </div>
      )}
    </div>
  );
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(n);
}
