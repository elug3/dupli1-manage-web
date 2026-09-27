import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { listAllOrders, type Order } from "~/lib/api";
import { useI18n } from "~/lib/i18n";
import {
  type AttentionItem,
  type AttentionKind,
  attentionFor,
  attentionFromOrders,
  badgeLabel,
} from "~/lib/order-attention";
import { useOrderFeed } from "~/lib/order-events";

/** How often to re-read orders while the live stream is not connected. */
const POLL_MS = 30_000;
/** How often deadlines ("due in 12 min", overdue) are re-evaluated. */
const TICK_MS = 30_000;

const KIND_ORDER: AttentionKind[] = ["confirm", "cancel", "dispute"];

/**
 * Header bell: how many orders are waiting on an operator, and a panel
 * listing them with their SLA deadline.
 *
 * The count is derived from the orders themselves, not from unread pings, so
 * it is right after a reload and on every open tab. It stays current three
 * ways: the live order stream when it is connected; this console's own
 * actions (relayed through the feed, see `order-updates`); and, while the
 * stream is down or not deployed, a re-read every 30s when the tab is visible.
 * Hidden for operators who may not list every order (`order.read.all`).
 */
export function OrderAttentionBell() {
  const { t, locale, formatWon } = useI18n();
  // Orders currently needing attention; kinds and deadlines are derived at
  // render against `now`, so an SLA passing while the panel is open shows.
  const [orders, setOrders] = useState<Order[]>([]);
  const [allowed, setAllowed] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const rootRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const all = await listAllOrders();
      if (all == null) {
        setAllowed(false);
        return;
      }
      setOrders(all.filter((order) => attentionFor(order) != null));
      setLoadFailed(false);
    } catch {
      // Keep the last known list; the panel says it may be stale.
      setLoadFailed(true);
    }
  }, []);

  const status = useOrderFeed({
    onOrder: (order) =>
      setOrders((current) => {
        const rest = current.filter((o) => o.id !== order.id);
        return attentionFor(order) ? [order, ...rest] : rest;
      }),
    onResync: () => void refresh(),
  });

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Fallback while the stream is not live: poll when visible, and catch up as
  // soon as the tab comes back.
  useEffect(() => {
    if (status === "live" || !allowed) return;
    const poll = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [status, allowed, refresh]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!allowed) return null;

  const items = attentionFromOrders(orders, now);
  const count = items.length;
  const overdue = items.some((item) => item.overdue);

  const relative = (at: string) => {
    const minutes = Math.round((new Date(at).getTime() - now) / 60_000);
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    // Minutes up to two hours: rounding 90 minutes to "in 2 hours" would
    // misstate a 2-hour SLA.
    return Math.abs(minutes) >= 120
      ? rtf.format(Math.round(minutes / 60), "hour")
      : rtf.format(minutes, "minute");
  };

  const deadline = (item: AttentionItem) => {
    if (item.overdue) return t("attention.overdue");
    if (!item.dueAt) return t("attention.awaitingResolution");
    return t(
      item.kind === "cancel" ? "attention.autoApproves" : "attention.autoConfirms",
      { when: relative(item.dueAt) }
    );
  };

  const kindLabel: Record<AttentionKind, string> = {
    confirm: t("attention.kindConfirm"),
    cancel: t("attention.kindCancel"),
    dispute: t("attention.kindDispute"),
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={t("attention.buttonLabel", { count })}
        title={t("attention.buttonLabel", { count })}
        className="relative rounded-lg p-2 text-muted transition hover:bg-page hover:text-ink"
      >
        <BellIcon />
        {count > 0 && (
          <span
            className={[
              "absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white ring-2 ring-surface",
              overdue ? "bg-red-600" : "bg-accent",
            ].join(" ")}
          >
            {badgeLabel(count)}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("attention.title")}
          className="fixed inset-x-3 top-16 z-40 overflow-hidden rounded-2xl border border-edge bg-surface shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96"
        >
          <div className="flex items-center justify-between border-b border-edge-soft px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">
              {t("attention.title")}
            </h2>
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <span
                className={[
                  "h-1.5 w-1.5 rounded-full",
                  status === "live" ? "bg-emerald-500" : "bg-amber-500",
                ].join(" ")}
              />
              {status === "live" ? t("attention.live") : t("attention.polling")}
            </span>
          </div>

          {loadFailed && (
            <p className="border-b border-edge-soft bg-warn-bg px-4 py-2 text-xs text-warn-fg">
              {t("attention.stale")}
            </p>
          )}

          <div className="max-h-[min(28rem,70vh)] overflow-y-auto">
            {count === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">
                {t("attention.empty")}
              </p>
            ) : (
              KIND_ORDER.map((kind) => {
                const group = items.filter((item) => item.kind === kind);
                if (group.length === 0) return null;
                return (
                  <section key={kind}>
                    <h3 className="bg-subtle px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                      {kindLabel[kind]} · {group.length}
                    </h3>
                    <ul>
                      {group.map((item) => (
                        <li key={item.order.id}>
                          <Link
                            to={`/orders/${encodeURIComponent(item.order.id)}`}
                            onClick={() => setOpen(false)}
                            className="flex items-start justify-between gap-3 px-4 py-2.5 transition hover:bg-subtle"
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-mono text-xs font-semibold text-ink">
                                {item.order.id}
                              </span>
                              <span className="block truncate text-xs text-muted">
                                {[
                                  item.order.recipient_name?.trim(),
                                  formatWon(item.order.total_won),
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            </span>
                            <span
                              className={[
                                "shrink-0 text-right text-xs",
                                item.overdue
                                  ? "font-semibold text-red-600"
                                  : "text-muted",
                              ].join(" ")}
                            >
                              {deadline(item)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })
            )}
          </div>

          <Link
            to="/orders"
            onClick={() => setOpen(false)}
            className="block border-t border-edge-soft px-4 py-2.5 text-center text-sm font-semibold text-accent hover:bg-subtle"
          >
            {t("attention.viewAll")}
          </Link>
        </div>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9Zm4.3 12a1.94 1.94 0 0 0 3.4 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
