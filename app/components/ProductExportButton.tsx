import { useState } from "react";
import type { Product } from "~/lib/api";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";
import {
  type TransferProgress,
  buildExportZip,
  downloadBlob,
} from "~/lib/product-transfer";

function safeFilenamePart(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.slice(0, 48) || "product";
}

/**
 * Export one parent product (variants + images) as a Dupli1 transfer ZIP.
 */
export function ProductExportButton({ product }: { product: Product }) {
  const { t } = useI18n();
  const { notify } = useNotify();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<TransferProgress | null>(null);

  async function handleExport() {
    if (busy) return;
    setBusy(true);
    setProgress({ phase: "loading", current: 0, total: 1, label: product.name });
    try {
      const blob = await buildExportZip([product], setProgress);
      const stamp = new Date().toISOString().slice(0, 10);
      const idPart = safeFilenamePart(product.id);
      downloadBlob(blob, `dupli1-product-${idPart}-${stamp}.zip`);
      notify(t("productDetail.exportDone"), "success");
    } catch (err) {
      notify(
        err instanceof Error ? err.message : t("productDetail.exportFailed"),
        "error"
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-1 sm:items-end">
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleExport()}
        className="rounded-xl border border-edge px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent/40 hover:bg-subtle disabled:opacity-50"
      >
        {busy ? t("productDetail.exporting") : t("productDetail.exportZip")}
      </button>
      {busy && progress?.label && (
        <p className="max-w-[14rem] truncate text-xs text-muted">
          {progress.phase}: {progress.label}
        </p>
      )}
    </div>
  );
}
