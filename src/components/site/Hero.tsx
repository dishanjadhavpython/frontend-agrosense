"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useLang } from "@/lib/i18n";
import { ButtonLink } from "@/components/ui/Button";
import { Statement } from "@/components/ui/Type";
import { SoilCard, T_HIGHLIGHT, T_CIRCLE } from "./SoilCard";

/**
 * The hero is the signature, not a warm-up for it (PLAN.md §4).
 *
 * The whole proposition is "you're holding a document you can't act on; we
 * read it for you" — so the page opens with the document, and reads it while
 * you watch. Running a photo-and-stats hero first would bury the argument.
 */
export function Hero() {
  const { t, lang } = useLang();
  const reduced = useReducedMotion();
  const mr = lang === "mr";

  // Line-by-line rise on load, then nothing moves until you scroll.
  // The reduced-motion check lives in the transition only — branching on it
  // in the markup breaks hydration. See Reveal.tsx for the full reasoning.
  const rise = (delay: number) => ({
    "data-reveal": true,
    initial: { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: reduced
      ? { duration: 0 }
      : { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] as const },
  });

  return (
    <section className="mx-auto max-w-7xl px-5 pt-12 pb-6 md:px-8 md:pt-20 md:pb-10">
      <div className="grid items-start gap-14 lg:grid-cols-[0.95fr_1.05fr] lg:gap-10">
        <div className="min-w-0 lg:pt-10">
          <motion.div {...rise(0)}>
            {/* The wordmark stays Latin in both languages — a brand name isn't
                translated. `lang="en"` also keeps it out of the :lang(mr) rule
                in globals.css, so it compresses to wdth 92 on a Marathi page
                exactly as it does on an English one.
                `wordmark` overrides Statement's text-ink: the primary green,
                lit, with the glow scaled off the em. */}
            <Statement
              lang="en"
              className="wordmark text-leaf text-[clamp(3rem,8.5vw,7.5rem)] tracking-[-0.035em]"
            >
              AgroSense
            </Statement>
          </motion.div>

          <motion.p
            {...rise(0.1)}
            className="section-head mt-4 max-w-md whitespace-pre-line text-ink"
          >
            {t("heroTitle")}
          </motion.p>

          <motion.p
            {...rise(0.18)}
            className="mt-5 max-w-md text-lg leading-relaxed text-ink-soft"
          >
            {t("heroSub")}
          </motion.p>

          <motion.div
            {...rise(0.26)}
            className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3"
          >
            <ButtonLink href="/soil" variant="primary" className="px-7">
              {t("actTestSoil")}
            </ButtonLink>
            <ButtonLink href="/soil?sample=1" variant="quiet">
              {t("actTrySample")} →
            </ButtonLink>
          </motion.div>
        </div>

        {/* The card, and what it means, side by side. */}
        <motion.div
          {...rise(0.3)}
          className="flex min-w-0 flex-col gap-8 sm:flex-row sm:items-start sm:gap-5"
        >
          <SoilCard className="sm:max-w-[22rem] sm:shrink-0" />

          <div className="flex flex-col gap-7 sm:pt-10">
            <Reading
              delay={T_HIGHLIGHT + 0.35}
              reduced={reduced}
              term={mr ? "सामू ८.४" : "pH 8.4"}
              tone="haldi"
            >
              {mr
                ? "तुमची जमीन क्षारयुक्त आहे. चुना टाकू नका."
                : "Your soil is alkaline. Don't add lime."}
            </Reading>

            <Reading
              delay={T_CIRCLE + 0.45}
              reduced={reduced}
              term={mr ? "नत्र कमी आहे" : "Nitrogen is low"}
              tone="anar"
            >
              {mr
                ? "युरिया ५० किलो/एकर — पेरणीनंतर ३० दिवसांनी."
                : "Urea 50 kg/acre, 30 days after sowing."}
            </Reading>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/**
 * A margin note. The arrow gestures back at the card rather than connecting to
 * an exact pixel on it — a drawn line that has to survive every viewport ends
 * up looking mechanical, which is the opposite of the point.
 */
function Reading({
  term,
  children,
  delay,
  reduced,
  tone,
}: {
  term: string;
  children: ReactNode;
  delay: number;
  reduced: boolean | null;
  tone: "haldi" | "anar";
}) {
  const stroke = tone === "haldi" ? "var(--color-haldi-ink)" : "var(--color-anar)";

  return (
    <motion.div
      data-reveal
      className="flex items-start gap-2.5"
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={
        reduced
          ? { duration: 0 }
          : { duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }
      }
    >
      <svg
        viewBox="0 0 44 30"
        className="mt-1 h-6 w-8 shrink-0 -scale-x-100 sm:scale-x-100"
        fill="none"
        aria-hidden
      >
        <path
          d="M42 5C28 2 12 8 5 21"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M4 12.5 5 21.5l8.5-3"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <div>
        <p className="text-[15px] font-semibold text-ink">{term}</p>
        <p className="mt-0.5 max-w-[15rem] leading-snug text-ink-soft">
          {children}
        </p>
      </div>
    </motion.div>
  );
}
