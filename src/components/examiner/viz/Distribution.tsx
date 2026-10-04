import type { Tone } from "@/data/examiner/types";
import { TONE, WASH, pct, q, share } from "./geom";

/**
 * Charts about how a quantity is distributed, rather than how two quantities
 * compare.
 *
 * `Histogram` is here for one figure in particular — the soil classifier's
 * confidence, binned, split by whether the prediction was right. A pair of mean
 * confidences ("0.9013 when correct, 0.6677 when wrong") states the result;
 * the binned distribution shows *how* separable the two are, which is the thing
 * an abstention threshold is actually chosen from. A reader can put a finger on
 * the x axis and see what they would be throwing away.
 *
 * `StackedBar` is the same idea for a composition: one bar, segments in
 * proportion, the numbers in the legend rather than inside the segments where
 * the narrow ones cannot hold them.
 */

export function Histogram({
  bins,
  series,
  xTicks,
  xLabel,
  height = 168,
  note,
}: {
  bins: readonly {
    from: number;
    to: number;
    values: Readonly<Record<string, number>>;
  }[];
  series: readonly { name: string; tone: Tone }[];
  /** Values printed under the axis. Positioned by the bin they fall in. */
  xTicks?: readonly number[];
  xLabel?: string;
  height?: number;
  note?: string;
}) {
  const total = (b: (typeof bins)[number]) =>
    series.reduce((a, s) => a + (b.values[s.name] ?? 0), 0);
  const tallest = Math.max(...bins.map(total));
  const grand = bins.reduce((a, b) => a + total(b), 0);
  const lo = bins[0]?.from ?? 0;
  const hi = bins[bins.length - 1]?.to ?? 1;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {series.map((s) => {
          const n = bins.reduce((a, b) => a + (b.values[s.name] ?? 0), 0);
          return (
            <span
              key={s.name}
              className="flex items-center gap-2 text-[13px] text-ink-soft"
            >
              <span
                aria-hidden
                className="inline-block size-2.5 rounded-[2px]"
                style={{ background: TONE[s.tone] }}
              />
              {s.name}
              <span className="font-mono text-[12px] tabular-nums text-ink-mute">
                n = {n.toLocaleString("en-IN")}
              </span>
            </span>
          );
        })}
      </div>

      <div
        className="mt-4 flex items-end gap-px border-b border-line-strong"
        style={{ height }}
      >
        {bins.map((b) => {
          const t = total(b);
          return (
            <div
              key={b.from}
              className="flex h-full min-w-0 flex-1 flex-col justify-end"
              title={`${b.from}–${b.to}: ${t}`}
            >
              {/* Empty bins keep their slot: a gap in the middle of a
                  distribution is a finding, not something to close up. */}
              {series
                .slice()
                .reverse()
                .map((s) => {
                  const v = b.values[s.name] ?? 0;
                  if (v <= 0) return null;
                  return (
                    <span
                      key={s.name}
                      className="block w-full"
                      style={{
                        height: `${pct(v, tallest)}%`,
                        background: TONE[s.tone],
                      }}
                    />
                  );
                })}
            </div>
          );
        })}
      </div>

      <div className="mt-1.5 flex justify-between font-mono text-[12px] tabular-nums text-ink-mute">
        {(xTicks ?? [lo, hi]).map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      {xLabel ? <p className="ex-caption mt-2">{xLabel}</p> : null}
      {note ? <p className="ex-caption mt-2">{note}</p> : null}
      <p className="ex-caption mt-1">
        {bins.length} bins · {grand.toLocaleString("en-IN")} predictions · the
        tallest bin holds {tallest.toLocaleString("en-IN")}
      </p>
    </div>
  );
}

/**
 * One bar, split into its parts. For a composition where the shares are the
 * point and the categories are few.
 */
export function StackedBar({
  segments,
  total,
  unit,
  format = (v) => v.toLocaleString("en-IN"),
}: {
  segments: readonly { label: string; value: number; tone: Tone }[];
  /** Pass a larger total to leave the remainder as an unfilled tail. */
  total?: number;
  unit?: string;
  format?: (v: number) => string;
}) {
  const sum = segments.reduce((a, s) => a + s.value, 0);
  const top = total ?? sum;

  return (
    <div>
      <div className="flex h-8 w-full overflow-hidden rounded-[8px] bg-sunk">
        {segments.map((s) => (
          <span
            key={s.label}
            className="block h-full"
            style={{ width: `${pct(s.value, top)}%`, background: TONE[s.tone] }}
            title={`${s.label}: ${format(s.value)}`}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {segments.map((s) => (
          <li key={s.label} className="flex items-baseline gap-2.5">
            <span
              aria-hidden
              className="inline-block size-2.5 shrink-0 translate-y-px rounded-[2px]"
              style={{ background: TONE[s.tone] }}
            />
            <span className="min-w-0 flex-1 text-[14px] leading-tight text-ink-soft">
              {s.label}
            </span>
            <span className="shrink-0 font-mono text-[13px] tabular-nums text-ink">
              {format(s.value)}
              {unit ? <span className="text-ink-mute">{unit}</span> : null}
            </span>
            <span className="w-14 shrink-0 text-right font-mono text-[12px] whitespace-nowrap tabular-nums text-ink-mute">
              {share(s.value, top)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A short measured series over time or over ordered steps.
 *
 * Built the way `site/WeatherPanel.tsx`'s TempRibbon is: a stretched viewBox
 * with `vectorEffect="non-scaling-stroke"` so the line keeps its weight, and
 * the points as positioned divs rather than SVG circles, because a circle in a
 * sheared viewBox is an ellipse.
 *
 * The domain is always drawn and always stated. Four points on a truncated axis
 * can be made to look like any story at all, and this one is the project
 * grading itself.
 */
export function Trend({
  points,
  domain,
  tone = "gold",
  target,
  format = (v) => v.toFixed(2),
  height = 180,
}: {
  points: readonly { label: string; value: number; note?: string }[];
  domain: readonly [number, number];
  tone?: Tone;
  /** A dashed rule the series is read against: a goal, a floor, a baseline. */
  target?: { value: number; label: string };
  format?: (v: number) => string;
  height?: number;
}) {
  const [lo, hi] = domain;
  const x = (i: number) =>
    points.length < 2 ? 50 : q((i / (points.length - 1)) * 100);
  const y = (v: number) => q(100 - ((v - lo) / (hi - lo)) * 100);

  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  const area = `0,100 ${line} 100,100`;

  return (
    <div>
      <div className="relative w-full" style={{ height }}>
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          <polygon points={area} fill={WASH[tone]} />
          {target ? (
            <line
              x1="0"
              x2="100"
              y1={y(target.value)}
              y2={y(target.value)}
              stroke="var(--color-ink-mute)"
              strokeWidth="1"
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          <polyline
            points={line}
            fill="none"
            stroke={TONE[tone]}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {points.map((p, i) => (
          <span
            key={p.label}
            className="absolute size-2.5 rounded-full ring-2 ring-paper"
            style={{
              left: `${x(i)}%`,
              top: `${y(p.value)}%`,
              transform: "translate(-50%, -50%)",
              background: TONE[tone],
            }}
          />
        ))}
        {points.map((p, i) => (
          <span
            key={`v${p.label}`}
            className="absolute font-mono text-[12px] tabular-nums text-ink"
            style={{
              left: `${x(i)}%`,
              top: `${y(p.value)}%`,
              transform:
                i === 0
                  ? "translate(0, -160%)"
                  : i === points.length - 1
                    ? "translate(-100%, -160%)"
                    : "translate(-50%, -160%)",
            }}
          >
            {format(p.value)}
          </span>
        ))}
      </div>

      <div className="mt-2 flex justify-between gap-2 border-t border-line pt-2">
        {points.map((p, i) => (
          <span
            key={p.label}
            className={`ex-caption min-w-0 leading-tight ${
              i === 0
                ? "text-left"
                : i === points.length - 1
                  ? "text-right"
                  : "text-center"
            }`}
          >
            {p.label}
            {p.note ? <span className="block opacity-70">{p.note}</span> : null}
          </span>
        ))}
      </div>

      <p className="ex-caption mt-2 flex items-center gap-2">
        <span>
          axis {format(lo)} to {format(hi)}
        </span>
        {target ? (
          <>
            <span
              aria-hidden
              className="inline-block h-0 w-6 border-t border-dashed border-ink-mute"
            />
            <span>{target.label}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}
