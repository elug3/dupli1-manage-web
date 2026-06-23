import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { type Product, getProduct } from "~/lib/api";

export function meta() {
  return [{ title: "Product | Schick Admin" }];
}

export default function ProductDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const category = searchParams.get("category") ?? "shoes";
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getProduct(category, id)
      .then((p) => {
        if (!p) throw new Error("Product not found");
        setProduct(p);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Product not found")
      )
      .finally(() => setLoading(false));
  }, [id, category]);

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

  return (
    <div className="space-y-6">
      <Link to="/products" className="text-sm text-[#6D4AFF] hover:underline">
        ← Back to products
      </Link>

      <div className="rounded-2xl border border-[#E5E3EE] bg-white p-8 shadow-[0_1px_4px_rgba(28,27,31,0.04)]">
        <h1 className="text-2xl font-bold text-[#1C1B1F]">{product.name}</h1>
        <p className="mt-1 text-sm capitalize text-[#6B6480]">{product.category}</p>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          {[
            ["SKU", product.sku],
            ["Brand", product.brand],
            ["Color", product.color],
            ["Material", product.material],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-[#9D98B3]">
                {label}
              </dt>
              <dd className="mt-1 text-sm text-[#1C1B1F]">{value ?? "—"}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#9D98B3]">
            Raw API payload
          </h2>
          <pre className="mt-2 overflow-x-auto rounded-xl bg-[#F4F3F8] p-4 text-xs text-[#1C1B1F]">
            {JSON.stringify(product.raw, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
