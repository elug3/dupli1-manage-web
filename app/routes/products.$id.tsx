import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import {
  type Product,
  getManageProduct,
  getProduct,
  uploadProductImage,
} from "~/lib/api";
import { useNotify } from "~/lib/notifications";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function meta() {
  return [{ title: "Product | Dupli1 Admin" }];
}

export default function ProductDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const category = searchParams.get("category") ?? "bags";
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const productId = id;

    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        const p = await getManageProduct(productId);
        if (!cancelled) setProduct(p);
      } catch {
        try {
          const p = await getProduct(category, productId);
          if (!p) throw new Error("Product not found");
          if (!cancelled) setProduct(p);
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Product not found");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
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

      <div className="rounded-2xl border border-[#E5E3EE] bg-white p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)] sm:p-8">
        <h1 className="text-2xl font-bold text-[#1C1B1F]">{product.name}</h1>
        <p className="mt-1 text-sm capitalize text-[#6B6480]">{product.category}</p>

        <ProductImages
          productId={product.id}
          imageUrls={product.imageUrls ?? []}
          onUploaded={setProduct}
        />

        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          {[
            ["ID", product.id],
            ["SKU", product.sku],
            ["Brand", product.brand],
            ["Color", product.color],
            ["Material", product.material],
            ["Status", product.status],
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

function ProductImages({
  productId,
  imageUrls,
  onUploaded,
}: {
  productId: string;
  imageUrls: string[];
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

  return (
    <div className="mt-6 border-t border-[#F0EEF8] pt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#9D98B3]">
            Images
          </h2>
          <p className="mt-1 text-sm text-[#6B6480]">
            Uploads to S3 via{" "}
            <code className="text-xs">PUT /product/api/v1/products/{"{id}"}/image</code>
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
          No images yet. Upload a product photo to store it in the image bucket.
        </div>
      )}
    </div>
  );
}
