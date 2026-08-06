"use client";

import { motion, useReducedMotion } from "motion/react";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import {
  SAMPLE_READING,
  formatValue,
  positionOn,
  ratingKey,
  toneFill,
  tonePill,
  toneOf,
  type Reading,
} from "@/data/soilReading";

/**
 * What the card says, drawn.
 *
 * One horizontal bar per property. The bar is the measured value; the pale
 * block behind it is the range that reading is supposed to fall in. That
 * pairing is the whole point — a bar on its own says "178", which tells a
 * farmer nothing, while a bar that stops short of the block says "178, and it
 * should have been at least 280", which is the entire advice in one glance.
 *
 * Each row is scaled to its own axis because the twelve properties share no
 * units at all: nitrogen runs to 700 kg/ha and boron to 2.5 ppm. A single
 * shared axis would flatten eleven of them into nothing.
 *
 * Drawn with divs rather than a chart library: these are proportions of a
 * width, there is no trigonometry, and `<ArcGauge>` already proved what
 * server/client float drift does to an SVG (PLAN.md §9).
 */
export function NutrientChart({
  readings = SAMPLE_READING,
  className,
}: {
  readings?: Reading[];
  className?: string;
}) {
  const { t, lang } = useLang();
  const mr = lang === "mr";
  const reduced = useReducedMotion();

  const short = readings.filter((r) => toneOf(r) === "low");

  return (
    <div className={className}>
      <ul className="space-y-3.5">
        {readings.map((r, i) => {
          const tone = toneOf(r);
          const bandStart = positionOn(r, r.band[0]);
          const bandEnd = positionOn(r, r.band[1]);
          const valueAt = positionOn(r, r.value);
          // Six of the twelve have only a lower critical limit — anything
          // above it is simply sufficient. Shading that as a band would fill
          // most of the track and say "aim for the middle of this", which is
          // not what the card means. A minimum gets a line, not a window.
          const openEnded = bandEnd >= 1;

          return (
            <li key={r.key}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-[15px] text-ink">
                  {t(r.key)}
                  <span className="ml-1.5 font-mono text-[12px] text-ink-mute">
                    {r.symbol}
                  </span>
                </p>
                <p className="shrink-0 text-right">
                  <span className="tnum text-[15px] font-semibold text-ink">
                    {formatValue(r)}
                  </span>
                  {r.unit ? (
                    <span className="ml-1 font-mono text-[12px] text-ink-mute">
                      {r.unit}
                    </span>
                  ) : null}
                </p>
              </div>

              <div className="mt-1.5 flex items-center gap-3">
                {/* The track. Everything inside is a percentage of it, so the
                    whole row reflows at any width with no measurement. */}
                {/* Neutral, so green appears only where it means something.
                    A pale-green track end to end made every row read as
                    broadly fine at a glance, and a short reading arrived as a
                    red mark on a green field. Matches the reading chart in
                    CardReading.tsx — these two draw the same twelve numbers
                    and must not use two colour languages to do it. */}
                <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-ink/14 dark:bg-chalk/14">
                  {/* The target. A window where the card gives one, a minimum
                      line where it gives only a critical limit. Both sit under
                      the bar — they are context, not a reading. */}
                  {openEnded ? null : (
                    <div
                      className="absolute inset-y-0 bg-leaf-3"
                      style={{
                        left: `${bandStart * 100}%`,
                        width: `${(bandEnd - bandStart) * 100}%`,
                      }}
                      aria-hidden
                    />
                  )}
                  <motion.div
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full",
                      toneFill[tone],
                    )}
                    // `animate`, not `whileInView`. The bar starts at zero
                    // width, and a zero-area element never satisfies an
                    // IntersectionObserver threshold — so every row below the
                    // fold at mount stayed at 0px forever. It doesn't need a
                    // viewport trigger anyway: this chart only exists because
                    // someone just pressed Predict.
                    initial={{ width: 0 }}
                    animate={{ width: `${valueAt * 100}%` }}
                    transition={
                      reduced
                        ? { duration: 0 }
                        : {
                            duration: 0.7,
                            delay: 0.05 * i,
                            ease: [0.16, 1, 0.3, 1],
                          }
                    }
                  />

                  {/* Drawn last so it stays visible where the bar has already
                      crossed it — that crossing is the whole reading. */}
                  {openEnded ? (
                    <div
                      className="absolute inset-y-0 w-[3px] rounded-full bg-ink/45"
                      style={{ left: `calc(${bandStart * 100}% - 1.5px)` }}
                      aria-hidden
                    />
                  ) : null}
                </div>

                <span
                  className={cn(
                    "w-24 shrink-0 rounded-full px-2 py-0.5 text-center text-[12px] font-semibold sm:w-28",
                    tonePill[tone],
                  )}
                >
                  {t(ratingKey(r))}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {/* The key. Five marks, because the chart uses exactly five. */}
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4 text-[13px] text-ink-mute">
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-6 rounded-full bg-ink/14 dark:bg-chalk/14" aria-hidden />
          {mr ? "पातळीबाहेर" : "Outside the range"}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-6 rounded-full bg-leaf" aria-hidden />
          {mr ? "पुरेसं आहे" : "Enough"}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-6 rounded-full bg-anar" aria-hidden />
          {mr ? "कमी आहे" : "Short"}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-6 rounded-full bg-leaf-3" aria-hidden />
          {mr ? "असायला हवी ती पातळी" : "The range to be in"}
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-[3px] rounded-full bg-ink/45"
            aria-hidden
          />
          {mr ? "किमान एवढं हवं" : "The minimum to clear"}
        </span>
      </div>

      {short.length ? (
        <p className="mt-4 leading-relaxed text-ink-soft">
          <span className="font-semibold text-ink">
            {short.length}{" "}
            {mr
              ? short.length === 1
                ? "गोष्ट कमी आहे"
                : "गोष्टी कमी आहेत"
              : short.length === 1
                ? "reading is short"
                : "readings are short"}
            {" — "}
          </span>
          {short.map((r) => t(r.key)).join(", ")}.{" "}
          {mr
            ? "बाकीचं पुरेसं आहे, ते पुन्हा विकत घेऊ नका."
            : "The rest is sufficient — don't buy those again."}
        </p>
      ) : null}
    </div>
  );
}
