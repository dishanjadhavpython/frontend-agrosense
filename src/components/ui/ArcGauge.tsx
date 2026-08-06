import { cn } from "@/lib/cn";
import { clamp } from "@/lib/format";

/**
 * The dotted arc — a semicircle built from a dot matrix rather than a stroked
 * path. Taken precisely from the dashboard reference (PLAN.md §7) because the
 * dot grid reads as an instrument, where a smooth arc reads as a chart.
 *
 * Rows thin out toward the centre so dot density stays even across the band.
 */

const ROWS = [
  { radius: 92, count: 34 },
  { radius: 80, count: 30 },
  { radius: 68, count: 26 },
  { radius: 56, count: 22 },
];

/**
 * Math.sin/cos aren't required to be correctly rounded, and Node and Chrome
 * disagree in the last bits — enough for React to flag a hydration mismatch on
 * every dot. Three decimals is far finer than a pixel here and identical
 * across engines.
 */
const round = (n: number) => Math.round(n * 1000) / 1000;

/** Dark at the start of the sweep, lightening toward the fill edge. */
const FILL_RAMP = [
  "var(--color-leaf-5)",
  "var(--color-leaf-5)",
  "var(--color-leaf-4)",
  "var(--color-leaf-3)",
];

type ArcGaugeProps = {
  /** 0–100. */
  value: number;
  label?: string;
  /** Rendered large in the well of the arc. Defaults to the value. */
  display?: string;
  tone?: "paper" | "night";
  className?: string;
};

export function ArcGauge({
  value,
  label,
  display,
  tone = "paper",
  className,
}: ArcGaugeProps) {
  const pct = clamp(value, 0, 100);
  const fraction = pct / 100;
  const emptyFill =
    tone === "night" ? "rgba(246,230,200,0.20)" : "var(--color-leaf-1)";

  return (
    <div className={cn("relative w-full", className)}>
      <svg
        viewBox="0 0 200 108"
        className="w-full"
        role="img"
        aria-label={label ? `${label}: ${pct} / 100` : `${pct} / 100`}
      >
        {ROWS.map((row, rowIndex) =>
          Array.from({ length: row.count }, (_, i) => {
            const t = i / (row.count - 1);
            const theta = Math.PI + t * Math.PI;
            const cx = round(100 + row.radius * Math.cos(theta));
            const cy = round(100 + row.radius * Math.sin(theta));
            const filled = t <= fraction;
            const ramp = fraction > 0 ? t / fraction : 0;

            return (
              <circle
                key={`${rowIndex}-${i}`}
                cx={cx}
                cy={cy}
                r={2.6}
                fill={
                  filled
                    ? FILL_RAMP[
                        Math.min(
                          FILL_RAMP.length - 1,
                          Math.floor(ramp * FILL_RAMP.length),
                        )
                      ]
                    : emptyFill
                }
              />
            );
          }),
        )}

        {/* The reading lives inside the drawing, in viewBox units, so it
            scales with the arc. It was an absolutely-positioned span at a
            fixed `text-4xl`, which fits the well at exactly one container
            width — at 160px the numerals grew into the ends of the sweep. A
            gauge that only works at one size is a trap for whoever uses it
            next. */}
        <text
          x="100"
          y="96"
          textAnchor="middle"
          className="tnum"
          fontSize="34"
          fontWeight="600"
          fill={tone === "night" ? "var(--color-chalk)" : "var(--color-ink)"}
        >
          {display ?? pct}
        </text>
      </svg>

      {/* The label stays real text below the arc. In viewBox units it would
          have had to be ~8 units to clear the sweep, which renders at six
          pixels — legible to nobody. */}
      {label ? (
        <p
          className={cn(
            "-mt-1 text-center text-xs",
            tone === "night" ? "text-mist" : "text-ink-mute",
          )}
        >
          {label}
        </p>
      ) : null}
    </div>
  );
}
