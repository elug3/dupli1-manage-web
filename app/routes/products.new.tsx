import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  createBagProduct,
  createProductParent,
  createVariant,
  setInventory,
  uploadProductImage,
  uploadVariantImage,
} from "~/lib/api";
import { useNotify } from "~/lib/notifications";

export function meta() {
  return [{ title: "New Product | Dupli1 Admin" }];
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const inputCls =
  "w-full rounded-xl border border-[#E5E3EE] bg-[#F8F7FC] px-4 py-2.5 text-sm text-[#1C1B1F] outline-none transition placeholder:text-[#B4B0C8] focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20";

export default function NewProduct() {
  const navigate = useNavigate();
  const { notify } = useNotify();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [brand, setBrand] = useState("");
  const [material, setMaterial] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [status, setStatus] = useState("active");
  const [initialStock, setInitialStock] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  function clearImage() {
    setImageFile(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setImageFile(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      notify("Please choose an image file", "error");
      e.target.value = "";
      setImageFile(null);
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      notify("Image must be 10 MB or smaller", "error");
      e.target.value = "";
      setImageFile(null);
      return;
    }

    setImageFile(file);
  }

  async function applyInitialStock(variantSku: string) {
    const stockQty = Number.parseInt(initialStock, 10);
    if (!Number.isNaN(stockQty) && stockQty >= 0 && variantSku) {
      await setInventory(variantSku, stockQty).catch(() => {});
    }
  }

  async function uploadSelectedImage(opts: {
    productId: string;
    variantSku?: string;
  }): Promise<boolean> {
    if (!imageFile) return true;

    try {
      if (opts.variantSku) {
        await uploadVariantImage(opts.productId, opts.variantSku, imageFile);
      } else {
        await uploadProductImage(opts.productId, imageFile);
      }
      return true;
    } catch (err) {
      notify(
        `Product created, but image upload failed: ${
          err instanceof Error ? err.message : "unknown error"
        }. You can retry from the product page.`,
        "error"
      );
      return false;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const parsedPrice = Number.parseFloat(price);
      if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
        throw new Error("Enter a valid price for the first variant");
      }

      let parent;
      try {
        parent = await createProductParent({
          name: name.trim(),
          id: id.trim(),
          brand: brand.trim(),
          material: material.trim(),
          description: description.trim() || undefined,
        });
      } catch {
        // Parent+variant API unavailable — fall back to the legacy flat create.
        const legacy = await createBagProduct({
          name: name.trim(),
          id: id.trim(),
          brand: brand.trim(),
          color: color.trim(),
          material: material.trim(),
        });
        await applyInitialStock(legacy.sku ?? legacy.id);
        const uploaded = await uploadSelectedImage({ productId: legacy.id });
        if (uploaded) notify(`Product created: ${name.trim()}`);
        navigate(`/products/${encodeURIComponent(legacy.id)}?category=bags`);
        return;
      }

      // Parent exists now — don't retry via the legacy endpoint below, it'd collide on this ID.
      let createdVariantSku: string | undefined;
      try {
        const variant = await createVariant(parent.id, {
          color: color.trim(),
          size: size.trim(),
          price: parsedPrice,
          sku: sku.trim() || undefined,
          status,
        });
        createdVariantSku = variant.sku;
        await applyInitialStock(variant.sku);
      } catch (err) {
        notify(
          `Style "${name.trim()}" was created, but the first variant failed: ${
            err instanceof Error ? err.message : "unknown error"
          }. Add a variant from the product page to finish setup.`,
          "error"
        );
        navigate(`/products/${encodeURIComponent(parent.id)}?category=bags`);
        return;
      }

      const uploaded = await uploadSelectedImage({
        productId: parent.id,
        variantSku: createdVariantSku,
      });
      if (uploaded) notify(`Product created: ${name.trim()}`);
      navigate(`/products/${encodeURIComponent(parent.id)}?category=bags`);
    } catch (err) {
      notify(friendlyCreateError(err), "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link to="/products" className="text-sm text-[#6D4AFF] hover:underline">
        ← Back to products
      </Link>

      <div>
        <h1 className="text-xl font-bold text-[#1C1B1F] sm:text-2xl">New product</h1>
        <p className="mt-0.5 text-sm text-[#6B6480]">
          Create a parent style, then the first sellable variant (SKU).
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-2xl border border-[#E5E3EE] bg-white p-6 shadow-[0_1px_4px_rgba(28,27,31,0.04)]"
      >
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#9D98B3]">
            Style (parent)
          </h2>
          <Field label="Name" id="name" required>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              placeholder="Cassette Bag"
            />
          </Field>
          <Field label="Product ID" id="id">
            <input
              id="id"
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              className={inputCls}
              placeholder="Auto-generated if empty"
            />
          </Field>
          <Field label="Brand" id="brand" required>
            <input
              id="brand"
              type="text"
              required
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Material" id="material" required>
            <input
              id="material"
              type="text"
              required
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Description" id="description">
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={inputCls}
              placeholder="Optional"
            />
          </Field>
        </section>

        <section className="space-y-4 border-t border-[#F0EEF8] pt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#9D98B3]">
            First variant (SKU)
          </h2>
          <Field label="Color" id="color" required>
            <input
              id="color"
              type="text"
              required
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className={inputCls}
              placeholder="Green"
            />
          </Field>
          <Field label="Size" id="size">
            <input
              id="size"
              type="text"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className={inputCls}
              placeholder="Optional for bags"
            />
          </Field>
          <Field label="SKU" id="sku">
            <input
              id="sku"
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className={inputCls}
              placeholder="Auto-generated if empty"
            />
          </Field>
          <Field label="Price (USD)" id="price" required>
            <input
              id="price"
              type="number"
              required
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className={inputCls}
              placeholder="2500"
            />
          </Field>
          <Field label="Status" id="status">
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={inputCls}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="draft">Draft</option>
            </select>
          </Field>
          <Field label="Initial stock" id="stock">
            <input
              id="stock"
              type="number"
              min={0}
              value={initialStock}
              onChange={(e) => setInitialStock(e.target.value)}
              className={inputCls}
              placeholder="Inventory quantity for this SKU"
            />
          </Field>
          <div className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#6B6480]">
              Image
            </span>
            <p className="text-sm text-[#6B6480]">
              Optional. Uploaded to this variant after the product is created
              (max 10 MB).
            </p>
            <input
              ref={imageInputRef}
              id="image"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageChange}
              disabled={loading}
            />
            {imageFile && imagePreviewUrl ? (
              <div className="flex items-start gap-3 rounded-xl border border-[#E5E3EE] bg-[#FAFAFA] p-3">
                <img
                  src={imagePreviewUrl}
                  alt=""
                  className="h-20 w-20 shrink-0 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#1C1B1F]">
                    {imageFile.name}
                  </p>
                  <p className="mt-0.5 text-xs text-[#9D98B3]">
                    {(imageFile.size / 1024).toFixed(1)} KB
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      disabled={loading}
                      className="text-xs font-semibold text-[#6D4AFF] hover:underline disabled:opacity-60"
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={clearImage}
                      disabled={loading}
                      className="text-xs font-semibold text-[#9D98B3] hover:underline disabled:opacity-60"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={loading}
                className="inline-flex w-full items-center justify-center rounded-xl border border-dashed border-[#E5E3EE] bg-[#FAFAFA] px-4 py-8 text-sm font-semibold text-[#6D4AFF] transition hover:border-[#6D4AFF]/40 hover:bg-[#F8F7FC] disabled:opacity-60"
              >
                Choose image
              </button>
            )}
          </div>
        </section>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-[#6D4AFF] py-3 text-sm font-semibold text-white transition hover:bg-[#5A38E8] disabled:opacity-60"
        >
          {loading ? (imageFile ? "Creating & uploading…" : "Creating…") : "Create product"}
        </button>
      </form>
    </div>
  );
}

// Backend returns a raw Postgres error string for ID collisions instead of a 409.
function friendlyCreateError(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  if (/duplicate key|23505|already exists/i.test(message)) {
    return "A product with this ID already exists. Leave the ID blank to auto-generate one, or choose a different ID.";
  }
  return message || "Failed to create product";
}

function Field({
  label,
  id,
  required,
  children,
}: {
  label: string;
  id: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="text-xs font-semibold uppercase tracking-wide text-[#6B6480]"
      >
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}
