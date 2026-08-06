"use client";

import { motion, useReducedMotion } from "motion/react";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import {
  SAMPLE_READING,
  formatValue,
  ratingKey,
} from "@/data/soilReading";

/**
 * The signature (PLAN.md §4).
 *
 * Rendered as markup rather than a photograph: the marks have to land on
 * specific values, and anchoring SVG to a photo breaks at every viewport.
 * As markup the rows are elements, so a mark can attach to one.
 *
 * Marked as a sample throughout — it shows the format of the card a farmer
 * holds, it is not a reproduction of anyone's actual record.
 */

/** Only two rows carry a mark, and they are the two the hero is arguing about. */
const MARKED: Record<string, "highlight" | "circle"> = {
  nutPh: "highlight",
  nutN: "circle",
};

/** Seconds. The marks land after the card has settled, one then the other. */
const T_HIGHLIGHT = 0.7;
const T_CIRCLE = 1.5;

export function SoilCard({ className }: { className?: string }) {
  const { t, lang } = useLang();
  const reduced = useReducedMotion();
  const mr = lang === "mr";

  return (
    <div
      className={cn(
        "paper-island relative w-full max-w-md min-w-0 rounded-lg border border-line bg-[#fdfcf7] px-4 py-5 sm:px-6",
        "rotate-[-0.7deg]", // it's a piece of paper on a table, not a div
        className,
      )}
      style={{ boxShadow: "var(--shadow-panel)" }}
    >
      <header className="flex items-start justify-between gap-3 border-b border-ink/15 pb-3">
        {/* Both scripts always, active one leading — it's how the printed card
            itself is headed, and it keeps the artifact recognisable to a
            Marathi reader even while the page is in English. */}
        <div style={{ fontFamily: "var(--font-doc)" }}>
          <h3 className="text-[17px] leading-tight font-normal text-ink">
            {mr ? "माती आरोग्य पत्रिका" : "Soil Health Card"}
          </h3>
          <p className="text-[12px] text-ink-mute">
            {mr ? "Soil Health Card" : "माती आरोग्य पत्रिका"}
          </p>
        </div>
        <span className="eyebrow shrink-0 rounded-sm border border-ink/25 px-1.5 py-1 text-[10px] text-ink-mute">
          {mr ? "नमुना" : "Sample"}
        </span>
      </header>

      {/* Plex Mono carries no Devanagari, so this line sets in the document
          face — mono is for measured values, and this is a reference number. */}
      <p
        className="mt-2 text-[12px] tracking-wide text-ink-mute"
        style={{ fontFamily: "var(--font-doc)" }}
      >
        {mr ? "क्र. ०००० · खरीप २०२६" : "No. 0000 · Kharif 2026"}
      </p>

      {/* All twelve, in the order the printed card lists them. Rows are tight
          because a real Soil Health Card is a dense document, not a dashboard
          — and at twelve rows the density is what makes it read as one. */}
      <dl className="mt-2.5">
        {SAMPLE_READING.map((row) => {
          const mark = MARKED[row.key];
          return (
            <div
              key={row.key}
              className="relative flex items-baseline gap-3 border-b border-ink/10 py-1.5 last:border-b-0"
            >
              <dt
                className="min-w-0 flex-1 truncate text-[13px] text-ink-soft sm:text-[14px]"
                style={{ fontFamily: "var(--font-doc)" }}
              >
                {t(row.key)}
              </dt>

              <dd className="relative shrink-0">
                {mark === "highlight" ? (
                  <Highlighter reduced={reduced}>
                    {formatValue(row)}
                  </Highlighter>
                ) : (
                  <span className="tnum text-[14px] font-medium text-ink">
                    {formatValue(row)}
                  </span>
                )}
                {mark === "circle" ? <CircleMark reduced={reduced} /> : null}
              </dd>

              {/* Units set in the document face, not mono — Plex Mono has no
                  Devanagari and these carry none, but the card prints them in
                  the same typeface as everything else on it. */}
              <dd
                className="w-10 shrink-0 text-[11px] text-ink-mute sm:w-12"
                style={{ fontFamily: "var(--font-doc)" }}
              >
                {row.unit}
              </dd>

              <dd className="w-16 shrink-0 text-right text-[11px] text-ink-mute sm:w-20 sm:text-[12px]">
                {t(ratingKey(row))}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

/**
 * The haldi swipe. Ink stays ink — 6.7:1 — and the wash sweeps in behind it,
 * left to right, the way a marker actually travels.
 */
function Highlighter({
  children,
  reduced,
}: {
  children: React.ReactNode;
  reduced: boolean | null;
}) {
  return (
    <motion.span
      className="marked tnum relative text-[15px] font-semibold"
      initial={{ backgroundSize: "0% 62%" }}
      animate={{ backgroundSize: "100% 62%" }}
      transition={
        reduced
          ? { duration: 0 }
          : { duration: 0.42, delay: T_HIGHLIGHT, ease: [0.16, 1, 0.3, 1] }
      }
    >
      {children}
    </motion.span>
  );
}

/**
 * A rough ring in anar — "this is the problem". Overshoots where it closes,
 * because a hand does. Drawn with pathLength so it scribbles on rather than
 * fading in.
 */
function CircleMark({ reduced }: { reduced: boolean | null }) {
  return (
    <svg
      viewBox="0 0 96 44"
      // Tight enough to clear the unit column beside it: at -inset-x-4 the
      // ring's right edge ran into "kg/ha".
      className="pointer-events-none absolute -inset-x-3 -inset-y-2 h-[calc(100%+1rem)] w-[calc(100%+1.5rem)] overflow-visible"
      fill="none"
      aria-hidden
    >
      <motion.path
        d="M14 24C11 12 30 6 52 7c20 1 32 7 30 15-2 8-24 15-46 13C20 34 9 28 12 19"
        stroke="var(--color-anar)"
        strokeWidth="2.2"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={
          reduced
            ? { duration: 0 }
            : { duration: 0.7, delay: T_CIRCLE, ease: "easeInOut" }
        }
      />
    </svg>
  );
}

export { T_HIGHLIGHT, T_CIRCLE };
