import { useEffect, useId, useRef, useState } from "react";

/**
 * A small (?) button that explains the control beside it. The text shows on
 * hover and keyboard focus, and a click pins it open so it can be read on a
 * touch screen; Escape or a click elsewhere closes it.
 *
 * Keep it outside a `<label>`: a click inside one would also toggle the
 * labelled checkbox.
 */
export function HelpTip({ label, text }: { label: string; text: string }) {
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || pinned;

  useEffect(() => {
    if (!pinned) return;
    function onPointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setPinned(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setPinned(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pinned]);

  return (
    <span
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setPinned((p) => !p)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        className="inline-flex size-4 items-center justify-center rounded-full border border-edge text-[10px] font-bold leading-none text-muted transition hover:border-accent/40 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
      >
        ?
      </button>
      <span
        id={id}
        role="tooltip"
        className={[
          "absolute left-1/2 top-full z-20 mt-2 w-64 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border border-edge bg-surface px-3 py-2 text-xs font-normal leading-relaxed text-ink shadow-lg",
          open ? "" : "hidden",
        ].join(" ")}
      >
        {text}
      </span>
    </span>
  );
}
