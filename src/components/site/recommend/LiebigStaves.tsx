"use client";

import { cn } from "@/lib/cn";
import type { SuitabilityFactors } from "@/lib/recommendTypes";

/**
 * Liebig's law of the minimum, drawn the way agronomy has drawn it since 1840.
 *
 * The engine's S2 gate literally computes `score = min(eight factors)`. A
 * barrel made of staves of unequal length holds water only to the height of
 * its shortest stave, and that picture *is* the formula — which is why this
 * chart exists instead of a caption saying "limited by rainfall".
 *
 * So: eight staves, one per factor, each as tall as its own score. The water
 * fills to the shortest of them, and that stave is called out in `anar`. A
 * farmer looking at this can see which single thing is holding the crop back,
 * and how far below the others it sits — the two facts a number cannot carry.
 *
 * Every colour is a token. The ramp is the green one already used for the
 * nutrient charts; the short stave borrows the risk red the readings use.
 */

/** Fixed order, so two crops' barrels can be compared stave by stave. */
const ORDER = [
  "rain", "temp", "pH", "depth", "drainage", "salinity", "LGP", "texture",
] as const;

const LABEL: Record<(typeof ORDER)[number], { mr: string; en: string }> = {
  rain: { mr: "पाऊस", en: "Rain" },
  temp: { mr: "तापमान", en: "Temp" },
  pH: { mr: "सामू", en: "pH" },
  depth: { mr: "खोली", en: "Depth" },
  drainage: { mr: "निचरा", en: "Drain" },
  salinity: { mr: "क्षार", en: "Salt" },
  LGP: { mr: "हंगाम", en: "LGP" },
  texture: { mr: "पोत", en: "Texture" },
};

/** The name the engine uses for the limiting factor, in the farmer's own. */
export function factorLabel(name: string, mr: boolean): string {
  const entry = (LABEL as Record<string, { mr: string; en: string }>)[name];
  return entry ? (mr ? entry.mr : entry.en) : name;
}

const W = 400;
const H = 168;
const TOP = 12;          // headroom above a full-height stave
const FLOOR = 124;       // baseline the staves stand on
const BAR = 34;
const GAP = 10;

export function LiebigStaves({
  factors,
  limiting,
  mr,
  className,
}: {
  factors: Partial<SuitabilityFactors>;
  /** The engine's own `limiting_factor`. Marked even when several tie. */
  limiting: string;
  mr: boolean;
  className?: string;
}) {
  // Only the factors the engine actually scored. A missing one is left out
  // rather than drawn at zero, which would read as a hard veto.
  const staves = ORDER.filter((k) => typeof factors[k] === "number").map((k) => ({
    key: k,
    value: Math.max(0, Math.min(1, factors[k] as number)),
  }));
  if (!staves.length) return null;

  const min = Math.min(...staves.map((s) => s.value));
  const span = FLOOR - TOP;
  const total = staves.length * BAR + (staves.length - 1) * GAP;
  const x0 = (W - total) / 2;
  const waterY = FLOOR - min * span;

  const heading = mr
    ? "सगळ्यात कमी जे आहे, तेच पीक ठरवतं"
    : "The shortest stave sets the level";

  return (
    <figure className={cn("mt-1", className)}>
      <figcaption className="text-[13px] leading-relaxed text-ink-mute">
        {heading}
      </figcaption>
      {/* Capped, not full-bleed. The viewBox is 400 units wide and the
          labels are ~10px in those units, so letting it stretch to a
          1200px panel renders them at 30px — the chart shouted. */}
      <div className="mt-3 overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="mx-auto h-auto w-full max-w-[520px] min-w-[340px]"
          role="img"
          aria-label={
            mr
              ? `आठ घटकांचे गुण. सगळ्यात कमी: ${factorLabel(limiting, true)}.`
              : `Eight factor scores. Lowest: ${factorLabel(limiting, false)}.`
          }
        >
          {/* The water the barrel actually holds — up to the shortest stave,
              across the full width. This is the whole point of the picture. */}
          <rect
            x={x0 - 6}
            y={waterY}
            width={total + 12}
            height={FLOOR - waterY}
            fill="var(--color-jal)"
            opacity="0.16"
          />
          <line
            x1={x0 - 6}
            x2={x0 + total + 6}
            y1={waterY}
            y2={waterY}
            stroke="var(--color-jal)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            opacity="0.75"
          />

          {staves.map((s, i) => {
            const x = x0 + i * (BAR + GAP);
            const h = Math.max(2, s.value * span);
            const y = FLOOR - h;
            // Tied minima all get marked: the gate is a `min`, so two equally
            // short staves are equally the reason.
            const short = s.value <= min + 1e-9;
            return (
              <g key={s.key}>
                <rect
                  x={x}
                  y={y}
                  width={BAR}
                  height={h}
                  rx="4"
                  fill={short ? "var(--color-anar)" : "var(--color-leaf-3)"}
                />
                <text
                  x={x + BAR / 2}
                  y={y - 5}
                  textAnchor="middle"
                  className="tnum"
                  fontSize="10.5"
                  fill={short ? "var(--color-anar)" : "var(--color-ink-mute)"}
                  fontWeight={short ? 700 : 500}
                >
                  {s.value.toFixed(2)}
                </text>
                <text
                  x={x + BAR / 2}
                  y={FLOOR + 15}
                  textAnchor="middle"
                  fontSize="10.5"
                  fill={short ? "var(--color-anar)" : "var(--color-ink-mute)"}
                  fontWeight={short ? 600 : 400}
                >
                  {mr ? LABEL[s.key].mr : LABEL[s.key].en}
                </text>
              </g>
            );
          })}

          {/* The ground the staves stand on. */}
          <line
            x1={x0 - 10}
            x2={x0 + total + 10}
            y1={FLOOR}
            y2={FLOOR}
            stroke="var(--color-ink)"
            strokeWidth="1.5"
          />
          <text
            x={W / 2}
            y={FLOOR + 38}
            textAnchor="middle"
            fontSize="11"
            fill="var(--color-ink-mute)"
          >
            {mr
              ? `पाण्याची पातळी ${min.toFixed(2)} — ${factorLabel(limiting, true)}`
              : `Holds to ${min.toFixed(2)} — ${factorLabel(limiting, false)}`}
          </text>
        </svg>
      </div>
    </figure>
  );
}
