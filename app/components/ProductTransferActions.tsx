import { useRef, useState } from "react";
import { Link } from "react-router";
import type { ProductListQuery } from "~/lib/api";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";
import {
  EXPORT_WARN_PRODUCT_COUNT,
  type ImportPreview,
  type ImportResult,
  type TransferProgress,
  buildExportZip,
  buildImportPreview,
  downloadBlob,
  fetchAllProductsForExport,
  formatGapLabel,
  parseImportZip,
  runImport,
} from "~/lib/product-transfer";

type PanelMode = "closed" | "export" | "import";

function progressPercent(p: TransferProgress | null): number {
  if (!p || p.total <= 0) return 0;
  return Math.min(100, Math.round((p.current / p.total) * 100));
}

export function ProductTransferActions({
  listQuery,
  filteredTotal,
}: {
  listQuery: ProductListQuery;
  filteredTotal: number;
}) {
  const { t } = useI18n();
  const { notify } = useNotify();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [panel, setPanel] = useState<PanelMode>("closed");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  function closePanel() {
    if (busy) return;
    setPanel("closed");
    setProgress(null);
    setPreview(null);
    setImportResult(null);
  }

  async function handleExport() {
    if (busy) return;
    if (filteredTotal <= 0) {
      notify(t("products.transferNothingToExport"), "error");
      return;
    }
    if (filteredTotal > EXPORT_WARN_PRODUCT_COUNT) {
      const ok = window.confirm(
        t("products.transferExportLargeConfirm", {
          count: String(filteredTotal),
        })
      );
      if (!ok) return;
    } else {
      const ok = window.confirm(
        t("products.transferExportConfirm", { count: String(filteredTotal) })
      );
      if (!ok) return;
    }

    setPanel("export");
    setBusy(true);
    setProgress({ phase: "listing", current: 0, total: filteredTotal });
    try {
      const products = await fetchAllProductsForExport(listQuery, setProgress);
      const blob = await buildExportZip(products, setProgress);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `dupli1-products-${stamp}.zip`);
      notify(
        t("products.transferExportDone", { count: String(products.length) }),
        "success"
      );
      setPanel("closed");
      setProgress(null);
    } catch (err) {
      notify(
        err instanceof Error ? err.message : t("products.transferExportFailed"),
        "error"
      );
    } finally {
      setBusy(false);
    }
  }

  async function onZipPicked(file: File | undefined) {
    if (!file || busy) return;
    setPanel("import");
    setBusy(true);
    setPreview(null);
    setImportResult(null);
    setProgress({ phase: "parsing", current: 0, total: 1 });
    try {
      const { manifest, files } = await parseImportZip(file);
      const next = await buildImportPreview(manifest, files, setProgress);
      setPreview(next);
      setProgress(null);
      if (next.gaps.length > 0) {
        notify(t("products.transferMasterGaps"), "error");
      }
    } catch (err) {
      notify(
        err instanceof Error ? err.message : t("products.transferImportFailed"),
        "error"
      );
      setPanel("closed");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDryRun() {
    if (!preview || busy) return;
    setBusy(true);
    try {
      const result = await runImport(preview, {
        dryRun: true,
        onProgress: setProgress,
      });
      setImportResult(result);
      notify(
        t("products.transferDryRunDone", {
          created: String(result.created),
          skipped: String(result.skipped),
          failed: String(result.failed),
        }),
        "success"
      );
    } catch (err) {
      notify(
        err instanceof Error ? err.message : t("products.transferImportFailed"),
        "error"
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function handleImport() {
    if (!preview || busy) return;
    if (!preview.canImport) {
      notify(t("products.transferCannotImport"), "error");
      return;
    }
    const ok = window.confirm(
      t("products.transferImportConfirm", {
        count: String(preview.rows.filter((r) => r.status === "ok").length),
      })
    );
    if (!ok) return;

    setBusy(true);
    setImportResult(null);
    try {
      const result = await runImport(preview, {
        dryRun: false,
        onProgress: setProgress,
      });
      setImportResult(result);
      notify(
        t("products.transferImportDone", {
          created: String(result.created),
          skipped: String(result.skipped),
          failed: String(result.failed),
        }),
        result.failed > 0 ? "error" : "success"
      );
    } catch (err) {
      notify(
        err instanceof Error ? err.message : t("products.transferImportFailed"),
        "error"
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function downloadResultLog() {
    if (!importResult) return;
    const blob = new Blob([JSON.stringify(importResult, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, `dupli1-import-result-${Date.now()}.json`);
  }

  const pct = progressPercent(progress);

  return (
    <div className="flex w-full flex-col gap-3 sm:w-auto">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleExport()}
          className="inline-flex items-center justify-center rounded-xl border border-edge bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-accent/40 disabled:opacity-50"
        >
          {t("products.exportZip")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center justify-center rounded-xl border border-edge bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-accent/40 disabled:opacity-50"
        >
          {t("products.importZip")}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => void onZipPicked(e.target.files?.[0])}
        />
      </div>

      {panel !== "closed" && (
        <div className="rounded-2xl border border-edge bg-surface p-4 shadow-[0_1px_4px_rgba(28,27,31,0.04)] sm:min-w-[28rem]">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-ink">
                {panel === "export"
                  ? t("products.transferExportTitle")
                  : t("products.transferImportTitle")}
              </h2>
              {progress && (
                <p className="mt-1 text-xs text-muted">
                  {progress.label
                    ? `${progress.phase}: ${progress.label}`
                    : progress.phase}
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={closePanel}
              className="text-xs font-medium text-muted hover:text-ink disabled:opacity-50"
            >
              {t("common.cancel")}
            </button>
          </div>

          {progress && (
            <div className="mb-3 h-2 overflow-hidden rounded-full bg-panel">
              <div
                className="h-full rounded-full bg-accent transition-[width]"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}

          {panel === "import" && preview && (
            <div className="space-y-3">
              {preview.gaps.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                  <p className="font-semibold">
                    {t("products.transferMasterGaps")}
                  </p>
                  <ul className="mt-1 list-inside list-disc text-xs">
                    {preview.gaps.slice(0, 12).map((g) => (
                      <li key={`${g.kind}:${g.brandCode ?? ""}:${g.code}`}>
                        {formatGapLabel(g)}
                        {g.productName ? ` (${g.productName})` : ""}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/catalog"
                    className="mt-2 inline-block text-xs font-semibold underline"
                  >
                    {t("products.transferOpenCatalog")}
                  </Link>
                </div>
              )}

              <div className="max-h-48 overflow-auto rounded-xl border border-edge">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-panel text-faint">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold">
                        {t("products.colName")}
                      </th>
                      <th className="px-2 py-1.5 font-semibold">
                        {t("products.colVariants")}
                      </th>
                      <th className="px-2 py-1.5 font-semibold">
                        {t("products.transferImages")}
                      </th>
                      <th className="px-2 py-1.5 font-semibold">
                        {t("products.colStatus")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr key={row.index} className="border-t border-edge">
                        <td className="px-2 py-1.5 text-ink">
                          <div className="font-medium">{row.name}</div>
                          <div className="text-faint">
                            {row.brandCode}_{row.styleCode}
                          </div>
                          {row.message && (
                            <div className="text-muted">{row.message}</div>
                          )}
                        </td>
                        <td className="px-2 py-1.5">{row.variantCount}</td>
                        <td className="px-2 py-1.5">{row.imageCount}</td>
                        <td className="px-2 py-1.5 capitalize">{row.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || preview.rows.length === 0}
                  onClick={() => void handleDryRun()}
                  className="rounded-xl border border-edge px-3 py-2 text-xs font-semibold text-ink disabled:opacity-50"
                >
                  {t("products.transferDryRun")}
                </button>
                <button
                  type="button"
                  disabled={busy || !preview.canImport}
                  onClick={() => void handleImport()}
                  className="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {t("products.transferRunImport")}
                </button>
              </div>
            </div>
          )}

          {importResult && (
            <div className="mt-3 space-y-2 border-t border-edge pt-3">
              <p className="text-xs text-muted">
                {t("products.transferImportDone", {
                  created: String(importResult.created),
                  skipped: String(importResult.skipped),
                  failed: String(importResult.failed),
                })}
              </p>
              <button
                type="button"
                onClick={downloadResultLog}
                className="text-xs font-semibold text-accent underline"
              >
                {t("products.transferDownloadLog")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
