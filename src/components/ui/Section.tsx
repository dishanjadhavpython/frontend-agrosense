import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Eyebrow, SectionHead } from "./Type";

/**
 * One place owns section rhythm. Padding set per-section drifts and then
 * fights itself across files — this keeps the vertical scale in a single
 * declaration.
 */
export function Section({
  id,
  eyebrow,
  heading,
  headingClassName,
  lede,
  children,
  className,
  eager = false,
}: {
  id?: string;
  eyebrow?: string;
  heading?: ReactNode;
  /** For the rare section that colours its own heading. */
  headingClassName?: string;
  lede?: ReactNode;
  children: ReactNode;
  className?: string;
  /**
   * Set on the one or two sections that are above the fold. Everything else
   * defers its layout and paint until it nears the viewport — see
   * `.defer-paint`. Opt *out* rather than in, so a section added later gets
   * the cheap behaviour by default and only the hero has to think about it.
   */
  eager?: boolean;
}) {
  return (
    <section
      id={id}
      className={cn(
        "mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-28",
        !eager && "defer-paint",
        className,
      )}
    >
      {eyebrow || heading || lede ? (
        <header className="max-w-2xl">
          {eyebrow ? <Eyebrow className="mb-4">{eyebrow}</Eyebrow> : null}
          {heading ? (
            <SectionHead className={headingClassName}>{heading}</SectionHead>
          ) : null}
          {lede ? (
            <p className="mt-4 text-lg leading-relaxed text-ink-soft">{lede}</p>
          ) : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
