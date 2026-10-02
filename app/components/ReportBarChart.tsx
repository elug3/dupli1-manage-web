import { useState } from "react";

export interface ReportBarPoint {
  /** Short axis label, e.g. "9/28" or "Sep". */
  label: string;
  /** Tooltip heading, e.g. the full date range. */
  title: string;
  value: number;
  /** The period is still running; drawn lighter. */
  partial?: boolean;
}

/**
 * One-series bar chart for the report pages: one bar per period, zero
 * baseline, negative values drawn below it (a week with more refunds than
 * sales). HTML rather than SVG so labels keep their size on a phone.
 */
export function ReportBarChart({
  points,
  format,
  ariaLabel,
  partialNote,
}: {
  points: ReportBarPoint[];
  format: (value: number) => string;
  ariaLabel: string;
  partialNote: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(0, ...points.map((p) => p.value));
  const min = Math.min(0, ...points.map((p) => p.value));
  const span = max - min || 1;
  const abovePct = (max / span) * 100;
  const hovered = active === null ? null : points[active];

  return (
    <figure className="relative" aria-label={ariaLabel}>
      <div className="h-3 text-right text-[11px] text-faint">
        {format(max)}
      </div>
      <div
        className="relative mt-1 flex h-40 items-stretch gap-[2px] border-edge-soft"
        onMouseLeave={() => setActive(null)}
      >
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-edge"
          style={{ top: `${abovePct}%` }}
        />
        {points.map((p, i) => {
          const heightPct = (Math.abs(p.value) / span) * 100;
          const top = p.value >= 0 ? abovePct - heightPct : abovePct;
          return (
            <button
              key={`${p.title}-${i}`}
              type="button"
              className="group relative flex-1 cursor-default focus:outline-none"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`${p.title}: ${format(p.value)}`}
            >
              <span
                className={[
                  "absolute inset-x-[15%] bg-accent transition-opacity",
                  p.value >= 0 ? "rounded-t-[4px]" : "rounded-b-[4px]",
                  p.partial ? "opacity-40" : "",
                  active !== null && active !== i ? "opacity-60" : "",
                ].join(" ")}
                style={{
                  top: `${top}%`,
                  height: `${Math.max(heightPct, p.value === 0 ? 0 : 1)}%`,
                }}
              />
            </button>
          );
        })}
        {hovered && active !== null && (
          <div
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-edge bg-surface px-3 py-2 text-xs shadow-lg"
            style={{
              left: `${((active + 0.5) / points.length) * 100}%`,
            }}
          >
            <div className="font-semibold text-ink">{format(hovered.value)}</div>
            <div className="text-muted">
              {hovered.title}
              {hovered.partial ? ` · ${partialNote}` : ""}
            </div>
          </div>
        )}
      </div>
      <div className="mt-1 flex gap-[2px]">
        {points.map((p, i) => (
          <div
            key={`${p.title}-label-${i}`}
            className="flex-1 truncate text-center text-[10px] text-faint"
          >
            {p.label}
          </div>
        ))}
      </div>
    </figure>
  );
}
