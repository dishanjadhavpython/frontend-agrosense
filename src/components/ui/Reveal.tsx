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
          : {
              // A spring rather than a fixed 0.7s tween.
              //
              // A duration-based ease takes the same time however far the
              // element travels, so a 16px rise and a 40px one feel like the
              // same gesture played at different speeds — which is what makes
              // a page read as animated rather than as moving. A spring
              // settles in proportion to its displacement, so the small ones
              // arrive quickly and the large ones take their time, and neither
              // announces itself.
              //
              // Critically damped-ish: damping high enough that nothing
              // overshoots. This is soil settling, not a bounce.
              type: "spring",
              stiffness: 140,
              damping: 22,
              mass: 0.9,
              delay,
              // Below this the element is close enough that another frame of
              // animation is wasted work on a phone.
              restDelta: 0.4,
            }
      }
    >
      {children}
    </motion.div>
  );
}
