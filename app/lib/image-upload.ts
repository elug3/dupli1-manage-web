/**
 * Helpers for uploading several product images in an order the operator
 * chooses, and for reordering a variant's gallery.
 *
 * The product service appends each upload to the end of the variant's
 * `imageUrls` with a read-modify-write, so uploads must run one at a time:
 * two in flight can both read the same list and the later write drops the
 * other image. Running them in sequence is also what makes the final order
 * match the queue.
 */

export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;

export type ImageFileProblem = "not_image" | "too_large";

export function checkImageFile(file: {
  type: string;
  size: number;
}): ImageFileProblem | null {
  if (!file.type.startsWith("image/")) return "not_image";
  if (file.size > MAX_IMAGE_BYTES) return "too_large";
  return null;
}

/** Splits a picked FileList into uploadable images and the rest. */
export function partitionImageFiles<F extends { type: string; size: number }>(
  files: Iterable<F>
): { accepted: F[]; rejected: F[] } {
  const accepted: F[] = [];
  const rejected: F[] = [];
  for (const f of files) {
    (checkImageFile(f) ? rejected : accepted).push(f);
  }
  return { accepted, rejected };
}

const nameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

/**
 * Orders picked files by name with numbers compared as numbers
 * (`2.jpg` before `10.jpg`). The browser's file picker does not promise any
 * order, so this is the predictable starting point the operator then adjusts.
 */
export function sortFilesByName<F extends { name: string }>(files: F[]): F[] {
  return [...files].sort((a, b) => nameCollator.compare(a.name, b.name));
}

/** Returns a copy of `items` with the item at `from` moved to `to`. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= next.length ||
    to >= next.length
  ) {
    return next;
  }
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** True when `next` is a reordering of `current` (same URLs, nothing added or lost). */
export function isSameImageSet(current: readonly string[], next: readonly string[]): boolean {
  if (current.length !== next.length) return false;
  const a = [...current].sort();
  const b = [...next].sort();
  return a.every((url, i) => url === b[i]);
}

/**
 * Uploads `items` one after another in order, stopping at the first failure.
 * `done` is how many succeeded; the failed item and those after it were not
 * uploaded, so the caller can keep them queued for a retry.
 */
export async function uploadInOrder<T>(
  items: readonly T[],
  upload: (item: T, index: number) => Promise<void>,
  onProgress?: (done: number, total: number) => void
): Promise<{ done: number; error?: unknown }> {
  let done = 0;
  onProgress?.(done, items.length);
  for (const item of items) {
    try {
      await upload(item, done);
    } catch (error) {
      return { done, error };
    }
    done += 1;
    onProgress?.(done, items.length);
  }
  return { done };
}
