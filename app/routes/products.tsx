import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  type Product,
  formatProductColors,
  listAllProducts,
  productListPrice,
  productPreviewImage,
  productVariantCount,
} from "~/lib/api";

export function meta() {
  return [{ title: "Products | Dupli1 Admin" }];
}

export default function Products() {
  const navigate = useNavigate();
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listAllProducts()
      .then(setAllProducts)
      .catch((err) => {
        setAllProducts([]);
        setError(err instanceof Error ? err.message : "Failed to load products");
      })
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const cats = new Set(allProducts.map((p) => p.category.toLowerCase()));
    return ["all", ...Array.from(cats).sort()];
  }, [allProducts]);

  const products = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return allProducts.filter((p) => {
      if (activeCategory !== "all" && p.category.toLowerCase() !== activeCategory) {
        return false;
      }
      if (!needle) return true;
      return (
        p.name.toLowerCase().includes(needle) ||
        p.id.toLowerCase().includes(needle) ||
        (p.brand?.toLowerCase().includes(needle) ?? false) ||
        formatProductColors(p).toLowerCase().includes(needle)
      );
    });
  }, [allProducts, activeCategory, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1C1B1F] sm:text-2xl">Products</h1>
          <p className="mt-0.5 text-sm text-[#6B6480]">
            Parent styles via{" "}
            <code className="text-xs">GET /product/api/v1/products</code>
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
        placeholder="Filter by name, ID, brand, or color…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-md rounded-xl border border-[#E5E3EE] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20"
      />

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-[#E5E3EE] bg-white shadow-[0_1px_4px_rgba(28,27,31,0.04)]">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#6D4AFF] border-t-transparent" />
          </div>
        ) : products.length === 0 ? (
          <div className="px-5 py-16 text-center text-[#9D98B3]">
            No products found
          </div>
        ) : (
          <>
            <div className="divide-y divide-[#F0EEF8] md:hidden">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#F0EEF8] bg-[#FAFAFA] text-left">
                    {[
                      "Name",
                      "ID",
                      "Brand",
                      "Colors",
                      "Variants",
                      "Price",
                      "Status",
                    ].map((h) => (
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
                      role="link"
                      tabIndex={0}
                      onClick={() =>
                        navigate(
                          `/products/${encodeURIComponent(product.id)}?category=${encodeURIComponent(product.category)}`
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(
                            `/products/${encodeURIComponent(product.id)}?category=${encodeURIComponent(product.category)}`
                          );
                        }
                      }}
                      className="cursor-pointer border-b border-[#F0EEF8] last:border-0 hover:bg-[#FAFAFA]"
                    >
                      <td className="px-5 py-3.5 font-medium text-[#1C1B1F]">
                        {product.name}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs text-[#6B6480]">
                        {product.id}
                      </td>
                      <td className="px-5 py-3.5 text-[#6B6480]">
                        {product.brand ?? "—"}
                      </td>
                      <td className="px-5 py-3.5 text-[#6B6480]">
                        {formatProductColors(product)}
                      </td>
                      <td className="px-5 py-3.5 text-[#6B6480]">
                        {productVariantCount(product)}
                      </td>
                      <td className="px-5 py-3.5 text-[#6B6480]">
                        {productListPrice(product) ?? "—"}
                      </td>
                      <td className="px-5 py-3.5 capitalize text-[#6B6480]">
                        {product.status ?? "—"}
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

function ProductCard({ product }: { product: Product }) {
  const price = productListPrice(product);
  const imageUrl = productPreviewImage(product);

  return (
    <Link
      to={`/products/${encodeURIComponent(product.id)}?category=${encodeURIComponent(product.category)}`}
      className="flex gap-3 p-4 transition hover:bg-[#FAFAFA] active:bg-[#F4F3F8]"
    >
      <ProductPreviewThumb imageUrl={imageUrl} name={product.name} />
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <p className="font-medium text-[#1C1B1F]">{product.name}</p>
          <p className="mt-1 font-mono text-xs text-[#6B6480]">{product.id}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-[#6B6480]">
          <span className="rounded-full bg-[#F4F3F8] px-2.5 py-1">
            {product.brand ?? "No brand"}
          </span>
          <span className="rounded-full bg-[#F4F3F8] px-2.5 py-1">
            {formatProductColors(product)}
          </span>
          <span className="rounded-full bg-[#F4F3F8] px-2.5 py-1">
            {productVariantCount(product)} variant
            {productVariantCount(product) === 1 ? "" : "s"}
          </span>
          {price && (
            <span className="rounded-full bg-[#F4F3F8] px-2.5 py-1">{price}</span>
          )}
          {product.status && (
            <span className="rounded-full bg-[#F4F3F8] px-2.5 py-1 capitalize">
              {product.status}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function ProductPreviewThumb({
  imageUrl,
  name,
}: {
  imageUrl: string | null;
  name: string;
}) {
  return (
    <div className="size-16 shrink-0 overflow-hidden rounded-xl border border-[#E5E3EE] bg-[#FAFAFA]">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="size-full object-cover"
          loading="lazy"
        />
      ) : (
        <div
          className="flex size-full items-center justify-center text-[#9D98B3]"
          aria-hidden="true"
        >
          <ProductPlaceholderIcon />
        </div>
      )}
      <span className="sr-only">{name}</span>
    </div>
  );
}

function ProductPlaceholderIcon() {
  return (
    <svg className="size-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2l9 4.5V17L12 21.5 3 17V6.5L12 2z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M12 2v19.5M3 6.5l9 4.5 9-4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
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
