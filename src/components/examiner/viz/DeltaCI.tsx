import { cn } from "@/lib/cn";
import { q } from "./geom";

/**
 * An effect size with its interval, and a verdict.
 *
 * The single most useful figure in this whole walkthrough, because most of the
 * decisions here turned on a difference small enough that the interval — not
 * the point estimate — is the argument. A bar chart of two accuracies says
 * "0.949 beats 0.924". This says whether that gap survives the test, and when
 * the interval crosses zero it says so in grey rather than in gold.
 *
 * SVG rather than divs: the whisker, the cap, the zero rule and the dot have to
 * share one coordinate system, which is the line the retired `LiebigStaves`
 * barrel chart drew between the two techniques.
 */
export function DeltaCI({
  rows,
  domain,
  unit = "",
  zeroLabel = "no difference",
}: {
  rows: readonly {
    label: string;
    sub?: string;
    delta: number;
    lo?: number;
    hi?: number;
    /** "Holm p = 0.021", "McNemar p = 0.0501". */
    stat?: string;
    verdict: "wins" | "inconclusive" | "loses";
  }[];
  domain: readonly [number, number];
  unit?: string;
  zeroLabel?: string;
}) {
  const [lo, hi] = domain;
  const x = (v: number) => q(((v - lo) / (hi - lo)) * 100);
  const zero = x(0);

  const COLOUR = {
    wins: "var(--color-gold)",
    inconclusive: "var(--color-ink-mute)",
    loses: "var(--color-clay)",
  } as const;

  return (
    <div className="flex flex-col gap-5">
      {rows.map((row) => {
        const colour = COLOUR[row.verdict];
        const hasCI = row.lo !== undefined && row.hi !== undefined;
        return (
          <div key={row.label}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-[14px] text-ink">{row.label}</span>
              <span className="flex items-baseline gap-3 font-mono text-[13px] tabular-nums">
                <span style={{ color: colour }}>
                  {row.delta >= 0 ? "+" : ""}
                  {row.delta.toFixed(4)}
                  {unit}
                </span>
                {row.stat ? (
                  <span className="text-ink-mute">{row.stat}</span>
                ) : null}
              </span>
            </div>
            {row.sub ? <p className="ex-caption mt-0.5">{row.sub}</p> : null}

            <svg
              viewBox="0 0 100 12"
              preserveAspectRatio="none"
              className="mt-2 h-8 w-full overflow-visible"
              role="img"
              aria-label={`${row.label}: ${row.delta}${hasCI ? `, interval ${row.lo} to ${row.hi}` : ""}`}
            >
              {/* the axis */}
              <line
                x1="0"
                y1="6"
                x2="100"
                y2="6"
                stroke="var(--color-line)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              {/* zero: the line the interval has to clear */}
              <line
                x1={zero}
                y1="0"
                x2={zero}
                y2="12"
                stroke="var(--color-ink-mute)"
                strokeWidth="1"
                strokeDasharray="2 2"
                vectorEffect="non-scaling-stroke"
              />
              {hasCI ? (
                <>
                  <line
                    x1={x(row.lo!)}
                    y1="6"
                    x2={x(row.hi!)}
                    y2="6"
                    stroke={colour}
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                  {[row.lo!, row.hi!].map((v, i) => (
                    <line
                      key={i}
                      x1={x(v)}
                      y1="2.5"
                      x2={x(v)}
                      y2="9.5"
                      stroke={colour}
                      strokeWidth="1.5"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </>
              ) : null}
              <circle
                cx={x(row.delta)}
                cy="6"
                r="3"
                fill={colour}
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            <p
              className={cn(
                "ex-caption",
                row.verdict === "wins" && "text-ink-soft",
              )}
            >
              {hasCI ? (
                <>
                  95% interval {row.lo!.toFixed(4)} to {row.hi!.toFixed(4)}{" "}
                  ·{" "}
                </>
              ) : null}
              {row.verdict === "wins"
                ? "the interval excludes zero"
                : row.verdict === "inconclusive"
                  ? "does not clear the threshold — a tie goes to the incumbent"
                  : "the incumbent is ahead"}
            </p>
          </div>
        );
      })}
      <p className="ex-caption flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-0 w-6 border-t border-dashed border-ink-mute"
        />
        {zeroLabel}
      </p>
    </div>
  );
}
