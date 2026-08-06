"use client";

import { useRef, type ReactNode } from "react";
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
  wrap,
} from "motion/react";
import { cn } from "@/lib/cn";

/**
 * A full-bleed row on an infinite horizontal loop.
 *
 * It drifts on its own and scroll drives it: scrolling down speeds it up,
 * scrolling up reverses it. Standing still it keeps a slow crawl, so the row
 * never reads as a dead strip of images.
 *
 * Two rules any row using this has to keep:
 *
 * 1. **Cards carry no links.** A moving target you're meant to click is a
 *    usability trap. These rows are something you watch.
 * 2. **Reduced motion is handled in CSS**, via `[data-marquee]` in globals.css,
 *    which turns the row into a plain scrollable strip. Branching the markup on
 *    a media query the server can't see is what breaks hydration — so the
 *    preference is read inside the animation frame, never during render.
 */

type MarqueeRowProps = {
  /** The cards. Rendered twice — the second copy is hidden from assistive tech. */
  children: ReactNode;
  ariaLabel: string;
  /** Percent of the track per second at rest. Negative drifts left. */
  baseVelocity?: number;
  className?: string;
};

export function MarqueeRow({
  children,
  ariaLabel,
  baseVelocity = -2.4,
  className,
}: MarqueeRowProps) {
  const reduced = useReducedMotion();
  const baseX = useMotionValue(0);
  const direction = useRef(1);

  const { scrollY } = useScroll();
  const scrollVelocity = useVelocity(scrollY);
  const smoothVelocity = useSpring(scrollVelocity, {
    damping: 50,
    stiffness: 400,
  });
  // clamp:false lets a fast flick push well past the baseline speed.
  const velocityFactor = useTransform(smoothVelocity, [0, 1000], [0, 4], {
    clamp: false,
  });

  // The track holds the set twice, so -50% of the track is exactly one set.
  // Wrapping there makes the seam invisible.
  const x = useTransform(baseX, (v) => `${wrap(-50, 0, v)}%`);

  useAnimationFrame((_t, delta) => {
    if (reduced) return;

    let moveBy = direction.current * baseVelocity * (delta / 1000);
    const factor = velocityFactor.get();

    if (factor < 0) direction.current = -1;
    else if (factor > 0) direction.current = 1;

    moveBy += direction.current * moveBy * factor;
    baseX.set(baseX.get() + moveBy);
  });

  return (
    <div
      data-marquee
      className={cn("hide-scrollbar relative overflow-hidden", className)}
      role="group"
      aria-label={ariaLabel}
    >
      <motion.div className="flex w-max gap-6" style={{ x }}>
        <ul className="flex shrink-0 gap-6">{children}</ul>
        <ul className="flex shrink-0 gap-6" aria-hidden>
          {children}
        </ul>
      </motion.div>

      {/* The row runs to the viewport edge; these fade it out rather than
          letting cards get guillotined. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-linear-to-r from-paper to-transparent md:w-24" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-linear-to-l from-paper to-transparent md:w-24" />
    </div>
  );
}

/**
 * The shared card shell for every marquee row: square image, a bilingual name
 * pair, and one tinted tag. Keeping it here is what makes the three rows read
 * as one system rather than three near-misses.
 */
export function MarqueeCard({
  lead,
  sub,
  tag,
  tagClass,
  children,
}: {
  lead: string;
  sub: string;
  tag: string;
  tagClass: string;
  /** The image, normally a <PhotoPanel>. */
  children: ReactNode;
}) {
  return (
    <li className="w-52 shrink-0 sm:w-64">
      {children}
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[17px] font-semibold text-ink">{lead}</h3>
          <p className="truncate text-[14px] text-ink-mute">{sub}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold",
            tagClass,
          )}
        >
          {tag}
        </span>
      </div>
    </li>
  );
}
