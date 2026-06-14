import { useEffect, useRef, useState } from "react";
import {
  type Product,
  type ProductStatus,
  createProduct,
  deleteProduct,
  getProducts,
  updateProduct,
} from "~/lib/api";

export function meta() {
  return [{ title: "Products | Schick Admin" }];
}

const CATEGORIES = [
  "All",
  "bags",
  "shoes",
  "outerwear",
  "bottoms",
  "tops",
  "dresses",
];

type FormData = Omit<Product, "id" | "createdAt">;

const EMPTY_FORM: FormData = {
  name: "",
  category: "bags",
  price: 0,
  stock: 0,
  description: "",
  brand: "",
  color: "",
  material: "",
  status: "active",
};

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  useEffect(() => {
    getProducts()
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = products.filter((p) => {
    const catMatch =
      activeCategory === "All" || p.category === activeCategory;
    const searchMatch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.brand?.toLowerCase().includes(search.toLowerCase());
    return catMatch && searchMatch;
  });

  function openCreate() {
    setEditing(null);
    setDrawerOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setDrawerOpen(true);
  }

  async function handleSave(data: FormData) {
    if (editing) {
      const updated = await updateProduct(editing.id, data).catch(() => ({
        ...editing,
        ...data,
      }));
      setProducts((ps) => ps.map((p) => (p.id === editing.id ? updated : p)));
    } else {
      const created = await createProduct(data).catch(() => ({
        ...data,
        id: `p${Date.now()}`,
        createdAt: new Date().toISOString(),
      }));
      setProducts((ps) => [created, ...ps]);
    }
    setDrawerOpen(false);
  }

  async function handleDelete(product: Product) {
    await deleteProduct(product.id).catch(() => {});
    setProducts((ps) => ps.filter((p) => p.id !== product.id));
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1C1B1F]">Products</h1>
          <p className="mt-0.5 text-sm text-[#6B6480]">
            {products.length} products total
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-xl bg-[#6D4AFF] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#5A38E8] active:scale-[0.98]"
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          Add product
        </button>
      </div>

      {/* Category tabs + search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl border border-[#E5E3EE] bg-white p-1 shadow-[0_1px_3px_rgba(28,27,31,0.04)]">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={[
                "rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition",
                activeCategory === cat
                  ? "bg-[#6D4AFF] text-white shadow-sm"
                  : "text-[#6B6480] hover:bg-[#F4F3F8] hover:text-[#1C1B1F]",
              ].join(" ")}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-48">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#9D98B3]"
            viewBox="0 0 24 24"
            fill="none"
          >
            <path
              d="m20 20-4.35-4.35M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          <input
            type="search"
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-[#E5E3EE] bg-white py-2.5 pl-9 pr-4 text-sm text-[#1C1B1F] outline-none transition placeholder:text-[#B4B0C8] focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20 shadow-[0_1px_3px_rgba(28,27,31,0.04)]"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-[#E5E3EE] bg-white shadow-[0_1px_4px_rgba(28,27,31,0.04)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#6D4AFF] border-t-transparent" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#F0EEF8] bg-[#FAFAFA]">
                  {["Product", "Category", "Price", "Stock", "Status", ""].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#9D98B3]"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-16 text-center text-[#9D98B3]"
                    >
                      No products match your search
                    </td>
                  </tr>
                ) : (
                  filtered.map((product) => (
                    <ProductRow
                      key={product.id}
                      product={product}
                      onEdit={() => openEdit(product)}
                      onDelete={() => setDeleteTarget(product)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Slide-over drawer */}
      {drawerOpen && (
        <ProductDrawer
          product={editing}
          onSave={handleSave}
          onClose={() => setDrawerOpen(false)}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <DeleteModal
          product={deleteTarget}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function ProductRow({
  product,
  onEdit,
  onDelete,
}: {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <tr className="border-b border-[#F0EEF8] last:border-0 hover:bg-[#FAFAFA]">
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F4F3F8] text-xs font-bold text-[#6D4AFF]">
            {product.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="font-medium text-[#1C1B1F]">{product.name}</div>
            {product.brand && (
              <div className="text-xs text-[#9D98B3]">{product.brand}</div>
            )}
          </div>
        </div>
      </td>
      <td className="px-5 py-4">
        <span className="capitalize text-[#6B6480]">{product.category}</span>
      </td>
      <td className="px-5 py-4 font-semibold text-[#1C1B1F]">
        ${product.price.toFixed(0)}
      </td>
      <td className="px-5 py-4">
        {product.stock === 0 ? (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
            Out of stock
          </span>
        ) : product.stock <= 5 ? (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            Low · {product.stock}
          </span>
        ) : (
          <span className="text-[#1C1B1F]">{product.stock}</span>
        )}
      </td>
      <td className="px-5 py-4">
        <ProductStatusBadge status={product.status} />
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={onEdit}
            className="rounded-lg p-2 text-[#6B6480] transition hover:bg-[#F4F3F8] hover:text-[#1C1B1F]"
            title="Edit"
          >
            <EditIcon />
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg p-2 text-[#6B6480] transition hover:bg-red-50 hover:text-red-600"
            title="Delete"
          >
            <TrashIcon />
          </button>
        </div>
      </td>
    </tr>
  );
}

function ProductDrawer({
  product,
  onSave,
  onClose,
}: {
  product: Product | null;
  onSave: (data: FormData) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormData>(
    product
      ? {
          name: product.name,
          category: product.category,
          price: product.price,
          stock: product.stock,
          description: product.description,
          brand: product.brand ?? "",
          color: product.color ?? "",
          material: product.material ?? "",
          status: product.status,
        }
      : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstInput.current?.focus();
  }, []);

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save product");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#E5E3EE] px-6 py-4">
          <h2 className="text-base font-bold text-[#1C1B1F]">
            {product ? "Edit product" : "New product"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#6B6480] hover:bg-[#F4F3F8]"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col overflow-y-auto"
        >
          <div className="flex-1 space-y-5 px-6 py-5">
            <Field label="Product name" required>
              <input
                ref={firstInput}
                required
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Milanese Leather Tote"
                className={inputCls}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Category" required>
                <select
                  value={form.category}
                  onChange={(e) => set("category", e.target.value)}
                  className={inputCls}
                >
                  {CATEGORIES.slice(1).map((c) => (
                    <option key={c} value={c} className="capitalize">
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Status" required>
                <select
                  value={form.status}
                  onChange={(e) =>
                    set("status", e.target.value as ProductStatus)
                  }
                  className={inputCls}
                >
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                  <option value="archived">Archived</option>
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Price (USD)" required>
                <input
                  type="number"
                  min={0}
                  step={1}
                  required
                  value={form.price || ""}
                  onChange={(e) => set("price", Number(e.target.value))}
                  placeholder="0"
                  className={inputCls}
                />
              </Field>

              <Field label="Stock" required>
                <input
                  type="number"
                  min={0}
                  step={1}
                  required
                  value={form.stock || ""}
                  onChange={(e) => set("stock", Number(e.target.value))}
                  placeholder="0"
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Field label="Brand">
                <input
                  value={form.brand ?? ""}
                  onChange={(e) => set("brand", e.target.value)}
                  placeholder="e.g. Schick"
                  className={inputCls}
                />
              </Field>
              <Field label="Color">
                <input
                  value={form.color ?? ""}
                  onChange={(e) => set("color", e.target.value)}
                  placeholder="e.g. Cognac"
                  className={inputCls}
                />
              </Field>
              <Field label="Material">
                <input
                  value={form.material ?? ""}
                  onChange={(e) => set("material", e.target.value)}
                  placeholder="e.g. Leather"
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label="Description">
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Short product description…"
                className={inputCls + " resize-none"}
              />
            </Field>

            {error && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}
          </div>

          <div className="border-t border-[#E5E3EE] px-6 py-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-[#E5E3EE] py-2.5 text-sm font-semibold text-[#6B6480] transition hover:bg-[#F4F3F8]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-[#6D4AFF] py-2.5 text-sm font-semibold text-white transition hover:bg-[#5A38E8] disabled:opacity-60"
            >
              {saving ? "Saving…" : product ? "Save changes" : "Create product"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function DeleteModal({
  product,
  onConfirm,
  onCancel,
}: {
  product: Product;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <TrashIcon className="size-5 text-red-600" />
        </div>
        <h3 className="text-base font-bold text-[#1C1B1F]">Delete product</h3>
        <p className="mt-1.5 text-sm text-[#6B6480]">
          Are you sure you want to delete{" "}
          <span className="font-semibold text-[#1C1B1F]">{product.name}</span>?
          This action cannot be undone.
        </p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-[#E5E3EE] py-2.5 text-sm font-semibold text-[#6B6480] hover:bg-[#F4F3F8]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold uppercase tracking-wide text-[#6B6480]">
        {label}
        {required && <span className="ml-0.5 text-[#6D4AFF]">*</span>}
      </label>
      {children}
    </div>
  );
}

function ProductStatusBadge({ status }: { status: ProductStatus }) {
  const map: Record<ProductStatus, { label: string; class: string }> = {
    active: { label: "Active", class: "bg-emerald-100 text-emerald-800" },
    draft: { label: "Draft", class: "bg-amber-100 text-amber-800" },
    archived: { label: "Archived", class: "bg-slate-100 text-slate-600" },
  };
  const { label, class: cls } = map[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

const inputCls =
  "w-full rounded-xl border border-[#E5E3EE] bg-[#F8F7FC] px-4 py-2.5 text-sm text-[#1C1B1F] outline-none transition placeholder:text-[#B4B0C8] focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20";

function EditIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? "size-4"} viewBox="0 0 24 24" fill="none">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
