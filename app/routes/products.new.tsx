import { useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  createBagProduct,
  createProductParent,
  createVariant,
  setInventory,
} from "~/lib/api";
import { useNotify } from "~/lib/notifications";

export function meta() {
  return [{ title: "New Product | Dupli1 Admin" }];
}

const inputCls =
  "w-full rounded-xl border border-[#E5E3EE] bg-[#F8F7FC] px-4 py-2.5 text-sm text-[#1C1B1F] outline-none transition placeholder:text-[#B4B0C8] focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20";

export default function NewProduct() {
  const navigate = useNavigate();
  const { notify } = useNotify();
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [brand, setBrand] = useState("");
  const [material, setMaterial] = useState("");
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [initialStock, setInitialStock] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const parsedPrice = Number.parseFloat(price);
      if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
        throw new Error("Enter a valid price for the first variant");
      }

      let productId = id.trim();
      let variantSku = sku.trim();

      try {
        const parent = await createProductParent({
          name: name.trim(),
          id: productId,
          brand: brand.trim(),
          material: material.trim(),
        });
        productId = parent.id;

        const variant = await createVariant(productId, {
          color: color.trim(),
          size: size.trim(),
          price: parsedPrice,
          sku: variantSku || undefined,
        });
        variantSku = variant.sku;
      } catch {
        const legacy = await createBagProduct({
          name: name.trim(),
          id: productId,
          brand: brand.trim(),
          color: color.trim(),
          material: material.trim(),
        });
        productId = legacy.id;
        variantSku = legacy.sku ?? legacy.id;
      }

      const stockQty = Number.parseInt(initialStock, 10);
      if (!Number.isNaN(stockQty) && stockQty >= 0 && variantSku) {
        await setInventory(variantSku, stockQty).catch(() => {});
      }

      notify(`Product created: ${name.trim()}`);
      navigate(
        `/products/${encodeURIComponent(productId)}?category=bags`
      );
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Failed to create product",
        "error"
      );
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
          <Field label="Product ID" id="id" required>
            <input
              id="id"
              type="text"
              required
              value={id}
              onChange={(e) => setId(e.target.value)}
              className={inputCls}
              placeholder="BOT-001"
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
        </section>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-[#6D4AFF] py-3 text-sm font-semibold text-white transition hover:bg-[#5A38E8] disabled:opacity-60"
        >
          {loading ? "Creating…" : "Create product"}
        </button>
      </form>
    </div>
  );
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
