"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Scroll-triggered entrance.
 *
 * The `prefers-reduced-motion` block in globals.css kills CSS animation but
 * has no effect on motion's JS-driven values — so every animated component in
 * this project has to ask for itself.
 *
 * It asks in the transition, never in the markup. `useReducedMotion()` returns
 * null during SSR and a boolean on the client, so branching on it while
 * rendering hands reduced-motion users a hydration mismatch — the structure
 * and initial style must be identical on both sides. Only the transition
 * changes, and transitions aren't serialised into the server HTML.
 *
 * `data-reveal` is the hook for the no-JS fallback in the root layout: without
 * it, an `initial` of opacity 0 would leave the page blank when the script
 * never arrives. That matters more than usual for this audience.
 */

type RevealProps = {
  children: ReactNode;
  /** Seconds. Stagger siblings by ~0.06 to get a line-by-line rise. */
  delay?: number;
  /** How far it travels in. Small — this should be barely noticed. */
  distance?: number;
  className?: string;
};

export function Reveal({
  children,
  delay = 0,
  distance = 16,
  className,
}: RevealProps) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      data-reveal
      className={className}
      initial={{ opacity: 0, y: distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-12% 0px" }}
      transition={
        reduced
          ? { duration: 0 }
          : // --ease-regur. Everything decelerates like settling soil.
            { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }
      }
    >
      {children}
    </motion.div>
  );
}
