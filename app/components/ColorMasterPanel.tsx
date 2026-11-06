import { useEffect, useMemo, useRef, useState } from "react";

import { HelpTip } from "~/components/HelpTip";
import type { CatalogBaseColor, CatalogColor, ColorSwatchInput } from "~/lib/api";
import {
  type ColorFilter,
  countUnset,
  filterColors,
  hasBaseColor,
  nextUnsetCode,
  orderBaseColors,
  swatchSource,
} from "~/lib/color-master";
import { normalizeHexInput, swatchPreview } from "~/lib/color-swatch";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";

const inputCls =
  "w-full rounded-xl border border-edge bg-panel px-3 py-2 text-sm text-ink outline-none transition placeholder:text-soft focus:border-accent focus:ring-2 focus:ring-accent/20";

/**
 * Catalog › Colors: the color master list with a "needs base color" filter,
 * and an editor beside it to set a color's base color (the plain color
 * shoppers filter by), name and optional fill of its own. A color master
 * row is one color: a second color belongs on the SKU (color2Code).
 */
export function ColorMasterPanel({
  colors,
  baseColors,
  onCreate,
  onUpdate,
  onDelete,
}: {
  colors: CatalogColor[];
  baseColors: CatalogBaseColor[];
  onCreate: (code: string, name: string, fields: ColorSwatchInput) => Promise<void>;
  /** Saves and resolves once `colors` holds the saved row. */
  onUpdate: (code: string, name: string, fields: ColorSwatchInput) => Promise<CatalogColor>;
  onDelete: (code: string) => Promise<void>;
}) {
  const { notify } = useNotify();
  const { t } = useI18n();
  const bases = useMemo(() => orderBaseColors(baseColors), [baseColors]);
  const baseByCode = useMemo(() => new Map(bases.map((b) => [b.code, b])), [bases]);

  const unset = countUnset(colors);
  const [filter, setFilter] = useState<ColorFilter>(() => (countUnset(colors) > 0 ? "unset" : "all"));
  const [query, setQuery] = useState("");
  const shown = filterColors(colors, filter, query);

  const [selected, setSelected] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftHex, setDraftHex] = useState("");
  const [draftBase, setDraftBase] = useState("");
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<HTMLElement>(null);
  const current = colors.find((c) => c.code === selected);

  function select(code: string, list: CatalogColor[] = colors) {
    const row = list.find((c) => c.code === code);
    setSelected(row ? code : "");
    setDraftName(row?.name ?? "");
    setDraftHex(row?.hex ?? "");
    setDraftBase(row?.baseCode ?? "");
  }

  // On a narrow screen the editor sits under the list: bring it into view.
  useEffect(() => {
    if (selected) editorRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  // The selected color was deleted elsewhere (or by reload): drop it.
  useEffect(() => {
    if (selected && !current) setSelected("");
  }, [selected, current]);

  async function save(next: boolean) {
    if (!current) return;
    const name = draftName.trim();
    if (!name) {
      notify(t("catalog.colorNameRequired"), "error");
      return;
    }
    const hex = normalizeHexInput(draftHex);
    if (hex === null) {
      notify(t("catalog.swatchInvalid"), "error");
      return;
    }
    setSaving(true);
    try {
      const saved = await onUpdate(current.code, name, { hex, baseCode: draftBase });
      const after = colors.map((c) => (c.code === saved.code ? saved : c));
      if (next) {
        const code = nextUnsetCode(after, saved.code);
        select(code, after);
        if (!code) notify(t("catalog.noUnsetColorsLeft"));
      } else {
        select(saved.code, after);
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : t("catalog.renameFailed"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!current) return;
    if (!window.confirm(t("catalog.deleteConfirm", { code: current.code }))) return;
    try {
      await onDelete(current.code);
      select("");
    } catch (err) {
      notify(err instanceof Error ? err.message : t("catalog.deleteFailed"), "error");
    }
  }

  const draftSource = swatchSource(draftHex, draftBase, bases);
  const draftBaseRow = baseByCode.get(draftBase);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
      <section
        aria-label={t("catalog.colorsTitle")}
        className="min-w-0 space-y-4 rounded-2xl border border-edge bg-surface p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)]"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">{t("catalog.colorsTitle")}</h2>
            <p className="mt-0.5 max-w-xl text-xs text-muted">{t("catalog.colorsDescription")}</p>
          </div>
          <div className="flex gap-2">
            <div className="rounded-xl border border-edge-soft bg-panel px-3 py-2">
              <div className="text-[11px] text-muted">{t("catalog.colorsTitle")}</div>
              <div className="text-lg font-bold text-ink tabular-nums">{colors.length}</div>
            </div>
            <div className="rounded-xl bg-warn-bg px-3 py-2" data-testid="unset-count">
              <div className="text-[11px] text-warn-fg">{t("catalog.noBaseColorStat")}</div>
              <div className="text-lg font-bold text-warn-fg tabular-nums">{unset}</div>
            </div>
          </div>
        </div>

        <CreateColorForm bases={bases} onCreate={onCreate} />

        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={t("catalog.colorFilter")} className="flex gap-1 rounded-xl bg-page p-1">
            {(
              [
                ["unset", t("catalog.filterUnset", { count: unset })],
                ["all", t("catalog.filterAll", { count: colors.length })],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={[
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                  filter === value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("catalog.searchColors")}
            aria-label={t("catalog.searchColors")}
            className={`${inputCls} min-w-0 flex-1 basis-48`}
          />
        </div>

        <div className="overflow-x-auto rounded-xl border border-edge">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-edge-soft bg-subtle text-left">
                {[t("catalog.colCode"), t("catalog.colName"), t("catalog.colBaseColor"), ""].map((label, i) => (
                  <th
                    key={i}
                    className="whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-muted">
                    {query.trim()
                      ? t("catalog.noColorMatches")
                      : filter === "unset"
                        ? t("catalog.noUnsetColors")
                        : t("catalog.noEntriesYet")}
                  </td>
                </tr>
              ) : (
                shown.map((row) => {
                  const base = row.baseCode ? baseByCode.get(row.baseCode) : undefined;
                  const source = swatchSource(row.hex ?? "", row.baseCode ?? "", bases);
                  const on = row.code === selected;
                  return (
                    <tr
                      key={row.code}
                      onClick={() => select(row.code)}
                      className={[
                        "cursor-pointer border-b border-edge-soft last:border-0",
                        on ? "bg-accent/10" : "hover:bg-panel",
                      ].join(" ")}
                    >
                      <td className="px-3 py-2 font-mono text-xs text-ink">{row.code}</td>
                      <td className="px-3 py-2 text-ink">
                        <div className="flex items-center gap-2">
                          <SwatchDot hex={source.kind === "none" ? "" : source.hex} size="size-4" />
                          <span>{row.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {hasBaseColor(row) ? (
                          <span className="inline-flex items-center gap-2 text-ink">
                            <SwatchDot hex={base?.hex ?? ""} size="size-3.5" />
                            {base ? `${base.name} · ${base.code}` : row.baseCode}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-warn-bg px-2 py-0.5 text-[11px] font-semibold text-warn-fg">
                            {t("catalog.baseColorNotSet")}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          aria-label={`${on ? t("catalog.editing") : hasBaseColor(row) ? t("catalog.edit") : t("catalog.setBase")} ${row.code}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            select(row.code);
                          }}
                          className="whitespace-nowrap text-xs font-semibold text-accent hover:underline"
                        >
                          {on ? t("catalog.editing") : hasBaseColor(row) ? t("catalog.edit") : t("catalog.setBase")}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">
          {filter === "unset"
            ? t("catalog.colorsShowingUnset", { count: shown.length })
            : t("catalog.colorsShowing", { shown: shown.length, total: colors.length })}
        </p>
      </section>

      <section
        ref={editorRef}
        aria-label={t("catalog.editColor")}
        className="min-w-0 scroll-mt-4 rounded-2xl border border-edge bg-surface p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)] lg:sticky lg:top-4"
      >
        {!current ? (
          <div className="space-y-1 py-8 text-center text-sm text-muted">
            <p className="font-semibold text-ink">{t("catalog.noColorSelected")}</p>
            <p>{t("catalog.pickColorHint")}</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <SwatchDot hex={draftSource.kind === "none" ? "" : draftSource.hex} size="size-9" />
              <div className="min-w-0">
                <div className="font-mono text-xs text-muted">{current.code}</div>
                <h2 className="truncate text-lg font-bold text-ink">{current.name}</h2>
              </div>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-ink">{t("catalog.displayName")}</span>
              <input value={draftName} onChange={(e) => setDraftName(e.target.value)} className={inputCls} />
            </label>

            <fieldset className="space-y-2">
              <legend className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-ink">
                {t("catalog.colBaseColor")}
                <BaseColorHelp align="start" />
              </legend>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {bases.map((b) => {
                  const on = b.code === draftBase;
                  return (
                    <button
                      key={b.code}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setDraftBase(b.code)}
                      className={[
                        "flex min-h-11 items-center gap-2 rounded-xl px-2 py-1.5 text-left transition",
                        on
                          ? "bg-accent/10 ring-2 ring-accent"
                          : "border border-edge hover:border-accent/40",
                      ].join(" ")}
                    >
                      <SwatchDot hex={b.hex ?? ""} size="size-5" />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-ink">{b.name}</span>
                        <span className="block font-mono text-[10px] text-muted">{b.code}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {draftBase && (
                <button
                  type="button"
                  onClick={() => setDraftBase("")}
                  className="text-xs font-semibold text-muted hover:text-ink hover:underline"
                >
                  {t("catalog.clearBaseColor")}
                </button>
              )}
            </fieldset>

            <SwatchFields value={draftHex} onChange={setDraftHex} />

            <div className="space-y-2 rounded-xl border border-edge-soft bg-panel p-3" data-testid="storefront-preview">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                {t("catalog.onStorefront")}
              </div>
              <div className="flex items-center gap-2.5 text-sm text-ink">
                <SwatchDot hex={draftSource.kind === "none" ? "" : draftSource.hex} size="size-5" />
                <span>
                  {draftSource.kind === "own"
                    ? t("catalog.previewOwnFill")
                    : draftSource.kind === "base"
                      ? t("catalog.previewBaseFill", { name: draftSource.base.name })
                      : t("catalog.previewNoFill")}
                </span>
              </div>
              <p className="text-xs text-muted">
                {draftBaseRow
                  ? t("catalog.filterUnder", { name: draftBaseRow.name })
                  : t("catalog.filterNone")}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void save(true)}
                className="min-h-11 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
              >
                {saving ? t("common.loadingEllipsis") : t("catalog.saveAndNext")}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save(false)}
                className="min-h-11 rounded-xl border border-edge bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent/40 disabled:opacity-60"
              >
                {t("common.save")}
              </button>
              <button
                type="button"
                onClick={() => select(current.code)}
                className="min-h-11 px-2 text-sm font-semibold text-muted hover:text-ink"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void remove()}
                className="ml-auto min-h-11 px-2 text-xs font-semibold text-danger-fg hover:underline"
              >
                {t("common.delete")}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function CreateColorForm({
  bases,
  onCreate,
}: {
  bases: CatalogBaseColor[];
  onCreate: (code: string, name: string, fields: ColorSwatchInput) => Promise<void>;
}) {
  const { notify } = useNotify();
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [baseCode, setBaseCode] = useState("");
  const [hex, setHex] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmedCode = code.trim().toUpperCase();
    const trimmedName = name.trim();
    if (!trimmedCode || !trimmedName) return;
    const fill = normalizeHexInput(hex);
    if (fill === null) {
      notify(t("catalog.swatchInvalid"), "error");
      return;
    }
    setSaving(true);
    try {
      await onCreate(trimmedCode, trimmedName, { hex: fill, baseCode });
      setCode("");
      setName("");
      setBaseCode("");
      setHex("");
    } catch (err) {
      notify(err instanceof Error ? err.message : t("catalog.createFailed"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleCreate}
      aria-label={t("catalog.addColor")}
      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(10rem,1.2fr)_auto]"
    >
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        className={inputCls}
        placeholder={t("catalog.placeholderColorCode")}
        aria-label={t("catalog.colCode")}
        pattern="^[A-Za-z0-9]{1,12}$"
        title={t("catalog.codeHintAlphanumeric")}
        required
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={inputCls}
        placeholder={t("catalog.displayNamePlaceholder")}
        aria-label={t("catalog.displayName")}
        required
      />
      <div className="flex min-w-0 items-center gap-2">
        <select
          value={baseCode}
          onChange={(e) => setBaseCode(e.target.value)}
          aria-label={t("catalog.colBaseColor")}
          className={`${inputCls} min-w-0 flex-1`}
        >
          <option value="">{t("catalog.noBaseColorOption")}</option>
          {bases.map((b) => (
            <option key={b.code} value={b.code}>
              {b.code} — {b.name}
            </option>
          ))}
        </select>
        <BaseColorHelp align="end" />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {saving ? t("common.loadingEllipsis") : t("catalog.add")}
      </button>
      <div className="sm:col-span-4">
        <SwatchFields value={hex} onChange={setHex} />
      </div>
    </form>
  );
}

/** (?) beside a base color control: what a base color is and does. */
function BaseColorHelp({ align }: { align: "start" | "end" }) {
  const { t } = useI18n();
  return <HelpTip label={t("catalog.baseColorHelpLabel")} text={t("catalog.baseColorHelp")} align={align} />;
}

/** The swatch as the storefront will draw it: solid, or dashed "no color". */
function SwatchDot({ hex, size = "size-6" }: { hex: string; size?: string }) {
  const preview = swatchPreview(hex);
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

/** A color's own fill (optional): a picker plus a #rrggbb field. One color only. */
function SwatchFields({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const { t } = useI18n();
  const label = t("catalog.swatchHex");
  const normalized = normalizeHexInput(value);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-muted">
          <span className="whitespace-nowrap font-semibold text-ink">{label}</span>
          <input
            type="color"
            aria-label={label}
            value={normalized || "#000000"}
            onChange={(e) => onChange(e.target.value)}
            className="h-8 w-8 shrink-0 cursor-pointer rounded border border-edge bg-surface p-0.5"
          />
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`${inputCls} w-28 font-mono`}
            placeholder="#rrggbb"
            aria-label={`${label} (#rrggbb)`}
            aria-invalid={normalized === null}
          />
        </label>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-xs font-semibold text-muted hover:text-ink hover:underline"
          >
            {t("catalog.clearSwatch")}
          </button>
        )}
      </div>
      <p className="text-xs text-muted">{t("catalog.swatchHelp")}</p>
    </div>
  );
}
