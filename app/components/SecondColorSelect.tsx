import { useEffect } from "react";
import type { CatalogCodeName } from "~/lib/api";
import { secondColorOptions } from "~/lib/color-swatch";
import { useI18n } from "~/lib/i18n";

/**
 * Optional second color of a two-color SKU (black body, brown trim): another
 * color master code, never the first color. "" = one color. The SKU code is
 * built from the first color only, so this never changes it.
 */
export function SecondColorSelect({
  id,
  colors,
  firstColorCode,
  value,
  onChange,
  className,
}: {
  id?: string;
  colors: CatalogCodeName[];
  firstColorCode: string;
  value: string;
  onChange: (code: string) => void;
  className: string;
}) {
  const { t } = useI18n();
  // Picking the same color as the first one is not a second color.
  useEffect(() => {
    if (value && value === firstColorCode) onChange("");
  }, [firstColorCode, value, onChange]);

  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">{t("skuDetail.oneColor")}</option>
      {secondColorOptions(colors, firstColorCode).map((c) => (
        <option key={c.code} value={c.code}>
          {c.code} — {c.name}
        </option>
      ))}
    </select>
  );
}
