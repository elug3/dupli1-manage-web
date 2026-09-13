import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  type CatalogCodeName,
  type CatalogStyle,
  type ProductVariant,
  createProductParent,
  createStyle,
  createVariant,
  listBrands,
  listColors,
  listEditions,
  listSizes,
  listStyles,
  parseDimensionsInput,
  setInventory,
  setInventoryBySkuId,
  uploadVariantImage,
} from "~/lib/api";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";

export function meta() {
  return [{ title: "New Product | Dupli1 Admin" }];
}

const MAX_IMAGE_BYTES = 50 * 1024 * 1024;

const inputCls =
  "w-full rounded-xl border border-edge bg-panel px-4 py-2.5 text-sm text-ink outline-none transition placeholder:text-soft focus:border-accent focus:ring-2 focus:ring-accent/20";

type WizardStep = 1 | 2;

export default function NewProduct() {
  const navigate = useNavigate();
  const { notify } = useNotify();
  const { t } = useI18n();
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<WizardStep>(1);
  const [createdProductId, setCreatedProductId] = useState<string | null>(null);
  const [createdProductName, setCreatedProductName] = useState("");
  const [createdSkus, setCreatedSkus] = useState<ProductVariant[]>([]);

  const [brands, setBrands] = useState<CatalogCodeName[]>([]);
  const [styles, setStyles] = useState<CatalogStyle[]>([]);
  const [colors, setColors] = useState<CatalogCodeName[]>([]);
  const [sizes, setSizes] = useState<CatalogCodeName[]>([]);
  const [editions, setEditions] = useState<CatalogCodeName[]>([]);
  const [mastersLoading, setMastersLoading] = useState(true);
  const [skuMastersLoading, setSkuMastersLoading] = useState(false);

  const [name, setName] = useState("");
  const [brandCode, setBrandCode] = useState("");
  const [styleCode, setStyleCode] = useState("");
  const [newStyleCode, setNewStyleCode] = useState("");
  const [newStyleName, setNewStyleName] = useState("");
  const [creatingStyle, setCreatingStyle] = useState(false);
  const [material, setMaterial] = useState("");
  const [description, setDescription] = useState("");
  const [officialPrice, setOfficialPrice] = useState("");
  const [price, setPrice] = useState("");
  const [status, setStatus] = useState("active");
  const [loading, setLoading] = useState(false);

  const [colorCode, setColorCode] = useState("");
  const [sizeCode, setSizeCode] = useState("OS");
  const [editionCode, setEditionCode] = useState("");
  const [skuStatus, setSkuStatus] = useState("active");
  const [initialStock, setInitialStock] = useState("");
  const [widthMm, setWidthMm] = useState("");
  const [heightMm, setHeightMm] = useState("");
  const [depthMm, setDepthMm] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [addingSku, setAddingSku] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listBrands()
      .then((b) => {
        if (cancelled) return;
        setBrands(b);
        if (b[0]) setBrandCode(b[0].code);
      })
      .catch((err) => {
        if (!cancelled) {
          notify(
            err instanceof Error
              ? err.message
              : t("common.failedToLoadCatalogMasters"),
            "error"
          );
        }
      })
      .finally(() => {
        if (!cancelled) setMastersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [notify, t]);

  useEffect(() => {
    if (!brandCode) {
      setStyles([]);
      setStyleCode("");
      return;
    }
    let cancelled = false;
    listStyles(brandCode)
      .then((rows) => {
        if (cancelled) return;
        setStyles(rows);
        setStyleCode((prev) =>
          rows.some((r) => r.code === prev) ? prev : (rows[0]?.code ?? "")
        );
      })
      .catch((err) => {
        if (!cancelled) {
          notify(
            err instanceof Error
              ? err.message
              : t("productNew.failedToLoadStyles"),
            "error"
          );
          setStyles([]);
          setStyleCode("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [brandCode, notify, t]);

  useEffect(() => {
    if (step !== 2) return;
    let cancelled = false;
    setSkuMastersLoading(true);
    Promise.all([listColors(), listSizes(), listEditions()])
      .then(([c, s, e]) => {
        if (cancelled) return;
        setColors(c);
        setSizes(s);
        setEditions(e);
        if (c[0]) setColorCode(c[0].code);
        if (s.some((row) => row.code === "OS")) setSizeCode("OS");
        else if (s[0]) setSizeCode(s[0].code);
      })
      .catch((err) => {
        if (!cancelled) {
          notify(
            err instanceof Error
              ? err.message
              : t("common.failedToLoadCatalogMasters"),
            "error"
          );
        }
      })
      .finally(() => {
        if (!cancelled) setSkuMastersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step, notify, t]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  function clearImage() {
    setImageFile(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setImageFile(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      notify(t("common.pleaseChooseImageFile"), "error");
      e.target.value = "";
      setImageFile(null);
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      notify(t("common.imageMustBe50MiBOrSmaller"), "error");
      e.target.value = "";
      setImageFile(null);
      return;
    }

    setImageFile(file);
  }

  async function handleCreateStyle(e: React.FormEvent) {
    e.preventDefault();
    if (!brandCode) return;
    const code = newStyleCode.trim().toUpperCase();
    const styleName = newStyleName.trim() || name.trim();
    if (!code || !styleName) {
      notify(t("productNew.styleCodeAndNameRequired"), "error");
      return;
    }
    setCreatingStyle(true);
    try {
      const created = await createStyle(brandCode, code, styleName);
      const rows = await listStyles(brandCode);
      setStyles(rows);
      setStyleCode(created.code);
      setNewStyleCode("");
      setNewStyleName("");
      notify(t("productNew.styleCreated", { code: created.code }));
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : t("productNew.failedToCreateStyle"),
        "error"
      );
    } finally {
      setCreatingStyle(false);
    }
  }

  async function handleNext(e: React.FormEvent) {
    e.preventDefault();
    if (createdProductId) {
      setStep(2);
      return;
    }

    setLoading(true);
    try {
      if (!brandCode || !styleCode) {
        throw new Error(t("productNew.selectBrandAndStyle"));
      }

      const parsedPrice = Number.parseFloat(price);
      if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
        throw new Error(t("productNew.enterValidPrice"));
      }
      let parsedOfficial: number | undefined;
      if (officialPrice.trim() !== "") {
        parsedOfficial = Number.parseFloat(officialPrice);
        if (Number.isNaN(parsedOfficial) || parsedOfficial < 0) {
          throw new Error(t("productNew.enterValidPrice"));
        }
      }

      const brandName = brands.find((b) => b.code === brandCode)?.name;
      const parent = await createProductParent({
        name: name.trim(),
        brandCode,
        styleCode,
        brand: brandName,
        material: material.trim(),
        description: description.trim() || undefined,
        status,
        price: parsedPrice,
        officialPrice: parsedOfficial,
      });

      setCreatedProductId(parent.id);
      setCreatedProductName(parent.name);
      setStep(2);
      notify(t("productNew.productCreated", { name: parent.name }));
    } catch (err) {
      notify(friendlyCreateError(err, t), "error");
    } finally {
      setLoading(false);
    }
  }

  function resetSkuForm() {
    setEditionCode("");
    setInitialStock("");
    setWidthMm("");
    setHeightMm("");
    setDepthMm("");
    setSkuStatus("active");
    clearImage();
  }

  async function handleAddSku(e: React.FormEvent) {
    e.preventDefault();
    if (!createdProductId) return;

    if (!colorCode || !sizeCode) {
      notify(t("productNew.selectColorAndSize"), "error");
      return;
    }

    const parsed = parseDimensionsInput({ widthMm, heightMm, depthMm });
    if (parsed.error === "INVALID_DIMENSION") {
      notify(t("skuDetail.invalidDimension"), "error");
      return;
    }
    if (parsed.error === "DIMENSION_TOO_LARGE") {
      notify(t("skuDetail.dimensionTooLarge"), "error");
      return;
    }

    setAddingSku(true);
    try {
      const colorName = colors.find((c) => c.code === colorCode)?.name;
      const sizeName = sizes.find((s) => s.code === sizeCode)?.name;
      const variant = await createVariant(createdProductId, {
        colorCode,
        sizeCode,
        editionCode: editionCode || undefined,
        color: colorName,
        size: sizeName,
        status: skuStatus,
        dimensions: parsed.dimensions,
      });

      const stockQty = Number.parseInt(initialStock, 10);
      if (!Number.isNaN(stockQty) && stockQty >= 0) {
        if (variant.skuId) {
          await setInventoryBySkuId(variant.skuId, stockQty).catch(() =>
            setInventory(variant.sku, stockQty)
          );
        } else {
          await setInventory(variant.sku, stockQty).catch(() => {});
        }
      }

      if (imageFile) {
        try {
          await uploadVariantImage(createdProductId, variant.sku, imageFile);
        } catch (err) {
          notify(
            t("productNew.productCreatedButImageFailed", {
              error:
                err instanceof Error
                  ? err.message
                  : t("productNew.unknownError"),
            }),
            "error"
          );
        }
      }

      setCreatedSkus((prev) => [...prev, variant]);
      notify(t("productNew.skuAdded", { sku: variant.sku }));
      resetSkuForm();
    } catch (err) {
      notify(
        err instanceof Error ? err.message : t("productNew.failedToAddSku"),
        "error"
      );
    } finally {
      setAddingSku(false);
    }
  }

  function handleFinish() {
    if (!createdProductId) return;
    navigate(`/products/${encodeURIComponent(createdProductId)}`);
  }

  if (mastersLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link to="/products" className="text-sm text-accent hover:underline">
        {t("productNew.backToProducts")}
      </Link>

      <div>
        <h1 className="text-xl font-bold text-ink sm:text-2xl">
          {t("productNew.title")}
        </h1>
        <p className="mt-0.5 text-sm text-muted">
          {t("productNew.subtitlePrefix")}{" "}
          <Link to="/catalog" className="text-accent hover:underline">
            {t("productNew.subtitleCatalogLink")}
          </Link>
          .
        </p>
      </div>

      <WizardSteps step={step} />

      {brands.length === 0 && step === 1 && (
        <div className="rounded-xl bg-warn-bg px-4 py-3 text-sm text-amber-900">
          {t("productNew.noBrandsWarning")}
        </div>
      )}

      {step === 1 ? (
        <form
          onSubmit={handleNext}
          className="space-y-6 rounded-2xl border border-edge bg-surface p-6 shadow-[0_1px_4px_rgba(28,27,31,0.04)]"
        >
          <section className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-faint">
              {t("productNew.sectionStyleParent")}
            </h2>
            <Field label={t("productNew.name")} id="name" required>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputCls}
                placeholder={t("productNew.namePlaceholder")}
                disabled={!!createdProductId}
              />
            </Field>
            <Field label={t("productNew.brandCode")} id="brandCode" required>
              <select
                id="brandCode"
                required
                value={brandCode}
                onChange={(e) => setBrandCode(e.target.value)}
                className={inputCls}
                disabled={brands.length === 0 || !!createdProductId}
              >
                {brands.length === 0 ? (
                  <option value="">{t("productNew.noBrandsOption")}</option>
                ) : (
                  brands.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.code} — {b.name}
                    </option>
                  ))
                )}
              </select>
            </Field>
            <Field label={t("productNew.styleCode")} id="styleCode" required>
              <select
                id="styleCode"
                required
                value={styleCode}
                onChange={(e) => setStyleCode(e.target.value)}
                className={inputCls}
                disabled={styles.length === 0 || !!createdProductId}
              >
                {styles.length === 0 ? (
                  <option value="">
                    {t("productNew.createStyleBelowOption")}
                  </option>
                ) : (
                  styles.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} — {s.name}
                    </option>
                  ))
                )}
              </select>
            </Field>

            {!createdProductId && (
              <div className="space-y-3 rounded-xl border border-dashed border-edge bg-subtle p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-faint">
                  {t("productNew.orCreateStyleUnder", {
                    brand: brandCode || "brand",
                  })}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    value={newStyleCode}
                    onChange={(e) =>
                      setNewStyleCode(e.target.value.toUpperCase())
                    }
                    className={inputCls}
                    placeholder={t("productNew.newStyleCodePlaceholder")}
                    disabled={!brandCode || creatingStyle}
                  />
                  <input
                    value={newStyleName}
                    onChange={(e) => setNewStyleName(e.target.value)}
                    className={inputCls}
                    placeholder={
                      name.trim() || t("productNew.newStyleNamePlaceholder")
                    }
                    disabled={!brandCode || creatingStyle}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCreateStyle}
                  disabled={!brandCode || creatingStyle}
                  className="rounded-xl border border-edge px-3 py-2 text-xs font-semibold text-accent hover:border-accent/40 disabled:opacity-60"
                >
                  {creatingStyle
                    ? t("common.creating")
                    : t("productNew.createStyle")}
                </button>
              </div>
            )}

            <Field label={t("productNew.material")} id="material" required>
              <input
                id="material"
                type="text"
                required
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                className={inputCls}
                disabled={!!createdProductId}
              />
            </Field>
            <Field label={t("productNew.description")} id="description">
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={inputCls}
                placeholder={t("common.optional")}
                disabled={!!createdProductId}
              />
            </Field>
          </section>

          <section className="space-y-4 border-t border-edge-soft pt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-faint">
              {t("productNew.sectionPricing")}
            </h2>
            <Field
              label={t("productNew.officialPriceKrw")}
              id="officialPrice"
            >
              <input
                id="officialPrice"
                type="number"
                min={0}
                step="1"
                value={officialPrice}
                onChange={(e) => setOfficialPrice(e.target.value)}
                className={inputCls}
                placeholder={t("productNew.officialPricePlaceholder")}
                title={t("productDetail.officialPriceHint")}
                disabled={!!createdProductId}
              />
            </Field>
            <Field label={t("productNew.priceKrw")} id="price" required>
              <input
                id="price"
                type="number"
                required
                min={0}
                step="1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className={inputCls}
                placeholder={t("productNew.pricePlaceholder")}
                disabled={!!createdProductId}
              />
            </Field>
            <Field label={t("productNew.status")} id="status">
              <select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={inputCls}
                disabled={!!createdProductId}
              >
                <option value="active">{t("common.statusActive")}</option>
                <option value="draft">{t("common.statusDraft")}</option>
                <option value="archived">{t("common.statusArchived")}</option>
              </select>
            </Field>
          </section>

          <div className="flex justify-end border-t border-edge-soft pt-6">
            <button
              type="submit"
              disabled={loading || brands.length === 0 || !styleCode}
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
            >
              {loading ? t("common.creating") : t("productNew.next")}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-6 rounded-2xl border border-edge bg-surface p-6 shadow-[0_1px_4px_rgba(28,27,31,0.04)]">
          <div className="rounded-xl border border-edge bg-subtle px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-faint">
              {t("productNew.createdProductLabel")}
            </p>
            <p className="mt-1 text-sm font-medium text-ink">
              {t("productNew.createdProductSummary", {
                name: createdProductName,
              })}
            </p>
            {createdProductId && (
              <p className="mt-0.5 font-mono text-xs text-muted">
                {createdProductId}
              </p>
            )}
          </div>

          <section className="space-y-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-faint">
                {t("productNew.sectionSkus")}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {t("productNew.skusSubtitle")}
              </p>
            </div>

            {createdSkus.length === 0 ? (
              <p className="rounded-xl border border-dashed border-edge px-4 py-6 text-center text-sm text-muted">
                {t("productNew.noSkusYet")}
              </p>
            ) : (
              <ul className="divide-y divide-edge-soft overflow-hidden rounded-xl border border-edge">
                {createdSkus.map((sku) => (
                  <li
                    key={sku.skuId || sku.sku}
                    className="flex flex-wrap items-center justify-between gap-2 bg-panel px-4 py-3"
                  >
                    <div>
                      <p className="font-mono text-sm font-medium text-ink">
                        {sku.sku}
                      </p>
                      <p className="text-xs text-muted">
                        {[sku.color, sku.size].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <span className="rounded-lg bg-subtle px-2 py-0.5 text-xs font-medium text-muted">
                      {sku.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {skuMastersLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
          ) : (
            <form onSubmit={handleAddSku} className="space-y-4 border-t border-edge-soft pt-6">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">
                {createdSkus.length === 0
                  ? t("productNew.addFirstSku")
                  : t("productNew.addAnotherSku")}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("productNew.colorCode")} id="colorCode" required>
                  <select
                    id="colorCode"
                    required
                    value={colorCode}
                    onChange={(e) => setColorCode(e.target.value)}
                    className={inputCls}
                  >
                    {colors.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("productNew.sizeCode")} id="sizeCode" required>
                  <select
                    id="sizeCode"
                    required
                    value={sizeCode}
                    onChange={(e) => setSizeCode(e.target.value)}
                    className={inputCls}
                  >
                    {sizes.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code} — {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("productNew.editionCode")} id="editionCode">
                  <select
                    id="editionCode"
                    value={editionCode}
                    onChange={(e) => setEditionCode(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">{t("common.none")}</option>
                    {editions.map((ed) => (
                      <option key={ed.code} value={ed.code}>
                        {ed.code} — {ed.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("productNew.status")} id="skuStatus">
                  <select
                    id="skuStatus"
                    value={skuStatus}
                    onChange={(e) => setSkuStatus(e.target.value)}
                    className={inputCls}
                  >
                    <option value="active">{t("common.statusActive")}</option>
                    <option value="draft">{t("common.statusDraft")}</option>
                    <option value="archived">
                      {t("common.statusArchived")}
                    </option>
                  </select>
                </Field>
                <Field label={t("productNew.initialStock")} id="stock">
                  <input
                    id="stock"
                    type="number"
                    min={0}
                    value={initialStock}
                    onChange={(e) => setInitialStock(e.target.value)}
                    className={inputCls}
                    placeholder={t("productNew.initialStockPlaceholder")}
                  />
                </Field>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {t("skuDetail.dimensions")}
                </p>
                <p className="text-sm text-muted">
                  {t("skuDetail.dimensionsHint")}
                </p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label={t("skuDetail.widthMm")} id="widthMm">
                    <input
                      id="widthMm"
                      type="number"
                      min={0}
                      max={10000}
                      inputMode="numeric"
                      value={widthMm}
                      onChange={(e) => setWidthMm(e.target.value)}
                      placeholder={t("skuDetail.mmPlaceholder")}
                      className={inputCls}
                    />
                  </Field>
                  <Field label={t("skuDetail.heightMm")} id="heightMm">
                    <input
                      id="heightMm"
                      type="number"
                      min={0}
                      max={10000}
                      inputMode="numeric"
                      value={heightMm}
                      onChange={(e) => setHeightMm(e.target.value)}
                      placeholder={t("skuDetail.mmPlaceholder")}
                      className={inputCls}
                    />
                  </Field>
                  <Field label={t("skuDetail.depthMm")} id="depthMm">
                    <input
                      id="depthMm"
                      type="number"
                      min={0}
                      max={10000}
                      inputMode="numeric"
                      value={depthMm}
                      onChange={(e) => setDepthMm(e.target.value)}
                      placeholder={t("skuDetail.mmPlaceholder")}
                      className={inputCls}
                    />
                  </Field>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {t("productNew.image")}
                </span>
                <p className="text-sm text-muted">{t("productNew.imageHint")}</p>
                <input
                  ref={imageInputRef}
                  id="image"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageChange}
                  disabled={addingSku}
                />
                {imageFile && imagePreviewUrl ? (
                  <div className="flex items-start gap-3 rounded-xl border border-edge bg-subtle p-3">
                    <img
                      src={imagePreviewUrl}
                      alt=""
                      className="h-20 w-20 shrink-0 rounded-lg object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {imageFile.name}
                      </p>
                      <p className="mt-0.5 text-xs text-faint">
                        {(imageFile.size / 1024).toFixed(1)} KB
                      </p>
                      <div className="mt-2 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => imageInputRef.current?.click()}
                          disabled={addingSku}
                          className="text-xs font-semibold text-accent hover:underline disabled:opacity-60"
                        >
                          {t("common.replace")}
                        </button>
                        <button
                          type="button"
                          onClick={clearImage}
                          disabled={addingSku}
                          className="text-xs font-semibold text-faint hover:underline disabled:opacity-60"
                        >
                          {t("common.remove")}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={addingSku}
                    className="inline-flex w-full items-center justify-center rounded-xl border border-dashed border-edge bg-subtle px-4 py-8 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-panel disabled:opacity-60"
                  >
                    {t("productNew.chooseImage")}
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={addingSku || !colorCode || !sizeCode}
                className="rounded-xl border border-edge px-4 py-2.5 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-subtle disabled:opacity-60"
              >
                {addingSku
                  ? t("common.adding")
                  : createdSkus.length === 0
                    ? t("productNew.addSku")
                    : t("productNew.addAnotherSku")}
              </button>
            </form>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-edge-soft pt-6">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-xl border border-edge px-4 py-2.5 text-sm font-semibold text-muted transition hover:bg-subtle"
            >
              {t("productNew.previous")}
            </button>
            <div className="flex flex-wrap gap-2">
              {createdSkus.length === 0 && (
                <button
                  type="button"
                  onClick={handleFinish}
                  className="rounded-xl border border-edge px-4 py-2.5 text-sm font-semibold text-muted transition hover:bg-subtle"
                >
                  {t("productNew.skipSkus")}
                </button>
              )}
              <button
                type="button"
                onClick={handleFinish}
                className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
              >
                {t("productNew.finish")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WizardSteps({ step }: { step: WizardStep }) {
  const { t } = useI18n();
  const steps: { n: WizardStep; label: string }[] = [
    { n: 1, label: t("productNew.stepProduct") },
    { n: 2, label: t("productNew.stepSkus") },
  ];

  return (
    <nav aria-label={t("productNew.wizardNav")} className="space-y-3">
      <p className="text-xs font-medium text-muted">
        {t("productNew.stepOf", { current: step, total: 2 })}
      </p>
      <ol className="flex items-center gap-0">
        {steps.map((s, i) => {
          const active = step === s.n;
          const done = step > s.n;
          return (
            <li key={s.n} className="flex min-w-0 flex-1 items-center">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className={[
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    active
                      ? "bg-accent text-white"
                      : done
                        ? "bg-accent/15 text-accent"
                        : "bg-subtle text-faint",
                  ].join(" ")}
                  aria-current={active ? "step" : undefined}
                >
                  {s.n}
                </span>
                <span
                  className={[
                    "truncate text-sm font-semibold",
                    active ? "text-ink" : done ? "text-accent" : "text-faint",
                  ].join(" ")}
                >
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={[
                    "mx-3 h-px min-w-6 flex-1",
                    done ? "bg-accent/40" : "bg-edge",
                  ].join(" ")}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function friendlyCreateError(
  err: unknown,
  t: (key: string, vars?: Record<string, string | number>) => string
): string {
  const message = err instanceof Error ? err.message : "";
  if (/master not found|not found/i.test(message)) {
    return t("productNew.masterMissing");
  }
  if (/brandCode and styleCode|colorCode|sizeCode|missing/i.test(message)) {
    return message;
  }
  if (/duplicate key|23505|already exists/i.test(message)) {
    return t("productNew.duplicateExists");
  }
  return message || t("productNew.failedToCreateProduct");
}

function Field({
  label,
  id,
  required,
  children,
}: {
  label: string;
  id: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="text-xs font-semibold uppercase tracking-wide text-muted"
      >
        {label}
        {required && <span className="text-danger-fg"> *</span>}
      </label>
      {children}
    </div>
  );
}
