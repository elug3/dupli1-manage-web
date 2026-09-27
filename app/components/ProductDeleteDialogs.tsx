import { useEffect, useRef, useState } from "react";
import { DeleteConfirmDialog } from "~/components/DeleteConfirmDialog";
import {
  deleteProduct,
  deleteVariant,
  getVariantStock,
  type Product,
  type ProductVariant,
  productVariants,
  type StockItem,
} from "~/lib/api";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";

/** Live stock per SKU, loaded each time a dialog opens. */
function useStock(variants: ProductVariant[], open: boolean) {
  const [stock, setStock] = useState<(StockItem | null)[] | null>(null);
  // `variants` is rebuilt every render, so reload on the SKU list instead.
  const key = variants.map((v) => v.skuId ?? v.sku).join("|");
  const latest = useRef(variants);
  latest.current = variants;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStock(null);
    Promise.all(latest.current.map((v) => getVariantStock(v))).then((items) => {
      if (!cancelled) setStock(items);
    });
    return () => {
      cancelled = true;
    };
  }, [open, key]);

  return stock;
}

function sum(items: (StockItem | null)[], field: "quantity" | "reserved") {
  return items.reduce((total, item) => total + (item?.[field] ?? 0), 0);
}

/**
 * Deletes a parent product and every SKU under it. Product delete drops the
 * SKUs' stock rows, so the backend refuses while any SKU has stock reserved
 * for an open order; the dialog shows that before the operator types.
 */
export function ProductDeleteDialog({
  product,
  open,
  onClose,
  onDeleted,
}: {
  product: Product;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { t } = useI18n();
  const { notify } = useNotify();
  const variants = productVariants(product);
  const stock = useStock(variants, open);

  const onHand = stock ? sum(stock, "quantity") : 0;
  const reserved = stock ? sum(stock, "reserved") : 0;
  const stockUnknown = stock?.some((item) => item == null) ?? false;

  const impacts = [
    t("productDelete.impactSkus", { count: variants.length }),
    stockUnknown
      ? t("productDelete.impactStockUnknown")
      : t("productDelete.impactStock", { quantity: onHand }),
    t("productDelete.impactWishlist"),
    t("productDelete.impactCarts"),
    t("productDelete.impactOrders"),
    t("productDelete.impactImages"),
    t("productDelete.impactAlert"),
  ];

  return (
    <DeleteConfirmDialog
      open={open}
      title={t("productDelete.title", { name: product.name })}
      confirmText={product.id}
      impacts={impacts}
      checking={stock == null}
      blockedReason={
        reserved > 0 ? t("productDelete.blockedReserved", { reserved }) : null
      }
      onClose={onClose}
      onConfirm={async () => {
        try {
          await deleteProduct(product.id);
          notify(t("productDelete.deleted", { name: product.name }));
          onDeleted();
        } catch (err) {
          notify(
            err instanceof Error ? err.message : t("productDelete.failed"),
            "error"
          );
        }
      }}
    />
  );
}

/**
 * Deletes one SKU. The backend requires its stock row to be empty — nothing
 * on hand, nothing reserved — and the console keeps at least one SKU per
 * product (delete the product instead).
 */
export function SkuDeleteDialog({
  product,
  variant,
  open,
  onClose,
  onDeleted,
}: {
  product: Product;
  variant: ProductVariant;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { t } = useI18n();
  const { notify } = useNotify();
  const stock = useStock([variant], open);
  const item = stock?.[0] ?? null;
  const onlySku = productVariants(product).length <= 1;

  let blockedReason: string | null = null;
  if (onlySku) {
    blockedReason = t("skuDelete.blockedOnlySku");
  } else if (item && item.reserved > 0) {
    blockedReason = t("skuDelete.blockedReserved", { reserved: item.reserved });
  } else if (item && item.quantity > 0) {
    blockedReason = t("skuDelete.blockedOnHand", { quantity: item.quantity });
  }

  const impacts = [
    t("skuDelete.impactSku", { sku: variant.sku, name: product.name }),
    t("skuDelete.impactStock"),
    t("skuDelete.impactCarts"),
    t("skuDelete.impactOrders"),
    t("skuDelete.impactImages"),
  ];

  return (
    <DeleteConfirmDialog
      open={open}
      title={t("skuDelete.title", { sku: variant.sku })}
      confirmText={variant.sku}
      impacts={impacts}
      checking={stock == null}
      blockedReason={blockedReason}
      onClose={onClose}
      onConfirm={async () => {
        try {
          await deleteVariant(product.id, variant.sku);
          notify(t("productDetail.deletedSku", { sku: variant.sku }));
          onDeleted();
        } catch (err) {
          notify(
            err instanceof Error
              ? err.message
              : t("productDetail.failedToDeleteVariant"),
            "error"
          );
        }
      }}
    />
  );
}
