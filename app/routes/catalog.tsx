import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import {
  type CatalogCodeName,
  type CatalogColor,
  type CatalogStyle,
  type ColorSwatchInput,
  createBrand,
  createColor,
  createEdition,
  createSize,
  createStyle,
  deleteBrand,
  deleteColor,
  deleteEdition,
  deleteSize,
  deleteStyle,
  listBrands,
  listColors,
  listEditions,
  listSizes,
  listStyles,
  renameBrand,
  renameEdition,
  renameSize,
  renameStyle,
  updateColor,
} from "~/lib/api";
import { normalizeHexInput, swatchPreview } from "~/lib/color-swatch";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";

export function meta() {
  return [{ title: "Catalog masters | Dupli1 Admin" }];
}

type Tab = "brands" | "colors" | "sizes" | "editions";

const inputCls =
  "w-full rounded-xl border border-edge bg-panel px-3 py-2 text-sm text-ink outline-none transition placeholder:text-soft focus:border-accent focus:ring-2 focus:ring-accent/20";

export default function CatalogMasters() {
  const { notify } = useNotify();
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("brands");
  const [brands, setBrands] = useState<CatalogCodeName[]>([]);
  const [colors, setColors] = useState<CatalogColor[]>([]);
  const [sizes, setSizes] = useState<CatalogCodeName[]>([]);
  const [editions, setEditions] = useState<CatalogCodeName[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string>("");
  const [styles, setStyles] = useState<CatalogStyle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMasters = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [b, c, s, e] = await Promise.all([
        listBrands(),
        listColors(),
        listSizes(),
        listEditions(),
      ]);
      setBrands(b);
      setColors(c);
      setSizes(s);
      setEditions(e);
      setSelectedBrand((prev) => {
        if (prev && b.some((row) => row.code === prev)) return prev;
        return b[0]?.code ?? "";
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("catalog.failedToLoad")
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadMasters();
  }, [loadMasters]);

  useEffect(() => {
    if (!selectedBrand) {
      setStyles([]);
      return;
    }
    let cancelled = false;
    listStyles(selectedBrand)
      .then((rows) => {
        if (!cancelled) setStyles(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          notify(
            err instanceof Error
              ? err.message
              : t("catalog.failedToLoadStyles"),
            "error"
          );
          setStyles([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBrand, notify, t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink sm:text-2xl">
            {t("catalog.title")}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {t("catalog.subtitle")}
          </p>
        </div>
        <Link
          to="/catalog/overview"
          className="inline-flex shrink-0 items-center justify-center rounded-xl border border-edge bg-surface px-4 py-2.5 text-sm font-semibold text-ink shadow-sm transition hover:border-accent/40 hover:text-accent"
        >
          {t("catalog.overviewLink")}
        </Link>
      </div>

      {error && (
        <div className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger-fg">
          {error}
        </div>
      )}

      <div className="flex w-max max-w-full flex-wrap gap-1 rounded-xl border border-edge bg-surface p-1 shadow-[0_1px_3px_rgba(28,27,31,0.04)]">
        {(
          [
            ["brands", t("catalog.tabBrandsStyles")],
            ["colors", t("catalog.tabColors")],
            ["sizes", t("catalog.tabSizes")],
            ["editions", t("catalog.tabEditions")],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={[
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              tab === value
                ? "bg-accent text-white shadow-sm"
                : "text-muted hover:bg-page hover:text-ink",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "brands" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <MasterPanel
            title={t("catalog.brandsTitle")}
            description={t("catalog.brandsDescription")}
            rows={brands}
            onCreate={async (code, name) => {
              await createBrand(code, name);
              notify(t("catalog.brandCreated", { code }));
              await loadMasters();
            }}
            onRename={async (code, name) => {
              await renameBrand(code, name);
              notify(t("catalog.brandRenamed", { code }));
              await loadMasters();
            }}
            onDelete={async (code) => {
              await deleteBrand(code);
              notify(t("catalog.brandDeleted", { code }));
              await loadMasters();
            }}
            codePlaceholder={t("catalog.placeholderBrandCode")}
            codePattern="^[A-Za-z]{2,3}$"
            codeHint={t("catalog.codeHintLetters")}
          />

          <div className="space-y-4 rounded-2xl border border-edge bg-surface p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)]">
            <div>
              <h2 className="text-sm font-semibold text-ink">
                {t("catalog.stylesTitle")}
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                {t("catalog.stylesDescription")}
              </p>
            </div>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                {t("catalog.brand")}
              </span>
              <select
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
                className={inputCls}
                disabled={brands.length === 0}
              >
                {brands.length === 0 ? (
                  <option value="">{t("catalog.createBrandFirst")}</option>
                ) : (
                  brands.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.code} — {b.name}
                    </option>
                  ))
                )}
              </select>
            </label>
            {selectedBrand ? (
              <MasterTable
                rows={styles}
                onCreate={async (code, name) => {
                  await createStyle(selectedBrand, code, name);
                  notify(t("catalog.styleCreated", { code }));
                  setStyles(await listStyles(selectedBrand));
                }}
                onRename={async (code, name) => {
                  await renameStyle(selectedBrand, code, name);
                  notify(t("catalog.styleRenamed", { code }));
                  setStyles(await listStyles(selectedBrand));
                }}
                onDelete={async (code) => {
                  await deleteStyle(selectedBrand, code);
                  notify(t("catalog.styleDeleted", { code }));
                  setStyles(await listStyles(selectedBrand));
                }}
                codePlaceholder={t("catalog.placeholderStyleCode")}
                codePattern="^[A-Za-z0-9]{1,12}$"
                codeHint={t("catalog.codeHintAlphanumeric")}
              />
            ) : (
              <p className="text-sm text-muted">
                {t("catalog.selectBrandToManageStyles")}
              </p>
            )}
          </div>
        </div>
      )}

      {tab === "colors" && (
        <MasterPanel
          title={t("catalog.colorsTitle")}
          description={t("catalog.colorsDescription")}
          rows={colors}
          swatches
          onCreate={async (code, name, swatch) => {
            await createColor(code, name, swatch);
            notify(t("catalog.colorCreated", { code }));
            await loadMasters();
          }}
          onRename={async (code, name, swatch) => {
            await updateColor(code, name, swatch ?? { hex: "", hex2: "" });
            notify(t("catalog.colorUpdated", { code }));
            await loadMasters();
          }}
          onDelete={async (code) => {
            await deleteColor(code);
            notify(t("catalog.colorDeleted", { code }));
            await loadMasters();
          }}
          codePlaceholder={t("catalog.placeholderColorCode")}
          codePattern="^[A-Za-z0-9]{1,12}$"
          codeHint={t("catalog.codeHintAlphanumeric")}
        />
      )}

      {tab === "sizes" && (
        <MasterPanel
          title={t("catalog.sizesTitle")}
          description={t("catalog.sizesDescription")}
          rows={sizes}
          onCreate={async (code, name) => {
            await createSize(code, name);
            notify(t("catalog.sizeCreated", { code }));
            await loadMasters();
          }}
          onRename={async (code, name) => {
            await renameSize(code, name);
            notify(t("catalog.sizeRenamed", { code }));
            await loadMasters();
          }}
          onDelete={async (code) => {
            await deleteSize(code);
            notify(t("catalog.sizeDeleted", { code }));
            await loadMasters();
          }}
          codePlaceholder={t("catalog.placeholderSizeCode")}
          codePattern="^[A-Za-z0-9]{1,12}$"
          codeHint={t("catalog.codeHintAlphanumeric")}
        />
      )}

      {tab === "editions" && (
        <MasterPanel
          title={t("catalog.editionsTitle")}
          description={t("catalog.editionsDescription")}
          rows={editions}
          onCreate={async (code, name) => {
            await createEdition(code, name);
            notify(t("catalog.editionCreated", { code }));
            await loadMasters();
          }}
          onRename={async (code, name) => {
            await renameEdition(code, name);
            notify(t("catalog.editionRenamed", { code }));
            await loadMasters();
          }}
          onDelete={async (code) => {
            await deleteEdition(code);
            notify(t("catalog.editionDeleted", { code }));
            await loadMasters();
          }}
          codePlaceholder={t("catalog.placeholderEditionCode")}
          codePattern="^[A-Za-z0-9]{1,12}$"
          codeHint={t("catalog.codeHintAlphanumeric")}
        />
      )}
    </div>
  );
}

function MasterPanel({
  title,
  description,
  rows,
  onCreate,
  onRename,
  onDelete,
  codePlaceholder,
  codePattern,
  codeHint,
  swatches,
}: {
  title: string;
  description: string;
  rows: CatalogColor[];
  onCreate: (code: string, name: string, swatch?: ColorSwatchInput) => Promise<void>;
  onRename: (code: string, name: string, swatch?: ColorSwatchInput) => Promise<void>;
  onDelete: (code: string) => Promise<void>;
  codePlaceholder: string;
  codePattern: string;
  codeHint: string;
  /** Colors only: edit the storefront swatch fills (hex, two-tone hex2). */
  swatches?: boolean;
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-edge bg-surface p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)]">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </div>
      <MasterTable
        rows={rows}
        onCreate={onCreate}
        onRename={onRename}
        onDelete={onDelete}
        codePlaceholder={codePlaceholder}
        codePattern={codePattern}
        codeHint={codeHint}
        swatches={swatches}
      />
    </div>
  );
}

function MasterTable({
  rows,
  onCreate,
  onRename,
  onDelete,
  codePlaceholder,
  codePattern,
  codeHint,
  swatches,
}: {
  rows: CatalogColor[];
  onCreate: (code: string, name: string, swatch?: ColorSwatchInput) => Promise<void>;
  onRename: (code: string, name: string, swatch?: ColorSwatchInput) => Promise<void>;
  onDelete: (code: string) => Promise<void>;
  codePlaceholder: string;
  codePattern: string;
  codeHint: string;
  swatches?: boolean;
}) {
  const { notify } = useNotify();
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [swatch, setSwatch] = useState<ColorSwatchInput>(EMPTY_SWATCH);
  const [saving, setSaving] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSwatch, setEditSwatch] = useState<ColorSwatchInput>(EMPTY_SWATCH);

  /** The fills to send, or undefined (after telling the operator) when invalid. */
  function checkedSwatch(value: ColorSwatchInput): ColorSwatchInput | undefined {
    const hex = normalizeHexInput(value.hex);
    const hex2 = normalizeHexInput(value.hex2);
    if (hex === null || hex2 === null) {
      notify(t("catalog.swatchInvalid"), "error");
      return undefined;
    }
    if (!hex && hex2) {
      notify(t("catalog.swatchSecondNeedsFirst"), "error");
      return undefined;
    }
    return { hex, hex2 };
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmedCode = code.trim().toUpperCase();
    const trimmedName = name.trim();
    if (!trimmedCode || !trimmedName) return;
    const fills = swatches ? checkedSwatch(swatch) : undefined;
    if (swatches && !fills) return;
    setSaving(true);
    try {
      await onCreate(trimmedCode, trimmedName, fills);
      setCode("");
      setName("");
      setSwatch(EMPTY_SWATCH);
    } catch (err) {
      notify(
        err instanceof Error ? err.message : t("catalog.createFailed"),
        "error"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreate} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className={inputCls}
          placeholder={codePlaceholder}
          pattern={codePattern}
          title={codeHint}
          required
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputCls}
          placeholder={t("catalog.displayNamePlaceholder")}
          required
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? t("common.loadingEllipsis") : t("catalog.add")}
        </button>
        {swatches && (
          <div className="sm:col-span-3">
            <SwatchFields value={swatch} onChange={setSwatch} />
          </div>
        )}
      </form>

      <div className="overflow-x-auto rounded-xl border border-edge">
        <table className="w-full min-w-[320px] text-sm">
          <thead>
            <tr className="border-b border-edge-soft bg-subtle text-left">
              {(
                [
                  ["code", t("catalog.colCode")],
                  ...(swatches ? ([["swatch", t("catalog.colSwatch")]] as const) : []),
                  ["name", t("catalog.colName")],
                  ["actions", ""],
                ] as const
              ).map(([key, label]) => (
                <th
                  key={key}
                  className="whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-faint"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={swatches ? 4 : 3} className="px-3 py-6 text-center text-muted">
                  {t("catalog.noEntriesYet")}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.code} className="border-b border-edge-soft last:border-0">
                  <td className="px-3 py-2 font-mono text-xs text-ink">
                    {row.code}
                  </td>
                  {swatches && (
                    <td className="px-3 py-2">
                      {editingCode === row.code ? (
                        <SwatchFields value={editSwatch} onChange={setEditSwatch} />
                      ) : (
                        <div className="flex items-center gap-2">
                          <SwatchDot hex={row.hex ?? ""} hex2={row.hex2 ?? ""} />
                          <span className="font-mono text-xs text-muted">
                            {[row.hex, row.hex2].filter(Boolean).join(" / ") || t("catalog.swatchNone")}
                          </span>
                        </div>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2 text-ink">
                    {editingCode === row.code ? (
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className={inputCls}
                        autoFocus
                      />
                    ) : (
                      row.name
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      {editingCode === row.code ? (
                        <>
                          <button
                            type="button"
                            className="text-xs font-semibold text-accent hover:underline"
                            onClick={async () => {
                              const fills = swatches ? checkedSwatch(editSwatch) : undefined;
                              if (swatches && !fills) return;
                              try {
                                await onRename(row.code, editName.trim(), fills);
                                setEditingCode(null);
                              } catch (err) {
                                notify(
                                  err instanceof Error
                                    ? err.message
                                    : t("catalog.renameFailed"),
                                  "error"
                                );
                              }
                            }}
                          >
                            {t("common.save")}
                          </button>
                          <button
                            type="button"
                            className="text-xs font-semibold text-faint hover:underline"
                            onClick={() => setEditingCode(null)}
                          >
                            {t("common.cancel")}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="text-xs font-semibold text-accent hover:underline"
                            onClick={() => {
                              setEditingCode(row.code);
                              setEditName(row.name);
                              setEditSwatch({ hex: row.hex ?? "", hex2: row.hex2 ?? "" });
                            }}
                          >
                            {swatches ? t("catalog.edit") : t("catalog.rename")}
                          </button>
                          <button
                            type="button"
                            className="text-xs font-semibold text-danger-fg hover:underline"
                            onClick={async () => {
                              if (
                                !window.confirm(
                                  t("catalog.deleteConfirm", {
                                    code: row.code,
                                  })
                                )
                              ) {
                                return;
                              }
                              try {
                                await onDelete(row.code);
                              } catch (err) {
                                notify(
                                  err instanceof Error
                                    ? err.message
                                    : t("catalog.deleteFailed"),
                                  "error"
                                );
                              }
                            }}
                          >
                            {t("common.delete")}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const EMPTY_SWATCH: ColorSwatchInput = { hex: "", hex2: "" };

/** The swatch as the storefront will draw it: solid, diagonal two-tone, or dashed "no color". */
function SwatchDot({ hex, hex2, size = "size-6" }: { hex: string; hex2: string; size?: string }) {
  const preview = swatchPreview(hex, hex2);
  if (preview.kind === "none") {
    return (
      <span
        aria-hidden="true"
        className={`${size} block shrink-0 rounded-full border border-dashed border-zinc-400 bg-zinc-100`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${size} block shrink-0 rounded-full border border-zinc-200`}
      style={preview.style}
    />
  );
}

/** First and optional second (two-tone) swatch fill, each a picker plus a #rrggbb field. */
function SwatchFields({
  value,
  onChange,
}: {
  value: ColorSwatchInput;
  onChange: (next: ColorSwatchInput) => void;
}) {
  const { t } = useI18n();
  const field = (key: keyof ColorSwatchInput, label: string, disabled = false) => {
    const normalized = normalizeHexInput(value[key]);
    return (
      <label className={`flex items-center gap-2 text-xs text-muted ${disabled ? "opacity-50" : ""}`}>
        <span className="whitespace-nowrap">{label}</span>
        <input
          type="color"
          aria-label={label}
          disabled={disabled}
          value={normalized || "#000000"}
          onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          className="h-8 w-8 shrink-0 cursor-pointer rounded border border-edge bg-surface p-0.5"
        />
        <input
          value={value[key]}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          className={`${inputCls} w-28 font-mono`}
          placeholder="#rrggbb"
          aria-invalid={normalized === null}
        />
      </label>
    );
  };
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-3">
        <SwatchDot hex={value.hex} hex2={value.hex2} size="size-8" />
        {field("hex", t("catalog.swatchHex"))}
        {field("hex2", t("catalog.swatchHex2"), !normalizeHexInput(value.hex))}
      </div>
      <p className="text-xs text-faint">{t("catalog.swatchHelp")}</p>
    </div>
  );
}
