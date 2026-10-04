import type { ReactNode } from "react";
import { indianNumber } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Headline numbers.
 *
 * The numerals are the ornament in this palette — there is almost no colour to
 * do that job — so they are set large, in the mono face, with tabular figures.
 * Counts go through `indianNumber` for lakh grouping: this is Indian government
 * data throughout, and 1,30,671 is how the source writes it.
 */
export function StatGrid({
  stats,
  columns = 3,
}: {
  stats: readonly {
    value: string | number;
    /** Pass a number to get lakh grouping; a string is printed verbatim. */
    unit?: string;
    label: string;
    sub?: ReactNode;
  }[];
  columns?: 2 | 3 | 4;
}) {
  return (
    <dl
      className={cn(
        "grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "grid-cols-2 lg:grid-cols-4",
      )}
    >
      {stats.map((s) => (
        <div key={s.label} className="bg-paper px-5 py-5">
          <dd className="flex items-baseline gap-1.5">
            <span className="font-mono text-[1.75rem] leading-none tabular-nums text-ink">
              {typeof s.value === "number" ? indianNumber(s.value) : s.value}
            </span>
            {s.unit ? (
              <span className="text-[14px] text-ink-mute">{s.unit}</span>
            ) : null}
          </dd>
          <dt className="mt-2 text-[14px] leading-snug text-ink-soft">
            {s.label}
          </dt>
          {s.sub ? <p className="ex-caption mt-1">{s.sub}</p> : null}
        </div>
      ))}
    </dl>
  );
}

/**
 * A funnel or a ladder: successive steps where the delta is the point.
 *
 * Covers the dataset reduction (1,555 files to 393 scenes), the ablation ladder,
 * and any before/after. `rejected` is what keeps the negative results visible —
 * a step that was tried, measured and not adopted stays on the chart, hatched.
 */
export function Ladder({
  steps,
  max,
  format = (v) => String(v),
  unit,
}: {
  steps: readonly {
    label: string;
    value: number;
    /** Stated, not derived, so a step that goes down reads honestly. */
    delta?: number;
    note?: string;
    rejected?: boolean;
  }[];
  max?: number;
  format?: (v: number) => string;
  unit?: string;
}) {
  const top = max ?? Math.max(...steps.map((s) => s.value));

  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => {
        const width = top === 0 ? 0 : Math.round((s.value / top) * 1000) / 10;
        return (
          <li
            key={s.label}
            className={cn(
              "grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-3",
              i > 0 && "border-t border-line",
            )}
          >
            <div className="min-w-0">
              <span
                className={cn(
                  "text-[14px] text-ink",
                  s.rejected && "line-through decoration-ink-mute/50",
                )}
              >
                {s.label}
              </span>
              {s.note ? (
                <span className="ex-caption block leading-tight">{s.note}</span>
              ) : null}
            </div>
            <div className="flex items-baseline gap-3 font-mono text-[13px] tabular-nums">
              {s.delta !== undefined ? (
                <span
                  className={cn(
                    s.delta > 0
                      ? "text-gold"
                      : s.delta < 0
                        ? "text-clay"
                        : "text-ink-mute",
                  )}
                >
                  {s.delta > 0 ? "+" : ""}
                  {format(s.delta)}
                </span>
              ) : null}
              <span className="w-16 text-right text-ink">
                {format(s.value)}
                {unit ? <span className="text-ink-mute">{unit}</span> : null}
              </span>
            </div>
            <div className="col-span-2 h-1.5 rounded-full bg-sunk">
              {s.rejected ? (
                <div
                  className="hatch h-full rounded-full"
                  style={{ width: `${width}%` }}
                />
              ) : (
                <div
                  className="h-full rounded-full bg-gold"
                  style={{ width: `${width}%` }}
                />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
