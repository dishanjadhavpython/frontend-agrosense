import type { Tone } from "@/data/examiner/types";
import { TONE, q } from "./geom";

/**
 * The donut both references put a number inside.
 *
 * Drawn as one `<circle>` per segment with `stroke-dasharray`, not as arc
 * paths. That is not only shorter — it is the only version of this chart that
 * calls no trigonometry at all, which is the rule `geom.ts` sets out and the
 * hydration bug `ArcGauge.tsx` documents. The circumference is `2 * PI * r`:
 * `Math.PI` is a constant and multiplication is exactly specified in IEEE-754,
 * so Node and the browser agree to the last bit. `Math.cos` would not.
 *
 * Rotation to start at twelve o'clock is a CSS transform, so no coordinate is
 * computed for it either.
 */
export function Ring({
  segments,
  centre,
  caption,
  size = 168,
  thickness = 14,
}: {
  segments: readonly { label: string; value: number; tone: Tone }[];
  /** The number in the hole, and what it counts. */
  centre: { value: string | number; label?: string };
  caption?: string;
  size?: number;
  thickness?: number;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = (size - thickness) / 2;
  const circumference = q(2 * Math.PI * r);

  // Prefix sums rather than an accumulator mutated inside `map`: the React
  // compiler rejects reassigning a variable across a render, and it is right to
  // — a dash offset that depends on iteration order is the kind of thing that
  // works until a list is reordered.
  const lengths = segments.map((s) => q((s.value / total) * circumference));
  const drawn = segments.map((s, i) => ({
    ...s,
    length: lengths[i],
    offset: q(-lengths.slice(0, i).reduce((a, b) => a + b, 0)),
    // One decimal, not three: a share is read, not computed from. `q()` is for
    // coordinates, where three places is about hydration, not legibility.
    share: Math.round((s.value / total) * 1000) / 10,
  }));

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          role="img"
          aria-label={drawn.map((d) => `${d.label} ${d.share}%`).join(", ")}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--color-sunk)"
            strokeWidth={thickness}
          />
          {drawn.map((d) => (
            <circle
              key={d.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={TONE[d.tone]}
              strokeWidth={thickness}
              strokeLinecap="butt"
              strokeDasharray={`${d.length} ${q(circumference - d.length)}`}
              strokeDashoffset={d.offset}
            />
          ))}
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p className="font-mono text-[1.75rem] leading-none font-medium tabular-nums text-ink">
              {centre.value}
            </p>
            {centre.label ? (
              <p className="ex-caption mt-1">{centre.label}</p>
            ) : null}
          </div>
        </div>
      </div>

      <ul className="flex min-w-0 flex-col gap-2">
        {drawn.map((d) => (
          <li key={d.label} className="flex items-baseline gap-2.5">
            <span
              aria-hidden
              className="inline-block size-2.5 shrink-0 translate-y-px rounded-full"
              style={{ background: TONE[d.tone] }}
            />
            <span className="min-w-0 text-[14px] text-ink-soft">{d.label}</span>
            <span className="ml-auto pl-3 font-mono text-[13px] tabular-nums text-ink">
              {d.value.toLocaleString("en-IN")}
            </span>
            <span className="w-12 shrink-0 text-right font-mono text-[12px] tabular-nums text-ink-mute">
              {d.share}%
            </span>
          </li>
        ))}
        {caption ? <li className="ex-caption mt-1">{caption}</li> : null}
      </ul>
    </div>
  );
}
