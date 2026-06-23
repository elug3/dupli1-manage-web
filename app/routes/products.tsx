import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  type Product,
  PRODUCT_CATEGORIES,
  getCategories,
  searchProducts,
} from "~/lib/api";

export function meta() {
  return [{ title: "Products | Schick Admin" }];
}

export default function Products() {
  const [categories, setCategories] = useState<string[]>([...PRODUCT_CATEGORIES]);
  const [activeCategory, setActiveCategory] = useState("shoes");
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1C1B1F]">Products</h1>
          <p className="mt-0.5 text-sm text-[#6B6480]">
            Read-only catalog search via the product service
          </p>
        </div>
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
          <div className="overflow-x-auto">
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
        )}
      </div>
    </div>
  );
}
