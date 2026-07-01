import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  type Product,
  PRODUCT_CATEGORIES,
  getCategories,
  searchProducts,
} from "~/lib/api";

export function meta() {
  return [{ title: "Products | Dupli1 Admin" }];
}

export default function Products() {
  const [categories, setCategories] = useState<string[]>([...PRODUCT_CATEGORIES]);
  const [activeCategory, setActiveCategory] = useState("bags");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCategories()
      .then((cats) => {
        if (cats.length > 0) setCategories(cats);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const filters: Record<string, string> = {};
    if (search.trim()) filters.title = search.trim();

    searchProducts(activeCategory, filters)
      .then(setProducts)
      .catch((err) => {
        setProducts([]);
        setError(err instanceof Error ? err.message : "Failed to load products");
      })
      .finally(() => setLoading(false));
  }, [activeCategory, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1C1B1F] sm:text-2xl">Products</h1>
          <p className="mt-0.5 text-sm text-[#6B6480]">
            Catalog search via the product service
          </p>
        </div>
        <Link
          to="/products/new"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#6D4AFF] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#5A38E8] active:scale-[0.98] sm:w-auto"
        >
          <PlusIcon />
          New product
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={[
              "rounded-full px-4 py-1.5 text-sm font-medium capitalize transition",
              activeCategory === cat
                ? "bg-[#6D4AFF] text-white"
                : "bg-white text-[#6B6480] border border-[#E5E3EE] hover:border-[#6D4AFF]/40",
            ].join(" ")}
          >
            {cat}
          </button>
        ))}
      </div>

      <input
        type="search"
        placeholder="Filter by title…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-md rounded-xl border border-[#E5E3EE] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20"
      />

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-[#E5E3EE] bg-white shadow-[0_1px_4px_rgba(28,27,31,0.04)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#6D4AFF] border-t-transparent" />
          </div>
        ) : products.length === 0 ? (
          <div className="px-5 py-16 text-center text-[#9D98B3]">
            No products found in this category
          </div>
        ) : (
          <>
            <div className="divide-y divide-[#F0EEF8] md:hidden">
              {products.map((product) => (
                <div key={product.id} className="space-y-3 p-4">
                  <div>
                    <p className="font-medium text-[#1C1B1F]">{product.name}</p>
                    <p className="mt-1 font-mono text-xs text-[#6B6480]">
                      {product.sku ?? "—"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-[#6B6480]">
                    <span className="rounded-full bg-[#F4F3F8] px-2.5 py-1">
                      {product.brand ?? "No brand"}
                    </span>
                    <span className="rounded-full bg-[#F4F3F8] px-2.5 py-1 capitalize">
                      {product.category}
                    </span>
                  </div>
                  <Link
                    to={`/products/${encodeURIComponent(product.id)}?category=${encodeURIComponent(product.category)}`}
                    className="inline-flex text-xs font-semibold text-[#6D4AFF] hover:underline"
                  >
                    Details →
                  </Link>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#F0EEF8] bg-[#FAFAFA] text-left">
                  {["Name", "SKU", "Brand", "Category", ""].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[#9D98B3]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr
                    key={product.id}
                    className="border-b border-[#F0EEF8] last:border-0 hover:bg-[#FAFAFA]"
                  >
                    <td className="px-5 py-3.5 font-medium text-[#1C1B1F]">
                      {product.name}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-[#6B6480]">
                      {product.sku ?? "—"}
                    </td>
                    <td className="px-5 py-3.5 text-[#6B6480]">
                      {product.brand ?? "—"}
                    </td>
                    <td className="px-5 py-3.5 capitalize text-[#6B6480]">
                      {product.category}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        to={`/products/${encodeURIComponent(product.id)}?category=${encodeURIComponent(product.category)}`}
                        className="text-xs font-semibold text-[#6D4AFF] hover:underline"
                      >
                        Details →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
