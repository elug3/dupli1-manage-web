import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { productImageSrc } from "~/lib/api";
import { useI18n } from "~/lib/i18n";
import {
  HIDE_REASON_MAX,
  type ReviewStatus,
  type StaffReview,
  ReviewRequestError,
  hideReasonError,
  listStaffReviews,
  setReviewHidden,
} from "~/lib/reviews";

const PAGE_SIZE = 20;
const fieldClass =
  "rounded-xl border border-edge bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

export function meta() {
  return [{ title: "Reviews | Dupli1 Admin" }];
}

function readRating(value: string | null): number | undefined {
  return value != null && /^[1-5]$/.test(value) ? Number(value) : undefined;
}

export default function ReviewsPage() {
  const { t, formatDateTime } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const status: ReviewStatus = searchParams.get("status") === "hidden" ? "hidden" : "visible";
  const rating = readRating(searchParams.get("rating"));
  const productId = searchParams.get("productId")?.trim() ?? "";
  const [draftProductId, setDraftProductId] = useState(productId);
  const [reviews, setReviews] = useState<StaffReview[]>([]);
  const [nextCursor, setNextCursor] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    setDraftProductId(productId);
  }, [productId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setForbidden(false);
    listStaffReviews(
      { status, rating, productId, limit: PAGE_SIZE },
      { signal: controller.signal }
    )
      .then((page) => {
        if (controller.signal.aborted) return;
        setReviews(page.reviews);
        setNextCursor(page.nextCursor);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setReviews([]);
        setNextCursor("");
        if (err instanceof ReviewRequestError && err.status === 403) {
          setForbidden(true);
          return;
        }
        setError(err instanceof Error ? err.message : t("reviews.loadFailed"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [status, rating, productId, t]);

  function setFilter(next: Record<string, string>) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(next)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      return params;
    });
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await listStaffReviews({
        status,
        rating,
        productId,
        limit: PAGE_SIZE,
        cursor: nextCursor,
      });
      setReviews((prev) => [
        ...prev,
        ...page.reviews.filter((review) => !prev.some((row) => row.id === review.id)),
      ]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("reviews.loadFailed"));
    } finally {
      setLoadingMore(false);
    }
  }

  function drop(id: string) {
    setReviews((prev) => prev.filter((review) => review.id !== id));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink sm:text-2xl">{t("reviews.title")}</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-muted">{t("reviews.subtitle")}</p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setFilter({ productId: draftProductId.trim() });
        }}
      >
        <label className="space-y-1 text-xs font-medium text-muted">
          <span className="block">{t("reviews.filterStatus")}</span>
          <select
            className={fieldClass}
            aria-label={t("reviews.filterStatus")}
            value={status}
            onChange={(event) => setFilter({ status: event.target.value === "hidden" ? "hidden" : "" })}
          >
            <option value="visible">{t("reviews.statusVisible")}</option>
            <option value="hidden">{t("reviews.statusHidden")}</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted">
          <span className="block">{t("reviews.filterRating")}</span>
          <select
            className={fieldClass}
            aria-label={t("reviews.filterRating")}
            value={rating ?? ""}
            onChange={(event) => setFilter({ rating: event.target.value })}
          >
            <option value="">{t("reviews.ratingAll")}</option>
            {[5, 4, 3, 2, 1].map((stars) => (
              <option key={stars} value={stars}>
                {t("reviews.ratingStars", { n: stars })}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-48 flex-1 space-y-1 text-xs font-medium text-muted">
          <span className="block">{t("reviews.productId")}</span>
          <input
            className="input"
            value={draftProductId}
            placeholder={t("reviews.productIdPlaceholder")}
            onChange={(event) => setDraftProductId(event.target.value)}
          />
        </label>
        <button
          type="submit"
          className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover"
        >
          {t("reviews.apply")}
        </button>
      </form>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {forbidden ? (
        <p className="rounded-2xl border border-edge bg-surface px-5 py-8 text-sm text-muted">{t("reviews.forbidden")}</p>
      ) : loading && reviews.length === 0 ? (
        <p className="text-sm text-muted">{t("nav.loading")}</p>
      ) : reviews.length === 0 ? (
        <p className="rounded-2xl border border-edge bg-surface px-5 py-8 text-sm text-muted">{t("reviews.empty")}</p>
      ) : (
        <ul className="space-y-3">
          {reviews.map((review) => (
            <li key={review.id}>
              <ReviewCard
                review={review}
                when={review.createdAt ? formatDateTime(review.createdAt) : ""}
                onChanged={() => drop(review.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {nextCursor && !forbidden && (
        <button
          type="button"
          className="rounded-xl border border-edge bg-surface px-4 py-2 text-sm font-medium text-ink hover:border-accent/40 disabled:opacity-60"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? t("nav.loading") : t("reviews.loadMore")}
        </button>
      )}
    </div>
  );
}

function ReviewCard({
  review,
  when,
  onChanged,
}: {
  review: StaffReview;
  when: string;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reasonProblem = hideReasonError(reason, true);

  async function hide() {
    const problem = hideReasonError(reason, true);
    if (problem) {
      setError(problem === "required" ? t("reviews.reasonRequired") : t("reviews.reasonTooLong"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setReviewHidden(review.id, true, reason);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("reviews.hideFailed"));
      setBusy(false);
    }
  }

  async function unhide() {
    setBusy(true);
    setError(null);
    try {
      await setReviewHidden(review.id, false, "");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("reviews.hideFailed"));
      setBusy(false);
    }
  }

  return (
    <article
      data-testid="review-card"
      data-review-id={review.id}
      className="space-y-3 rounded-2xl border border-edge bg-surface p-4 shadow-[0_1px_4px_rgba(28,27,31,0.04)] sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-ink">
          <span aria-label={t("reviews.stars", { n: review.rating })}>{"★".repeat(review.rating)}</span>
          <span className="ml-2 font-medium text-muted">{review.author || t("common.emptyValue")}</span>
          {review.variantLabel && <span className="ml-2 font-normal text-muted">{review.variantLabel}</span>}
        </p>
        <p className="text-xs text-faint">
          {when}
          {review.editedAt && <span className="ml-2">{t("reviews.edited")}</span>}
        </p>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{review.body}</p>
      {review.photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {review.photos.map((photo, index) => (
            <img
              key={photo.id || index}
              src={productImageSrc(photo.thumbUrl || photo.url)}
              alt=""
              className="h-16 w-16 shrink-0 rounded-lg object-cover"
            />
          ))}
        </div>
      )}
      {review.hidden && review.hiddenReason && (
        <p className="text-sm text-muted">{t("reviews.hiddenBecause", { reason: review.hiddenReason })}</p>
      )}
      <div className="flex flex-wrap gap-3 text-xs font-semibold">
        {review.productId && (
          <Link className="text-accent hover:underline" to={`/products/${encodeURIComponent(review.productId)}`}>
            {t("reviews.openProduct")}
          </Link>
        )}
        {review.orderId && (
          <Link className="text-accent hover:underline" to={`/orders/${encodeURIComponent(review.orderId)}`}>
            {t("reviews.openOrder")}
          </Link>
        )}
        {review.customerId && (
          <Link className="text-accent hover:underline" to={`/users/${encodeURIComponent(review.customerId)}`}>
            {t("reviews.openAccount")}
          </Link>
        )}
      </div>
      {review.hidden ? (
        <button
          type="button"
          className="rounded-xl border border-edge px-3 py-2 text-sm font-medium text-ink hover:border-accent/40 disabled:opacity-60"
          disabled={busy}
          onClick={() => void unhide()}
        >
          {t("reviews.unhide")}
        </button>
      ) : (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void hide();
          }}
        >
          <label className="min-w-0 flex-1 space-y-1 text-xs font-medium text-muted">
            <span className="block">{t("reviews.reason")}</span>
            <input
              className="input"
              value={reason}
              maxLength={HIDE_REASON_MAX}
              placeholder={t("reviews.reasonPlaceholder")}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
            disabled={busy || reasonProblem != null}
          >
            {t("reviews.hide")}
          </button>
        </form>
      )}
      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
