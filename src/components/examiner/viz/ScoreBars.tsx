import type { SubScore, ReportTable } from "@/data/examiner/types";
import { cn } from "@/lib/cn";
import { Table } from "./Matrix";
import { pct } from "./geom";

/**
 * The engine's own scorecard: eleven weighted lines out of ten.
 *
 * Deliberately not a radar chart, and an examiner will ask why. Two reasons.
 * A radar encodes magnitude as area, so a value of 0.5 draws at a quarter of
 * the size of 1.0 and every reading is wrong by a square; and its axis order is
 * arbitrary, so the shape it makes is an artefact of the order someone happened
 * to list the criteria in. Neither is acceptable for a figure whose whole job
 * is to be checked.
 *
 * The third reason is the one that actually settled it: two of these eleven
 * have never been measured. A radar cannot draw a missing axis — it has to
 * either drop it, which hides that the gap exists, or plot it at zero, which
 * asserts a measurement nobody took. A bar can be an empty dashed track, which
 * is the truth.
 */
export function ScoreBars({
  items,
  composite,
  max = 10,
}: {
  items: readonly SubScore[];
  composite?: { value: number; of: number; note?: string };
  max?: number;
}) {
  const totalWeight = items.reduce((a, i) => a + i.weight, 0);
  const measuredWeight = items
    .filter((i) => i.score !== null)
    .reduce((a, i) => a + i.weight, 0);

  return (
    <div className="flex flex-col gap-4">
      {composite ? (
        <div className="flex items-baseline gap-3 border-b border-line pb-4">
          <span className="font-mono text-[2rem] leading-none font-medium tabular-nums text-ink">
            {composite.value.toFixed(2)}
          </span>
          <span className="text-[15px] text-ink-mute">
            out of {composite.of}
          </span>
          {composite.note ? (
            <span className="ex-caption ml-auto text-right">
              {composite.note}
            </span>
          ) : null}
        </div>
      ) : null}

      <ol className="flex flex-col gap-3">
        {items.map((item) => {
          const measured = item.score !== null;
          return (
            <li key={item.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={cn(
                    "text-[14px] leading-snug",
                    measured ? "text-ink" : "text-ink-mute",
                  )}
                >
                  {item.label}
                </span>
                <span className="shrink-0 font-mono text-[13px] tabular-nums">
                  {measured ? (
                    <span className="text-ink">{item.score!.toFixed(2)}</span>
                  ) : (
                    <span className="text-ink-mute">not measured</span>
                  )}
                  <span className="text-ink-mute"> ×{item.weight}</span>
                </span>
              </div>

              <div
                className={cn(
                  "mt-1.5 h-2.5 rounded-full",
                  measured
                    ? "bg-sunk"
                    : "border border-dashed border-line-strong",
                )}
                // Bar height tracks weight, so a 1.5-weight line is visibly
                // worth more than a 0.5 one without a second chart.
                style={{ height: `${6 + item.weight * 3}px` }}
              >
                {measured ? (
                  <div
                    className="h-full rounded-full bg-gold"
                    style={{ width: `${pct(item.score!, max)}%` }}
                  />
                ) : null}
              </div>

              <p className="ex-caption mt-1">
                {measured ? (
                  <>
                    measured {item.measured} · scores 0 at {item.floor}, 10 at{" "}
                    {item.target}
                  </>
                ) : (
                  <>
                    would score 0 at {item.floor} and 10 at {item.target} — no
                    measurement has been taken
                  </>
                )}
              </p>
            </li>
          );
        })}
      </ol>

      <p className="ex-caption border-t border-line pt-3">
        {measuredWeight} of {totalWeight} weight measured. The two unmeasured
        lines are shown rather than dropped: a composite that quietly averages
        only what was measured reports a higher number than the one that was
        earned.
      </p>
    </div>
  );
}

/**
 * A table lifted straight out of one of the engine's reports.
 *
 * The rows are not retyped here — the generator reads them out of the markdown
 * and the citation names the heading, so the figure and the report cannot
 * disagree. `highlight` marks a row by its first cell; `rejected` strikes one.
 */
/**
 * A pipe table lifted from one of the engine's report markdowns, rendered.
 *
 * Which columns are numbers is decided by reading them, not by counting from
 * the left. These tables are parsed from markdown written by a script, and
 * several of them put a prose verdict in the last column — set in the mono face
 * and right-aligned, as a positional rule would, that column runs back across
 * the measurements beside it. A column is numeric when every value in it is.
 */
export function ReportTableView({
  table,
  highlight,
  rejected,
  numericFrom,
}: {
  table: ReportTable;
  highlight?: readonly string[];
  rejected?: readonly string[];
  /** Override, for a table whose numbers are not what they look like. */
  numericFrom?: number;
}) {
  const clean = (s: string) => s.replace(/\s*<-.*$/, "").trim();

  const numericLike = (v: string | number) =>
    typeof v === "number" ||
    /^[−+-]?[\d.,]+(e[+-]?\d+)?%?$/i.test(String(v).trim()) ||
    /^(nan|—|-|n\/a)$/i.test(String(v).trim());

  const numeric =
    numericFrom === undefined
      ? table.head
          .map((_, i) => i)
          .filter((i) => i > 0 && table.rows.every((r) => numericLike(r[i])))
      : undefined;

  return (
    <Table
      head={table.head}
      numericFrom={numericFrom}
      numeric={numeric}
      rows={table.rows.map((cells) => {
        const first = clean(String(cells[0]));
        return {
          cells: [first, ...cells.slice(1)],
          chosen: highlight?.some((h) => first.startsWith(h)),
          rejected: rejected?.some((h) => first.startsWith(h)),
        };
      })}
    />
  );
}
