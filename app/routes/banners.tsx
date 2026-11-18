import { useCallback, useEffect, useRef, useState } from "react";
import {
  BANNER_LANGS,
  BANNER_TEXT_MAX,
  type Banner,
  type BannerFormState,
  type BannerLang,
  BannerError,
  bannerFileProblem,
  bannerToForm,
  buildBannerInput,
  createBanner,
  deleteBanner,
  emptyBannerForm,
  listBanners,
  setBannerActive,
  shownBanner,
  updateBanner,
  uploadBannerImage,
} from "~/lib/banners";
import { productImageSrc } from "~/lib/api";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";

export function meta() {
  return [{ title: "Banners | Dupli1 Admin" }];
}

const inputCls =
  "w-full rounded-xl border border-edge bg-panel px-4 py-2.5 text-sm text-ink outline-none transition placeholder:text-soft focus:border-accent focus:ring-2 focus:ring-accent/20";
const cardCls =
  "rounded-2xl border border-edge bg-surface shadow-[0_1px_4px_rgba(28,27,31,0.04)]";
const btnCls =
  "rounded-xl border border-edge px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-subtle disabled:opacity-50";

/** Who sees which language label in the editor's tabs. */
const LANG_LABEL: Record<BannerLang, string> = { ko: "한국어", en: "English", zh: "中文" };

export default function Banners() {
  const { t } = useI18n();
  const { notify } = useNotify();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ status: number; message?: string } | null>(null);
  // null: editor closed; "new": creating; otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    listBanners()
      .then(setBanners)
      .catch((err) => {
        setBanners([]);
        setLoadError({
          status: err instanceof BannerError ? err.status : 0,
          message: err instanceof Error ? err.message : undefined,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  function replace(updated: Banner) {
    setBanners((prev) => {
      const at = prev.findIndex((b) => b.id === updated.id);
      if (at < 0) return [...prev, updated];
      const next = prev.slice();
      next[at] = updated;
      return next;
    });
  }

  async function toggle(b: Banner) {
    setBusyId(b.id);
    try {
      const updated = await setBannerActive(b.id, !b.active);
      replace(updated);
      notify(updated.active ? t("banners.shownNotice") : t("banners.hiddenNotice"));
    } catch (err) {
      notify(err instanceof Error ? err.message : t("banners.failedToSave"), "error");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(b: Banner) {
    setBusyId(b.id);
    try {
      await deleteBanner(b.id);
      setBanners((prev) => prev.filter((x) => x.id !== b.id));
      setConfirmingDelete(null);
      if (editing === b.id) setEditing(null);
      notify(t("banners.deletedNotice"));
    } catch (err) {
      notify(err instanceof Error ? err.message : t("banners.failedToDelete"), "error");
    } finally {
      setBusyId(null);
    }
  }

  const homeShown = shownBanner(banners, "home_hero");
  const editingBanner = editing && editing !== "new" ? banners.find((b) => b.id === editing) : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink sm:text-2xl">{t("banners.title")}</h1>
          <p className="mt-0.5 text-sm text-muted">{t("banners.subtitle")}</p>
        </div>
        {editing === null && !loadError && (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
          >
            {t("banners.newBanner")}
          </button>
        )}
      </div>

      {!loading && !loadError && (
        <div className={`${cardCls} flex flex-wrap items-center gap-3 px-5 py-4 text-sm`} data-testid="home-status">
          <span className="font-semibold text-ink">{t("banners.placement_home_hero")}</span>
          <span className="text-muted">·</span>
          {homeShown ? (
            <span className="text-ink">
              {t("banners.homeShowing", { title: homeShown.title.ko || homeShown.title.en || t("banners.untitled") })}
            </span>
          ) : (
            <span className="text-muted">{t("banners.homeBuiltIn")}</span>
          )}
        </div>
      )}

      {editing !== null && (
        <BannerEditor
          key={editing}
          banner={editingBanner}
          onCancel={() => setEditing(null)}
          onSaved={(saved, created) => {
            replace(saved);
            setEditing(null);
            notify(created ? t("banners.createdNotice") : t("banners.savedNotice"));
          }}
        />
      )}

      {loading ? (
        <p className="text-sm text-muted">{t("banners.loading")}</p>
      ) : loadError ? (
        <div className={`${cardCls} space-y-3 p-6`}>
          <p className="text-sm text-danger-fg">
            {loadError.status === 403
              ? t("banners.needsPermission")
              : loadError.message || t("banners.failedToLoad")}
          </p>
          <button type="button" onClick={load} className={btnCls}>
            {t("nav.retry")}
          </button>
        </div>
      ) : banners.length === 0 ? (
        <div className={`${cardCls} p-8 text-center text-sm text-muted`}>{t("banners.empty")}</div>
      ) : (
        <ul className="space-y-3">
          {banners.map((b) => (
            <li key={b.id} className={`${cardCls} flex flex-col gap-4 p-4 sm:flex-row sm:items-center`} data-testid="banner-row">
              <div className="aspect-[5/2] w-full shrink-0 overflow-hidden rounded-xl bg-page sm:w-56">
                <img src={productImageSrc(b.image_url)} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      b.active ? "bg-success-bg text-success-fg" : "bg-page text-faint"
                    }`}
                  >
                    {b.active ? t("banners.statusShown") : t("banners.statusHidden")}
                  </span>
                  {homeShown?.id === b.id && (
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                      {t("banners.onStorefront")}
                    </span>
                  )}
                  <span className="text-xs text-faint">
                    {t(`banners.placement_${b.placement}`)} · {t("banners.orderShort", { order: b.sort_order })}
                  </span>
                </div>
                <p className="truncate text-sm font-semibold text-ink">
                  {b.title.ko || b.title.en || b.title.zh || t("banners.untitled")}
                </p>
                <p className="truncate text-xs text-muted">{b.link_url || t("banners.noLink")}</p>
                {b.mobile_image_url ? null : (
                  <p className="text-[11px] text-faint">{t("banners.noMobileImage")}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {confirmingDelete === b.id ? (
                  <>
                    <span className="text-xs text-danger-fg">{t("banners.confirmDelete")}</span>
                    <button type="button" disabled={busyId === b.id} onClick={() => remove(b)} className={`${btnCls} border-danger-fg text-danger-fg`}>
                      {t("common.delete")}
                    </button>
                    <button type="button" onClick={() => setConfirmingDelete(null)} className={btnCls}>
                      {t("common.cancel")}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={busyId === b.id}
                      onClick={() => toggle(b)}
                      className={
                        b.active
                          ? btnCls
                          : "rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent-hover disabled:opacity-50"
                      }
                    >
                      {b.active ? t("banners.takeDown") : t("banners.show")}
                    </button>
                    <button type="button" onClick={() => setEditing(b.id)} className={btnCls}>
                      {t("common.edit")}
                    </button>
                    <button type="button" onClick={() => setConfirmingDelete(b.id)} className={btnCls}>
                      {t("common.delete")}
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BannerEditor({
  banner,
  onCancel,
  onSaved,
}: {
  banner?: Banner;
  onCancel: () => void;
  onSaved: (b: Banner, created: boolean) => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<BannerFormState>(() => (banner ? bannerToForm(banner) : emptyBannerForm()));
  const [lang, setLang] = useState<BannerLang>("ko");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof BannerFormState>(key: K, value: BannerFormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError(null);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const built = buildBannerInput(form);
    if (built.errorKey !== undefined) {
      setError(t(built.errorKey));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = banner ? await updateBanner(banner.id, built.input) : await createBanner(built.input);
      onSaved(saved, !banner);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("banners.failedToSave"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className={`${cardCls} space-y-6 p-6`} data-testid="banner-editor">
      <h2 className="text-base font-semibold text-ink">
        {banner ? t("banners.editTitle") : t("banners.newTitle")}
      </h2>

      <div className="grid gap-6 lg:grid-cols-2">
        <ImageField
          label={t("banners.desktopImage")}
          hint={t("banners.desktopImageHint")}
          aspect="aspect-[5/2]"
          value={form.imageUrl}
          onChange={(url) => set("imageUrl", url)}
          testId="desktop-image"
        />
        <ImageField
          label={t("banners.mobileImage")}
          hint={t("banners.mobileImageHint")}
          aspect="aspect-[4/5] max-w-[220px]"
          value={form.mobileImageUrl}
          onChange={(url) => set("mobileImageUrl", url)}
          optional
          testId="mobile-image"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-ink">{t("banners.texts")}</span>
          <div className="flex rounded-xl border border-edge p-0.5" role="tablist">
            {BANNER_LANGS.map((l) => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={lang === l}
                onClick={() => setLang(l)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                  lang === l ? "bg-accent text-white" : "text-muted hover:text-ink"
                }`}
              >
                {LANG_LABEL[l]}
                {(form.title[l] || form.linkLabel[l]) && lang !== l ? " •" : ""}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-faint">{t("banners.textsHint")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted">{t("banners.titleField")}</span>
            <input
              className={inputCls}
              maxLength={BANNER_TEXT_MAX}
              value={form.title[lang]}
              onChange={(e) => set("title", { ...form.title, [lang]: e.target.value })}
              placeholder={t("banners.titlePlaceholder")}
              data-testid={`title-${lang}`}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted">{t("banners.linkLabel")}</span>
            <input
              className={inputCls}
              maxLength={BANNER_TEXT_MAX}
              value={form.linkLabel[lang]}
              onChange={(e) => set("linkLabel", { ...form.linkLabel, [lang]: e.target.value })}
              placeholder={t("banners.linkLabelPlaceholder")}
            />
          </label>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted">{t("banners.linkUrl")}</span>
          <input
            className={inputCls}
            value={form.linkUrl}
            onChange={(e) => set("linkUrl", e.target.value)}
            placeholder="/category/product-type/handbags"
            data-testid="link-url"
          />
          <span className="block text-[11px] text-faint">{t("banners.linkUrlHint")}</span>
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted">{t("banners.sortOrder")}</span>
          <input
            className={inputCls}
            inputMode="numeric"
            value={form.sortOrder}
            onChange={(e) => set("sortOrder", e.target.value)}
          />
          <span className="block text-[11px] text-faint">{t("banners.sortOrderHint")}</span>
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => set("active", e.target.checked)}
          className="size-4 rounded border-edge text-accent focus:ring-accent/20"
          data-testid="active"
        />
        {t("banners.activeField")}
      </label>

      {form.imageUrl && <HeroPreview form={form} lang={lang} />}

      {error && <p className="text-sm text-danger-fg">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
        >
          {saving ? t("common.saving") : banner ? t("common.saveChanges") : t("banners.create")}
        </button>
        <button type="button" onClick={onCancel} className="rounded-xl border border-edge px-5 py-2.5 text-sm font-semibold text-ink hover:bg-subtle">
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

function ImageField({
  label,
  hint,
  aspect,
  value,
  onChange,
  optional = false,
  testId,
}: {
  label: string;
  hint: string;
  aspect: string;
  value: string;
  onChange: (url: string) => void;
  optional?: boolean;
  testId: string;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    const problem = bannerFileProblem(file);
    if (problem) {
      setError(t(problem));
      return;
    }
    setUploading(true);
    setError(null);
    try {
      onChange(await uploadBannerImage(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("banners.failedToUpload"));
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-2" data-testid={testId}>
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium text-ink">{label}</span>
        {optional && <span className="text-[11px] text-faint">{t("common.optional")}</span>}
      </div>
      <div className={`${aspect} w-full overflow-hidden rounded-xl border border-dashed border-edge bg-page`}>
        {value ? (
          <img src={productImageSrc(value)} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-faint">
            {t("banners.noImage")}
          </div>
        )}
      </div>
      <p className="text-[11px] text-faint">{hint}</p>
      <div className="flex gap-2">
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <button type="button" disabled={uploading} onClick={() => input.current?.click()} className={btnCls}>
          {uploading ? t("common.uploading") : value ? t("common.replace") : t("banners.upload")}
        </button>
        {value && optional && (
          <button type="button" onClick={() => onChange("")} className={btnCls}>
            {t("common.remove")}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-danger-fg">{error}</p>}
    </div>
  );
}

/** Roughly how the storefront's home hero lays the banner out. */
function HeroPreview({ form, lang }: { form: BannerFormState; lang: BannerLang }) {
  const { t } = useI18n();
  const title = form.title[lang] || form.title.ko;
  const label = form.linkLabel[lang] || form.linkLabel.ko;
  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-muted">{t("banners.preview")}</span>
      <div className="relative aspect-[5/2] w-full overflow-hidden rounded-xl bg-[#cfcfcf]" data-testid="preview">
        <img src={productImageSrc(form.imageUrl)} alt="" className="absolute inset-0 h-full w-full object-cover" />
        {(title || (form.linkUrl && label)) && (
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center bg-gradient-to-t from-black/35 to-transparent px-4 pb-6 pt-16 text-center text-white">
            {title && <p className="text-lg sm:text-2xl">{title}</p>}
            {form.linkUrl && label && <p className="mt-2 text-xs underline underline-offset-4">{label}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
