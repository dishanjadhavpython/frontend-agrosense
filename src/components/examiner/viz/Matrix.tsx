import { cn } from "@/lib/cn";
import { rampCell } from "./geom";

/**
 * A confusion matrix, as a CSS grid of divs.
 *
 * The diagonal is not the interesting part — a model that is 89% accurate has a
 * strong diagonal by construction. What an examiner should be able to read off
 * this in one look is *which* pairs get confused, so the off-diagonal cells are
 * what carry the ramp and the diagonal is outlined rather than filled. Scaling
 * per row also matters: classes here range from 111 to 267 images, and a single
 * global scale would make the largest class look like the only one with errors.
 */
export function Matrix({
  rows,
  cols,
  values,
  rowHeader = "truth",
  colHeader = "predicted",
  scale = "global",
  markDiagonal = true,
  format = (v) => String(v),
}: {
  rows: readonly string[];
  cols: readonly string[];
  values: readonly (readonly number[])[];
  rowHeader?: string;
  colHeader?: string;
  /**
   * "global" scales the shading across every error in the grid; "row"
   * normalises within each true class. Global is the default and usually the
   * honest one: under row scaling the largest error in every row takes the
   * darkest step, so a row whose worst confusion is three images renders as
   * strongly as one whose worst is seventeen.
   */
  scale?: "global" | "row";
  markDiagonal?: boolean;
  format?: (v: number, r: number, c: number) => string;
}) {
  const globalMax = Math.max(
    ...values.flatMap((row, i) =>
      row.filter((_, j) => !(markDiagonal && i === j)),
    ),
  );

  return (
    <div className="inline-block align-top">
      <p className="ex-caption mb-2">
        rows: {rowHeader} · columns: {colHeader}
      </p>
      <div
        // `w-fit`, not `min-w-full`: with the cell columns capped, a full-width
        // grid gives every leftover pixel to the `auto` label column and shunts
        // the whole matrix off the right edge.
        className="grid w-fit gap-1"
        style={{
          // Capped rather than fluid: a confusion matrix reads as a grid of
          // cells, and letting them stretch to 300px wide on a laptop turns it
          // into four unrelated bar rows.
          gridTemplateColumns: `minmax(6.5rem, auto) repeat(${cols.length}, minmax(3.25rem, 5.5rem))`,
        }}
      >
        <span />
        {cols.map((c) => (
          <span
            key={c}
            className="ex-caption self-end pb-1 text-center leading-tight"
          >
            {c}
          </span>
        ))}

        {rows.map((rowLabel, i) => {
          const rowMax = Math.max(
            ...values[i].filter((_, j) => !(markDiagonal && i === j)),
          );
          const max = scale === "row" ? rowMax : globalMax;
          return (
            <div key={rowLabel} className="contents">
              <span className="self-center pr-2 text-right text-[13px] leading-tight text-ink">
                {rowLabel}
              </span>
              {values[i].map((v, j) => {
                const diagonal = markDiagonal && i === j;
                const { fill, color } = diagonal
                  ? { fill: null, color: "var(--color-ink)" }
                  : rampCell(v, max);
                return (
                  <span
                    key={j}
                    className={cn(
                      "grid h-11 place-items-center rounded-sm font-mono text-[13px] tabular-nums",
                      diagonal && "border border-gold",
                      !fill && !diagonal && "bg-sunk",
                    )}
                    style={fill ? { background: fill, color } : { color }}
                  >
                    {v === 0 ? (
                      <span className="text-ink-mute opacity-40">·</span>
                    ) : (
                      format(v, i, j)
                    )}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
      {markDiagonal ? (
        <p className="ex-caption mt-2 max-w-md">
          Outlined cells are correct predictions. The shading runs over the
          errors only, scaled{" "}
          {scale === "row" ? "within each row" : "across the whole grid"}.
        </p>
      ) : null}
    </div>
  );
}

/**
 * A comparison table where one row is the outcome.
 *
 * Used wherever the argument is "these were the candidates and this is what was
 * chosen" — the winning row is marked once, in gold, and nothing else on the
 * table carries colour.
 */
export function Table({
  head,
  rows,
  numericFrom,
  numeric,
  minWidth = "30rem",
}: {
  head: readonly string[];
  rows: readonly {
    cells: readonly (string | number)[];
    chosen?: boolean;
    /** Struck through and hatched: tried, measured, not adopted. */
    rejected?: boolean;
    note?: string;
  }[];
  /**
   * Everything from this index on is a number. Convenient when the measurements
   * are all on the right, which they usually are.
   */
  numericFrom?: number;
  /**
   * Explicit column indices instead, for a table whose numbers are not a tidy
   * suffix — a port between two prose columns, say. Without this the prose
   * column gets set in the mono face and right-aligned, and then clips.
   */
  numeric?: readonly number[];
  minWidth?: string;
}) {
  const isNumeric = (i: number) =>
    numeric ? numeric.includes(i) : i >= (numericFrom ?? 1);

  /**
   * A gutter on both inner sides of every cell, rather than padding chosen by
   * the cell's own alignment.
   *
   * A right-aligned number ends flush with its column edge, so nothing it sets
   * on itself separates it from the prose that starts immediately after — which
   * is how "CV accuracy" and "Also measured" printed as one word, and how a port
   * number ran into the column beside it. Padding both inner sides makes the
   * gutter a property of the table rather than of whichever alignment the two
   * neighbours happen to have.
   */
  const gutter = (i: number) =>
    cn(i > 0 && "pl-4", i < head.length - 1 && "pr-4");
  // The scroller lives on the primitive, not on the caller. A table with a
  // min-width inside a card that forgot to opt into scrolling pushes the whole
  // document sideways — which is what happened on the agents chapter at 390px,
  // 67 pixels over. Making it impossible beats remembering.
  return (
    <div className="hide-scrollbar w-full overflow-x-auto">
      <table
        className="w-full border-collapse text-[14px]"
        style={{ minWidth }}
      >
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={h}
                scope="col"
                className={cn(
                  // A header is a label, never a paragraph. Left to wrap in a
                  // narrow column it breaks mid-word — "MODIF / IED" — which
                  // reads as a rendering fault rather than as a tight column.
                  "ex-source border-b border-line-strong pb-2 align-bottom font-normal tracking-wider whitespace-nowrap uppercase",
                  gutter(i),
                  isNumeric(i) ? "text-right" : "text-left",
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr
              key={r}
              className={cn(
                "border-b border-line",
                row.chosen && "bg-gold-wash",
                row.rejected && "text-ink-mute",
              )}
            >
              {row.cells.map((cell, i) => (
                <td
                  key={i}
                  className={cn(
                    "py-2.5 align-top",
                    gutter(i),
                    isNumeric(i)
                      ? "text-right font-mono whitespace-nowrap tabular-nums"
                      : "text-left",
                    i === 0 &&
                      row.chosen &&
                      "border-l-2 border-gold pl-2.5 font-semibold",
                    i === 0 &&
                      row.rejected &&
                      "line-through decoration-ink-mute/50",
                  )}
                >
                  {cell}
                  {i === 0 && row.note ? (
                    <span className="ex-caption block leading-tight no-underline">
                      {row.note}
                    </span>
                  ) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
