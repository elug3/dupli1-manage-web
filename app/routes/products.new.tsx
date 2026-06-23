import { Link } from "react-router";

export function meta() {
  return [{ title: "New Product | Schick Admin" }];
}

export default function NewProduct() {
  return (
    <div className="space-y-4">
      <Link to="/products" className="text-sm text-[#6D4AFF] hover:underline">
        ← Back to products
      </Link>
      <div className="rounded-2xl border border-[#E5E3EE] bg-white p-12 text-center shadow-[0_1px_4px_rgba(28,27,31,0.04)]">
        <h1 className="text-xl font-bold text-[#1C1B1F]">Product creation unavailable</h1>
        <p className="mt-2 text-sm text-[#6B6480]">
          The product service exposes read-only search endpoints. Use the catalog
          browser to inspect items by category.
        </p>
      </div>
    </div>
  );
}
