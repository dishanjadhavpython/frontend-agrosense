import type { ReactNode } from "react";
import type { Tone } from "@/data/examiner/types";
import { cn } from "@/lib/cn";
import { TONE } from "./geom";

/**
 * A limitation, a negative result, or a number that does not flatter the
 * project. Given a box of its own because burying them in prose is what makes a
 * reader distrust the rest — and because most of these were the most expensive
 * things the project learned.
 */
export function Honest({
  title = "Worth stating plainly",
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <aside className="print-block rounded-[var(--radius-card)] border-l-2 border-clay bg-sunk px-5 py-4">
      <p className="ex-num" style={{ color: "var(--color-clay)" }}>
        {title}
      </p>
      <div className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
        {children}
      </div>
    </aside>
  );
}

/**
 * A titled run of the chapter: a heading and lede, then a grid of cards.
 *
 * The heading is capped to a reading measure while the grid below it runs the
 * full width — prose and panels want different measures, and letting a lede
 * stretch to 1500px to match the cards under it is the quickest way to make a
 * dashboard unreadable.
 */
export function Block({
  title,
  lede,
  children,
}: {
  title: string;
  lede?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-6">
      <header className="max-w-2xl">
        <h2 className="ex-head">{title}</h2>
        {lede ? <p className="ex-lede mt-3 text-[1.0625rem]">{lede}</p> : null}
      </header>
      {children}
    </section>
  );
}

/**
 * Points, not paragraphs.
 *
 * The walkthrough is read standing up, in a viva, by someone scanning for the
 * number that answers the question they just asked. It had grown to sixteen
 * thousand words, and a figure whose argument is three clauses deep into a
 * paragraph is a figure the examiner reads past.
 *
 * So the rule the section now holds itself to: a card says its point in a
 * sentence and then lists. Each item is one claim, short enough to take in
 * without tracking back to the start of the line. This exists so that shape is
 * one component rather than forty ad-hoc lists that drift apart.
 *
 * The marker is a small rule rather than a bullet glyph: a disc at this size
 * prints as a smudge, and the rule aligns with the hairlines everywhere else
 * in the section.
 */
export function Points({
  items,
  tone,
  className,
}: {
  items: readonly ReactNode[];
  /** Colours the markers where the list is all of one kind — costs, say. */
  tone?: Tone;
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-col gap-1.5", className)}>
      {items.map((item, i) => (
        <li
          key={i}
          className="flex gap-2.5 text-[14px] leading-snug text-ink-soft"
        >
          <span
            aria-hidden
            className="mt-[9px] h-px w-2.5 shrink-0"
            style={{
              background: tone ? TONE[tone] : "var(--color-line-strong)",
            }}
          />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}
