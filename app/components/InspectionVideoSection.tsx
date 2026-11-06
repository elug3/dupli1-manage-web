import { useEffect, useRef, useState } from "react";
import {
  InspectionVideoUploadError,
  type Order,
  uploadInspectionVideo,
} from "~/lib/api";
import { useI18n } from "~/lib/i18n";
import {
  INSPECTION_VIDEO_ACCEPT,
  INSPECTION_VIDEO_MAX_BYTES,
  formatVideoBytes,
  inspectionVideoContentType,
  inspectionVideoEditable,
  inspectionVideoFileProblem,
  inspectionVideoSrc,
  videoTypeLabel,
} from "~/lib/inspection-video";
import { useNotify } from "~/lib/notifications";

type Progress = { fileName: string; loaded: number; total: number };

type Translate = ReturnType<typeof useI18n>["t"];

/** Message for a failed upload, from order's `reason` when it gave one. */
function uploadErrorMessage(t: Translate, err: unknown, file: File): string {
  const max = formatVideoBytes(INSPECTION_VIDEO_MAX_BYTES);
  if (err instanceof InspectionVideoUploadError) {
    if (err.status === 413) {
      return t("inspectionVideo.errTooLarge", { max, size: formatVideoBytes(file.size) });
    }
    if (err.status === 401) return t("inspectionVideo.errSession");
    if (err.status === 403) return t("inspectionVideo.errForbidden");
    if (err.status === 0) return t("inspectionVideo.errNetwork");
    switch (err.reason) {
      case "invalid_inspection_video":
        return t("inspectionVideo.errType");
      case "inspection_video_locked":
        return t("inspectionVideo.errLocked");
      case "inspection_video_storage_unavailable":
        return t("inspectionVideo.errStorage");
    }
    if (err.status === 503) return t("inspectionVideo.errStorage");
    return t("inspectionVideo.errGeneric", { error: err.message });
  }
  return t("inspectionVideo.errNetwork");
}

/**
 * The order's pre-shipment inspection video (검수영상): attach it before
 * shipping, replace it until the order is fulfilled, play it back inline.
 * Design: Figma "Order details · 검수영상" → Admin ODP frames.
 */
export function InspectionVideoSection({
  order,
  onOrderChange,
}: {
  order: Order;
  onOrderChange: (order: Order) => void;
}) {
  const { t, formatDate } = useI18n();
  const { notify } = useNotify();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [playbackFailed, setPlaybackFailed] = useState(false);

  const video = order.inspection_video;
  const editable = inspectionVideoEditable(order);
  const src = inspectionVideoSrc(order);
  const uploading = progress !== null;

  useEffect(() => setPlaybackFailed(false), [src]);

  // Leaving mid-upload throws the upload away; let the browser ask first.
  useEffect(() => {
    if (!uploading) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function upload(file: File) {
    setError(null);
    const problem = inspectionVideoFileProblem(file);
    if (problem === "type" || problem === "empty") {
      setError(t("inspectionVideo.errType"));
      return;
    }
    if (problem === "too_large") {
      setError(
        t("inspectionVideo.errTooLarge", {
          max: formatVideoBytes(INSPECTION_VIDEO_MAX_BYTES),
          size: formatVideoBytes(file.size),
        })
      );
      return;
    }
    const contentType = inspectionVideoContentType(file)!;
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress({ fileName: file.name, loaded: 0, total: file.size });
    try {
      const updated = await uploadInspectionVideo(order.id, file, contentType, {
        signal: controller.signal,
        onProgress: (loaded, total) =>
          setProgress({ fileName: file.name, loaded, total }),
      });
      onOrderChange(updated);
      notify(t("inspectionVideo.uploaded"), "success");
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(uploadErrorMessage(t, err, file));
      }
    } finally {
      abortRef.current = null;
      setProgress(null);
    }
  }

  function pick() {
    inputRef.current?.click();
  }

  function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) void upload(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  const badge = order.inspection_video_locked ? (
    <span className="rounded-full bg-edge-soft px-2.5 py-0.5 text-xs font-semibold text-muted">
      {t("inspectionVideo.locked")}
    </span>
  ) : video ? (
    <span className="rounded-full bg-success-bg px-2.5 py-0.5 text-xs font-semibold text-success-fg">
      ✓ {t("inspectionVideo.attached")}
    </span>
  ) : editable ? (
    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
      {t("inspectionVideo.required")}
    </span>
  ) : null;

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.floor((progress.loaded / progress.total) * 100))
      : 0;

  return (
    <section
      aria-labelledby="inspection-video-title"
      data-testid="inspection-video"
      className="rounded-2xl border border-edge bg-surface p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)] sm:p-6"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="inspection-video-title" className="font-semibold text-ink">
          {t("inspectionVideo.title")}
        </h2>
        {badge}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={INSPECTION_VIDEO_ACCEPT}
        className="hidden"
        data-testid="inspection-video-input"
        onChange={(e) => onFiles(e.target.files)}
      />

      {progress ? (
        <div className="space-y-3 rounded-xl border border-edge p-4" data-testid="inspection-video-progress">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-mono text-sm font-medium text-ink">
                {progress.fileName}
              </p>
              <p className="mt-0.5 text-xs text-faint">
                {percent >= 100
                  ? t("inspectionVideo.saving")
                  : t("inspectionVideo.progress", {
                      loaded: formatVideoBytes(progress.loaded),
                      total: formatVideoBytes(progress.total),
                    })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="shrink-0 rounded-xl border border-edge px-3 py-1.5 text-xs font-semibold text-muted hover:bg-page"
            >
              {t("inspectionVideo.cancelUpload")}
            </button>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-edge-soft"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div
              className="h-2 rounded-full bg-accent transition-[width] duration-200"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="text-xs text-faint">
            {t("inspectionVideo.keepOpen", { percent })}
          </p>
        </div>
      ) : video && src ? (
        <div>
          {playbackFailed ? (
            <div className="flex h-48 items-center justify-center rounded-xl bg-page text-sm text-muted">
              {t("inspectionVideo.errPlayback")}
            </div>
          ) : (
            <video
              key={src}
              src={src}
              controls
              preload="metadata"
              playsInline
              onError={() => setPlaybackFailed(true)}
              className="aspect-video w-full rounded-xl bg-black"
              data-testid="inspection-video-player"
            />
          )}
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-faint">
                {t("inspectionVideo.metaSize")}
              </dt>
              <dd className="mt-0.5 font-medium text-ink">
                {formatVideoBytes(video.size_bytes)} · {videoTypeLabel(video.content_type)}
              </dd>
            </div>
            {video.uploaded_by && (
              <div className="min-w-0">
                <dt className="text-xs font-semibold uppercase tracking-wide text-faint">
                  {t("inspectionVideo.metaUploadedBy")}
                </dt>
                <dd className="mt-0.5 truncate font-mono text-xs text-ink">
                  {video.uploaded_by}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-faint">
                {t("inspectionVideo.metaUploadedAt")}
              </dt>
              <dd className="mt-0.5 font-medium text-ink">
                {formatDate(video.uploaded_at, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </dd>
            </div>
          </dl>
          {error && (
            <p className="mt-3 text-sm font-medium text-danger-fg" role="alert">
              {error}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-edge-soft pt-4">
            <p className="text-sm text-muted">
              {editable
                ? t("inspectionVideo.replaceNote")
                : order.status === "canceled"
                  ? t("inspectionVideo.lockedCanceledNote")
                  : t("inspectionVideo.lockedNote")}
            </p>
            {editable && (
              <button
                type="button"
                onClick={pick}
                className="rounded-xl border border-edge px-3 py-1.5 text-sm font-semibold text-muted hover:bg-page"
              >
                {t("inspectionVideo.replace")}
              </button>
            )}
          </div>
        </div>
      ) : editable ? (
        <div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              onFiles(e.dataTransfer.files);
            }}
            className={[
              "flex flex-col items-center gap-2.5 rounded-xl border-2 border-dashed px-6 py-9 text-center transition",
              error
                ? "border-red-300 bg-danger-bg"
                : dragOver
                  ? "border-accent bg-accent/5"
                  : "border-placeholder bg-panel",
            ].join(" ")}
          >
            <div
              className={[
                "flex h-12 w-12 items-center justify-center rounded-xl text-xl font-bold",
                error ? "bg-red-100 text-danger-fg" : "bg-accent/10 text-accent",
              ].join(" ")}
              aria-hidden
            >
              {error ? "!" : "↑"}
            </div>
            {error ? (
              <p className="text-sm font-medium text-danger-fg" role="alert">
                {error}
              </p>
            ) : (
              <p className="text-[15px] font-semibold text-ink">
                {t("inspectionVideo.dropTitle")}
              </p>
            )}
            <p className="text-xs text-faint">
              {t("inspectionVideo.dropHint", {
                size: formatVideoBytes(INSPECTION_VIDEO_MAX_BYTES),
              })}
            </p>
            <button
              type="button"
              onClick={pick}
              className="mt-1.5 rounded-xl bg-accent px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-accent-hover"
            >
              {error ? t("inspectionVideo.chooseAnother") : t("inspectionVideo.chooseFile")}
            </button>
          </div>
          <p className="mt-4 border-t border-edge-soft pt-4 text-sm text-muted">
            {t("inspectionVideo.customerNote")}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">{t("inspectionVideo.none")}</p>
      )}
    </section>
  );
}
