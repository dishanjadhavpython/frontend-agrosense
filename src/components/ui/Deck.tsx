"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A deck of pallets, scrolled horizontally, with the centre one forward.
 *
 * The scrolling is native — `overflow-x-auto` with scroll-snap. That is the
 * whole reason this is short: trackpad, touch, shift-wheel, arrow keys, the
 * scrollbar and screen-reader navigation all work already, and none of them
 * had to be reimplemented. The buttons call `scrollIntoView` on a real element
 * rather than driving a virtual index.
 *
 * **Depth comes from a discrete index, not from scroll offset.** The tempting
 * version maps every card's transform continuously off `scrollX`, which means
 * measuring the container, measuring the card stride, keeping both right
 * through resize, and emitting server markup that cannot know any of it. With
 * scroll-snap the card *is* discrete, so the honest model is an index: an
 * IntersectionObserver rooted on the scroller reports which card is centred,
 * and each card styles itself from its distance from that index. Springs
 * between the states make it read as continuous anyway.
 *
 * That also makes it deterministic on the server. At index 0 every transform is
 * a pure function of the card's own index, so the first client render matches
 * the HTML with nothing measured.
 *
 * Reduced motion drops the perspective and every transform and leaves a plain
 * scrollable row — the same bargain `[data-marquee]` already makes in
 * globals.css.
 */

/** How far back each step from centre sits. Beyond ±3 nothing changes. */
const DEPTH = [
  { rotate: 0, z: 40, scale: 1, opacity: 1 },
  { rotate: 20, z: -130, scale: 0.9, opacity: 0.72 },
  { rotate: 28, z: -230, scale: 0.82, opacity: 0.45 },
  { rotate: 32, z: -300, scale: 0.78, opacity: 0.24 },
] as const;

const depthFor = (distance: number) => {
  const step = DEPTH[Math.min(Math.abs(distance), DEPTH.length - 1)];
  return {
    rotateY: distance === 0 ? 0 : distance < 0 ? step.rotate : -step.rotate,
    z: step.z,
    scale: step.scale,
    opacity: step.opacity,
  };
};

export function Deck({
  children,
  label,
  glow = "leaf",
  className,
}: {
  /** One node per pallet. */
  children: ReactNode[];
  /** Names the scroll region for anyone not looking at it. */
  label: string;
  /** Which hue the pallets bloom in, in the dark. Nothing on paper. */
  glow?: "leaf" | "haldi";
  className?: string;
}) {
  const reduced = useReducedMotion();
  const scroller = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  const id = useId();

  /**
   * Which pallet is centred. Rooted on the scroller with a tall, narrow slice
   * down the middle, so "in view" means "in the middle" rather than "on
   * screen" — with five cards visible at once the plain version reported four
   * of them at all times.
   */
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;

    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-pallet]"));
    if (cards.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const centred = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!centred) return;
        const index = cards.indexOf(centred.target as HTMLElement);
        if (index >= 0) setActive(index);
      },
      { root, rootMargin: "0px -45%", threshold: [0.15, 0.5, 0.9] },
    );

    cards.forEach((c) => observer.observe(c));
    return () => observer.disconnect();
  }, [children.length]);

  const go = useCallback((to: number) => {
    const root = scroller.current;
    if (!root) return;
    const cards = root.querySelectorAll<HTMLElement>("[data-pallet]");
    const target = cards[Math.max(0, Math.min(to, cards.length - 1))];
    target?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, []);

  const count = children.length;

  return (
    <div className={cn("relative", className)}>
      <ul
        ref={scroller}
        aria-label={label}
        data-deck
        className={cn(
          "hide-scrollbar flex snap-x snap-mandatory gap-5 overflow-x-auto",
          // The padding is what lets the first and last pallet reach the
          // middle of the scroller — without it neither can ever be centred.
          "scroll-px-[50%] px-[calc(50%-8.75rem)] py-8 sm:px-[calc(50%-11rem)]",
        )}
        // Unconditional, and deliberately so. `useReducedMotion()` is null on
        // the server and a boolean on the client, so branching a *style* on it
        // hands hydration two different attributes — the exact trap Reveal.tsx
        // documents. Perspective with nothing transformed under it has no
        // visual effect anyway; the reduced-motion answer lives in `animate`,
        // where it is a transition and never reaches the server HTML.
        style={
          {
            perspective: "1400px",
            "--deck-hue":
              glow === "haldi" ? "var(--color-haldi)" : "var(--color-leaf)",
          } as CSSProperties
        }
      >
        {children.map((child, i) => {
          const d = i - active;
          const depth = depthFor(d);

          return (
            <motion.li
              key={i}
              data-pallet
              className={cn(
                "relative w-[17.5rem] shrink-0 snap-center rounded-[26px] sm:w-[22rem]",
                // Matches the pallet's own radius, so the bloom follows the
                // card's corners rather than a rectangle behind them.
                d === 0 ? "deck-glow-near" : "deck-glow",
              )}
              style={{
                transformStyle: "preserve-3d",
                // Painted back to front, so the centre pallet genuinely sits
                // over its neighbours rather than merely looking bigger.
                zIndex: DEPTH.length - Math.min(Math.abs(d), DEPTH.length - 1),
              }}
              animate={
                reduced
                  ? { rotateY: 0, z: 0, scale: 1, opacity: 1 }
                  : depth
              }
              transition={
                reduced
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 260, damping: 30, mass: 0.9 }
              }
            >
              {child}
            </motion.li>
          );
        })}
      </ul>

      {/* Controls. Real buttons over a real scroller — they move the same
          scroll position a trackpad would, so the two can never disagree. */}
      <div className="mt-1 flex items-center justify-center gap-3">
        <Arrow
          onClick={() => go(active - 1)}
          disabled={active === 0}
          label={`${label} — previous`}
        >
          <ChevronLeft className="size-5" strokeWidth={2} aria-hidden />
        </Arrow>

        <ol className="flex items-center gap-1.5" aria-hidden>
          {children.map((_, i) => (
            <li
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === active ? "w-6 bg-leaf" : "w-1.5 bg-line",
              )}
            />
          ))}
        </ol>

        <Arrow
          onClick={() => go(active + 1)}
          disabled={active === count - 1}
          label={`${label} — next`}
        >
          <ChevronRight className="size-5" strokeWidth={2} aria-hidden />
        </Arrow>
      </div>

      {/* Which one is centred, for anyone who cannot see the deck. */}
      <p className="sr-only" aria-live="polite" id={id}>
        {active + 1} / {count}
      </p>
    </div>
  );
}

function Arrow({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink",
        "transition-colors hover:border-leaf/50 hover:bg-leaf-wash",
        "disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-line disabled:hover:bg-surface",
      )}
    >
      {children}
    </button>
  );
}
