import { useEffect, useRef, useState } from "react";
import { LastImageDeleteError, productImageSrc } from "~/lib/api";
import { useI18n } from "~/lib/i18n";
import {
  moveItem,
  partitionImageFiles,
  sortFilesByName,
  uploadInOrder,
} from "~/lib/image-upload";
import { useNotify } from "~/lib/notifications";

interface Tile {
  key: string;
  src: string;
  href?: string;
  title?: string;
}

/**
 * Image tiles the operator can reorder by dragging or with the ←/→ buttons.
 * The first tile is badged as the main image, since the storefront shows
 * `imageUrls[0]` first.
 */
function ReorderableImageGrid({
  tiles,
  onMove,
  onRemove,
  removeLabel,
  removingKey = null,
  disabled = false,
  compact = false,
  markMain = true,
}: {
  tiles: Tile[];
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  removeLabel: string;
  removingKey?: string | null;
  disabled?: boolean;
  compact?: boolean;
  /** Badge the first tile as the main image (not for a queue appended after it). */
  markMain?: boolean;
}) {
  const { t } = useI18n();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function endDrag() {
    setDragIndex(null);
    setOverIndex(null);
  }

  const arrowCls = [
    "flex items-center justify-center rounded-full bg-black/55 font-semibold text-white shadow-sm transition hover:bg-black/75 disabled:opacity-30",
    compact ? "size-5 text-[10px]" : "size-7 text-xs",
  ].join(" ");

  return (
    <ol
      className={
        compact
          ? "grid grid-cols-[repeat(2,4.5rem)] gap-1.5"
          : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      }
    >
      {tiles.map((tile, index) => {
        const canDrag = !disabled && tiles.length > 1;
        return (
          <li
            key={tile.key}
            draggable={canDrag}
            title={canDrag ? t("productDetail.dragToReorder") : tile.title}
            onDragStart={(e) => {
              setDragIndex(index);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(index));
            }}
            onDragOver={(e) => {
              if (dragIndex == null) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (overIndex !== index) setOverIndex(index);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex != null && dragIndex !== index) onMove(dragIndex, index);
              endDrag();
            }}
            onDragEnd={endDrag}
            className={[
              "group relative aspect-square overflow-hidden border bg-subtle",
              compact ? "rounded-lg" : "rounded-xl",
              canDrag ? "cursor-grab active:cursor-grabbing" : "",
              dragIndex === index ? "opacity-40" : "",
              overIndex === index && dragIndex !== index
                ? "border-accent ring-2 ring-accent/40"
                : "border-edge",
            ].join(" ")}
          >
            {tile.href ? (
              <a
                href={tile.href}
                target="_blank"
                rel="noopener noreferrer"
                draggable={false}
                className="block size-full"
              >
                <img
                  src={tile.src}
                  alt=""
                  draggable={false}
                  className="size-full object-cover"
                />
              </a>
            ) : (
              <img
                src={tile.src}
                alt={tile.title ?? ""}
                draggable={false}
                className="size-full object-cover"
              />
            )}
            {((markMain && index === 0) || !compact) && (
              <span
                className={[
                  "pointer-events-none absolute left-1 top-1 rounded-full bg-black/60 font-semibold text-white",
                  compact ? "px-1 text-[9px] leading-4" : "px-2 py-0.5 text-xs",
                ].join(" ")}
              >
                {markMain && index === 0 ? t("productDetail.mainImage") : index + 1}
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRemove(index);
              }}
              disabled={disabled || removingKey === tile.key}
              title={removeLabel}
              aria-label={removeLabel}
              className={[
                "absolute z-10 flex items-center justify-center rounded-full bg-black/55 text-white shadow-sm transition hover:bg-red-600 disabled:opacity-60",
                compact ? "right-1 top-1 size-5" : "right-1.5 top-1.5 size-8",
              ].join(" ")}
            >
              {removingKey === tile.key ? (
                <span
                  className={[
                    "animate-spin rounded-full border-2 border-white border-t-transparent",
                    compact ? "size-3" : "size-3.5",
                  ].join(" ")}
                />
              ) : (
                <RemoveIcon compact={compact} />
              )}
            </button>
            {tiles.length > 1 && (
              <div
                className={[
                  "absolute z-10 flex justify-between",
                  compact ? "inset-x-1 bottom-1" : "inset-x-1.5 bottom-1.5",
                ].join(" ")}
              >
                <button
                  type="button"
                  onClick={() => onMove(index, index - 1)}
                  disabled={disabled || index === 0}
                  title={t("productDetail.moveEarlier")}
                  aria-label={t("productDetail.moveEarlier")}
                  className={arrowCls}
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => onMove(index, index + 1)}
                  disabled={disabled || index === tiles.length - 1}
                  title={t("productDetail.moveLater")}
                  aria-label={t("productDetail.moveLater")}
                  className={arrowCls}
                >
                  →
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function RemoveIcon({ compact }: { compact?: boolean }) {
  return (
    <svg
      className={compact ? "size-3" : "size-3.5"}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

const fileKeys = new WeakMap<File, string>();
let nextFileKey = 0;
function fileKey(file: File): string {
  let key = fileKeys.get(file);
  if (!key) {
    nextFileKey += 1;
    key = `file-${nextFileKey}`;
    fileKeys.set(file, key);
  }
  return key;
}

/** Object URLs for local previews, revoked when the list changes or unmounts. */
function useObjectUrls(files: File[]): string[] {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const next = files.map((f) => URL.createObjectURL(f));
    setUrls(next);
    return () => next.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);
  return urls;
}

/**
 * Adds picked files to a queue: images only, at most 50 MiB each, sorted by
 * file name (the picker promises no order). Reports skipped files.
 */
export function useImageFilePicker(
  onAdd: (files: File[]) => void
): (e: React.ChangeEvent<HTMLInputElement>) => void {
  const { t } = useI18n();
  const { notify } = useNotify();
  return (e) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
    const { accepted, rejected } = partitionImageFiles(picked);
    if (rejected.length > 0) {
      notify(t("common.imageFilesSkipped", { count: rejected.length }), "error");
    }
    if (accepted.length > 0) onAdd(sortFilesByName(accepted));
  };
}

/**
 * Files chosen but not uploaded yet, in the order they will be uploaded.
 * The operator drags or uses the arrows to change it, or removes one.
 */
export function ImageUploadQueue({
  files,
  onChange,
  disabled = false,
  compact = false,
  markMain = false,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  compact?: boolean;
  /** True when nothing is uploaded yet, so the first file becomes the main image. */
  markMain?: boolean;
}) {
  const { t } = useI18n();
  const previews = useObjectUrls(files);
  if (files.length === 0) return null;
  return (
    <ReorderableImageGrid
      tiles={files.map((file, i) => ({
        key: fileKey(file),
        src: previews[i] ?? "",
        title: file.name,
      }))}
      onMove={(from, to) => onChange(moveItem(files, from, to))}
      onRemove={(index) => onChange(files.filter((_, i) => i !== index))}
      removeLabel={t("common.remove")}
      markMain={markMain}
      disabled={disabled}
      compact={compact}
    />
  );
}

/**
 * A variant's gallery: reorder what is there (saved at once), and queue
 * several new images in a chosen order, uploaded one at a time and appended
 * after the existing ones in that order.
 */
export function ImageGalleryEditor({
  urls,
  uploadOne,
  saveOrder,
  remove,
  compact = false,
  hint,
}: {
  urls: string[];
  uploadOne: (file: File) => Promise<void>;
  saveOrder: (next: string[]) => Promise<void>;
  remove: (url: string) => Promise<void>;
  compact?: boolean;
  hint?: string;
}) {
  const { t } = useI18n();
  const { notify } = useNotify();
  const inputRef = useRef<HTMLInputElement>(null);
  const [order, setOrder] = useState(urls);
  const [queue, setQueue] = useState<File[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  const [savingOrder, setSavingOrder] = useState(false);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);

  useEffect(() => {
    setOrder(urls);
  }, [urls]);

  const uploading = progress != null;
  const busy = uploading || savingOrder || deletingUrl != null;
  const handlePick = useImageFilePicker((files) =>
    setQueue((prev) => [...prev, ...files])
  );

  async function handleMove(from: number, to: number) {
    const next = moveItem(order, from, to);
    if (next.every((u, i) => u === order[i])) return;
    const previous = order;
    setOrder(next);
    setSavingOrder(true);
    try {
      await saveOrder(next);
      notify(t("productDetail.imageOrderSaved"));
    } catch (err) {
      setOrder(previous);
      notify(
        err instanceof Error ? err.message : t("productDetail.failedToSaveImageOrder"),
        "error"
      );
    } finally {
      setSavingOrder(false);
    }
  }

  async function handleDelete(url: string) {
    if (!window.confirm(t("productDetail.deleteImageConfirm"))) return;
    setDeletingUrl(url);
    try {
      await remove(url);
      notify(t("productDetail.imageDeleted"));
    } catch (err) {
      notify(
        err instanceof LastImageDeleteError
          ? t("productDetail.cannotDeleteLastImage")
          : err instanceof Error
            ? err.message
            : t("productDetail.failedToDeleteImage"),
        "error"
      );
    } finally {
      setDeletingUrl(null);
    }
  }

  async function handleUpload() {
    const files = queue;
    if (files.length === 0) return;
    const result = await uploadInOrder(files, uploadOne, (done, total) =>
      setProgress({ done, total })
    );
    setProgress(null);
    // Keep the failed file and the ones after it queued for a retry.
    setQueue(files.slice(result.done));
    if (result.error) {
      notify(
        t("productDetail.uploadStopped", {
          done: result.done,
          total: files.length,
          error:
            result.error instanceof Error
              ? result.error.message
              : t("productDetail.uploadFailed"),
        }),
        "error"
      );
    } else {
      notify(t("productDetail.imagesUploaded", { count: result.done }));
    }
  }

  const buttonCls = compact
    ? "text-xs font-semibold text-accent hover:underline disabled:opacity-60"
    : "rounded-xl border border-dashed border-edge px-4 py-2.5 text-sm font-semibold text-accent hover:border-accent/40 disabled:opacity-60";
  const primaryCls = compact
    ? "text-xs font-semibold text-white bg-accent rounded-lg px-2 py-1 hover:bg-accent-hover disabled:opacity-60"
    : "rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60";

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {hint && <p className="text-sm text-muted">{hint}</p>}
      {order.length > 0 ? (
        <ReorderableImageGrid
          tiles={order.map((url) => ({
            key: url,
            src: productImageSrc(url),
            href: productImageSrc(url),
          }))}
          onMove={(from, to) => void handleMove(from, to)}
          onRemove={(index) => void handleDelete(order[index])}
          removeLabel={t("productDetail.deleteImage")}
          removingKey={deletingUrl}
          disabled={busy}
          compact={compact}
        />
      ) : (
        !compact && (
          <div className="rounded-xl border border-dashed border-edge bg-subtle px-4 py-10 text-center text-sm text-faint">
            {t("productDetail.noImagesYet")}
          </div>
        )
      )}

      {queue.length > 0 && (
        <div
          title={compact ? t("productDetail.uploadQueueHint") : undefined}
          className={
            compact
              ? "w-fit space-y-1.5 rounded-lg border border-edge bg-subtle p-1.5"
              : "space-y-2 rounded-xl border border-edge bg-subtle p-3"
          }
        >
          {!compact && (
            <p className="text-xs text-muted">{t("productDetail.uploadQueueHint")}</p>
          )}
          <ImageUploadQueue
            files={queue}
            onChange={setQueue}
            disabled={uploading}
            compact={compact}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleUpload()}
              disabled={busy}
              className={primaryCls}
            >
              {progress
                ? t("productDetail.uploadingProgress", {
                    done: Math.min(progress.done + 1, progress.total),
                    total: progress.total,
                  })
                : t("productDetail.uploadQueued", { count: queue.length })}
            </button>
            <button
              type="button"
              onClick={() => setQueue([])}
              disabled={uploading}
              className="text-xs font-semibold text-faint hover:underline disabled:opacity-60"
            >
              {t("productDetail.clearQueue")}
            </button>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handlePick}
        disabled={uploading}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={buttonCls}
      >
        {compact
          ? t("productDetail.uploadWithCount", { count: order.length })
          : t("productDetail.chooseImages")}
      </button>
    </div>
  );
}
