import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { createBagProduct } from "~/lib/api";
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
  const [color, setColor] = useState("");
  const [material, setMaterial] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const product = await createBagProduct({
        name: name.trim(),
        id: id.trim(),
        brand: brand.trim(),
        color: color.trim(),
        material: material.trim(),
      });
      notify(`Product created: ${product.name}`);
      navigate(
        `/products/${encodeURIComponent(product.id)}?category=${encodeURIComponent(product.category)}`
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
          Add a bag to the catalog via{" "}
          <code className="text-xs">POST /product/api/v1/products</code>
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-[#E5E3EE] bg-white p-6 shadow-[0_1px_4px_rgba(28,27,31,0.04)]"
      >
        <Field label="Name" id="name" required>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            placeholder="Leather tote bag"
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
            placeholder="BAG-001"
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
            placeholder="Dupli1"
          />
        </Field>

        <Field label="Color" id="color" required>
          <input
            id="color"
            type="text"
            required
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className={inputCls}
            placeholder="Black"
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
            placeholder="Leather"
          />
        </Field>

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
