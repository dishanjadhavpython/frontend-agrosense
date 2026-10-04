import type { Tone } from "@/data/examiner/types";
import { cn } from "@/lib/cn";
import { TONE, pct, q } from "./geom";

/**
 * Bars are divs, not SVG.
 *
 * `site/NutrientChart.tsx` states the house reasoning and it holds here: these
 * are proportions of a width, there is no trigonometry, and a div wraps its own
 * label, prints, and can be selected. Reserve SVG for the figures that genuinely
 * need one coordinate system — paths, whiskers, edges.
 */

const LABEL_W = {
  sm: "w-24 sm:w-28",
  md: "w-32 sm:w-40",
  lg: "w-36 sm:w-52",
} as const;

export type BarDatum = {
  label: string;
  value: number;
  tone?: Tone;
  /** Overrides the formatted value, for "0.8909 ± 0.036" and the like. */
  display?: string;
  /** A second line under the label: protocol, n, a caveat. */
  sub?: string;
  /**
   * Drawn as a hatched ghost. `globals.css` defines `hatch` for exactly this —
   * "provisional rather than fact" — which is how a model that never produced a
   * number appears: recorded, not quietly dropped from the chart.
   */
  ghost?: string;
};

export function BarRow({
  rows,
  max,
  baseline,
  format = (v) => v.toFixed(3),
  labelWidth = "md",
}: {
  rows: readonly BarDatum[];
  /** Pass a shared max to make two charts comparable by eye. */
  max?: number;
  /** A dashed rule the bars are read against: a random or majority floor. */
  baseline?: { value: number; label: string };
  format?: (v: number) => string;
  labelWidth?: keyof typeof LABEL_W;
}) {
  const top =
    max ?? Math.max(...rows.map((r) => r.value), baseline?.value ?? 0);

  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((row) => {
        const width = pct(row.value, top);
        return (
          <div key={row.label} className="flex items-center gap-3 sm:gap-4">
            <div className={cn("shrink-0", LABEL_W[labelWidth])}>
              <span className="block text-[14px] leading-tight text-ink">
                {row.label}
              </span>
              {row.sub ? (
                <span className="ex-caption block leading-tight">
                  {row.sub}
                </span>
              ) : null}
            </div>

            <div className="relative h-7 min-w-0 flex-1 rounded-sm bg-sunk">
              {row.ghost ? (
                <div className="hatch absolute inset-y-0 left-0 w-full rounded-sm opacity-60" />
              ) : (
                <div
                  className="absolute inset-y-0 left-0 rounded-sm"
                  style={{
                    width: `${width}%`,
                    background: TONE[row.tone ?? "gold"],
                  }}
                />
              )}
              {baseline ? (
                <div
                  aria-hidden
                  className="absolute inset-y-[-3px] w-px border-l border-dashed border-ink-mute"
                  style={{ left: `${pct(baseline.value, top)}%` }}
                />
              ) : null}
            </div>

            <div className="w-24 shrink-0 text-right font-mono text-[13px] tabular-nums text-ink sm:w-28">
              {row.ghost ? (
                <span className="text-ink-mute">{row.ghost}</span>
              ) : (
                (row.display ?? format(row.value))
              )}
            </div>
          </div>
        );
      })}

      {baseline ? (
        <p className="ex-caption mt-1 flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-0 w-6 border-t border-dashed border-ink-mute"
          />
          {baseline.label}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Clustered comparison: the same measurements taken across several arms.
 *
 * `missing` is how an arm that produced nothing still appears — with the reason
 * in place of a number. A tournament that silently drops its failures reports a
 * different result from the one that was run.
 */
export function GroupedBars({
  groups,
  series,
  max,
  missing,
  format = (v) => v.toFixed(3),
}: {
  groups: readonly {
    label: string;
    bars: readonly { series: string; value: number }[];
  }[];
  series: readonly { name: string; tone: Tone }[];
  max?: number;
  missing?: Readonly<Record<string, string>>;
  format?: (v: number) => string;
}) {
  const top =
    max ?? Math.max(...groups.flatMap((g) => g.bars.map((b) => b.value)));
  const toneOf = (name: string) =>
    TONE[series.find((s) => s.name === name)?.tone ?? "mute"];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {series.map((s) => (
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
            {missing?.[s.name] ? (
              <span className="ex-caption">— {missing[s.name]}</span>
            ) : null}
          </span>
        ))}
      </div>

      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="text-[14px] text-ink">{group.label}</p>
            <div className="mt-2 flex flex-col gap-1.5">
              {series.map((s) => {
                const bar = group.bars.find((b) => b.series === s.name);
                const gone = missing?.[s.name];
                return (
                  <div key={s.name} className="flex items-center gap-3">
                    <div className="relative h-5 min-w-0 flex-1 rounded-sm bg-sunk">
                      {bar ? (
                        <div
                          className="absolute inset-y-0 left-0 rounded-sm"
                          style={{
                            width: `${pct(bar.value, top)}%`,
                            background: toneOf(s.name),
                          }}
                        />
                      ) : gone ? (
                        <div className="hatch absolute inset-0 rounded-sm opacity-50" />
                      ) : null}
                    </div>
                    <div className="w-28 shrink-0 text-right font-mono text-[12px] tabular-nums">
                      {bar ? (
                        <span className="text-ink">{format(bar.value)}</span>
                      ) : (
                        <span className="text-ink-mute">{gone ?? "—"}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Per-fold spread as a dot strip. The mean of five folds says what a model
 * scores; the spread says whether you should believe the ordering, and at 393
 * scenes that is the more important half.
 */
export function Spread({
  rows,
  domain,
}: {
  rows: readonly {
    label: string;
    points: readonly number[];
    mean: number;
    tone?: Tone;
  }[];
  domain: readonly [number, number];
}) {
  const [lo, hi] = domain;
  const at = (v: number) => q(((v - lo) / (hi - lo)) * 100);

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-4">
          <span className="w-40 shrink-0 text-[14px] text-ink sm:w-52">
            {row.label}
          </span>
          <div className="relative h-7 min-w-0 flex-1">
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
            {row.points.map((p, i) => (
              <span
                key={i}
                className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-55"
                style={{
                  left: `${at(p)}%`,
                  background: TONE[row.tone ?? "mute"],
                }}
              />
            ))}
            <span
              className="absolute top-1/2 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${at(row.mean)}%`,
                background: TONE[row.tone ?? "gold"],
              }}
            />
          </div>
          <span className="w-16 shrink-0 text-right font-mono text-[13px] tabular-nums text-ink">
            {row.mean.toFixed(3)}
          </span>
        </div>
      ))}
      {/* The axis reuses the row's own columns rather than a hardcoded indent:
          a fixed `pl-44` lines up at one card width and nowhere else, and this
          kit puts the same chart in a 5-span card and a 12-span one. */}
      <div className="flex items-center gap-4">
        <span aria-hidden className="w-40 shrink-0 sm:w-52" />
        <span className="ex-caption flex min-w-0 flex-1 justify-between font-mono">
          <span>{lo.toFixed(2)}</span>
          <span>{hi.toFixed(2)}</span>
        </span>
        <span aria-hidden className="w-16 shrink-0" />
      </div>
      <p className="ex-caption">
        each dot is one held-out fold · the bar is the mean
      </p>
    </div>
  );
}

/**
 * Several measurements per group, on one axis with a domain that starts where
 * the data does.
 *
 * Bars from zero are the right chart for a count and the wrong one for a set of
 * scores clustered between 0.83 and 0.96: twelve bars all filling nine-tenths
 * of their track carry almost no information and a great deal of ink. Dots on a
 * shared, labelled domain show the same numbers as differences, which is what
 * the reader is there to see.
 *
 * The domain is always stated on the axis, because a truncated axis that hides
 * its own floor is the oldest way to overstate a result.
 */
export function DotPlot({
  groups,
  series,
  domain,
  format = (v) => v.toFixed(3),
}: {
  groups: readonly {
    label: string;
    sub?: string;
    points: readonly { series: string; value: number }[];
  }[];
  series: readonly { name: string; tone: Tone }[];
  domain: readonly [number, number];
  format?: (v: number) => string;
}) {
  const [lo, hi] = domain;
  const at = (v: number) => q(((v - lo) / (hi - lo)) * 100);
  const toneOf = (name: string) =>
    TONE[series.find((s) => s.name === name)?.tone ?? "mute"];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {series.map((s) => (
          <span
            key={s.name}
            className="flex items-center gap-2 text-[13px] text-ink-soft"
          >
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-full"
              style={{ background: TONE[s.tone] }}
            />
            {s.name}
          </span>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <div
            key={group.label}
            className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="w-full shrink-0 sm:w-36">
              <span className="text-[14px] leading-tight text-ink">
                {group.label}
              </span>
              {group.sub ? (
                <span className="ex-caption block leading-tight">
                  {group.sub}
                </span>
              ) : null}
            </div>

            <div className="relative h-6 min-w-0 flex-1">
              <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
              {group.points.map((p) => (
                <span
                  key={p.series}
                  className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-paper"
                  style={{
                    left: `${at(p.value)}%`,
                    background: toneOf(p.series),
                  }}
                />
              ))}
            </div>

            <div className="flex shrink-0 gap-2.5 font-mono text-[12px] tabular-nums sm:w-40 sm:justify-end">
              {series.map((s) => {
                const p = group.points.find((x) => x.series === s.name);
                return (
                  <span key={s.name} style={{ color: TONE[s.tone] }}>
                    {p ? format(p.value) : "—"}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
        <span aria-hidden className="hidden shrink-0 sm:block sm:w-36" />
        <span className="ex-caption flex min-w-0 flex-1 justify-between font-mono">
          <span>{lo.toFixed(2)}</span>
          <span>{hi.toFixed(2)}</span>
        </span>
        <span aria-hidden className="hidden shrink-0 sm:block sm:w-40" />
      </div>
    </div>
  );
}
