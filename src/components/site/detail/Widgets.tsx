"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The widget shell every "at a glance" block on a detail page shares.
 *
 * The brief for these pages was: separated by topic, in proper widgets,
 * rather than a lot of information dumped in one column. So a block is a
 * bordered card with a titled head and nothing else structural — the variety
 * comes from what is inside, not from each section inventing its own frame.
 *
 * `span` lets a widget claim the full width of the grid when its content is
 * wide (a twelve-month calendar) rather than being squeezed into a column.
 */
export function Widget({
  title,
  note,
  icon,
  tint,
  span,
  children,
}: {
  title: string;
  note?: string;
  icon?: ReactNode;
  /** The provenance colour. See the header of `Insights.tsx` for the rules. */
  tint?: string;
  span?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-card)] border border-line bg-surface p-5",
        span && "sm:col-span-2",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="flex items-center gap-2.5 text-[1.02rem] font-semibold text-ink font-[family-name:var(--font-display)]">
          {icon ? (
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-[10px]",
                tint ?? "bg-leaf-wash text-leaf",
              )}
            >
              {icon}
            </span>
          ) : null}
          {title}
        </h3>
        {note ? <p className="text-[13px] text-ink-mute">{note}</p> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** The grid the widgets sit in. One column on a phone, two from `sm`. */
export function WidgetGrid({ children }: { children: ReactNode }) {
  return <div className="mt-6 grid gap-4 sm:grid-cols-2">{children}</div>;
}

/**
 * A one-to-five dot meter — water need, and nothing else so far.
 *
 * Dots rather than a bar because the underlying number is a rank, not a
 * measurement: "4 out of 5" is a comparison between crops, and a continuous
 * bar would imply a precision (63% of what?) that does not exist.
 */
export function DotMeter({ value, max = 5, label }: { value: number; max?: number; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex gap-1" role="img" aria-label={`${value} of ${max}`}>
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            className={cn(
              "size-2.5 rounded-full",
              i < value ? "bg-jal" : "bg-line",
            )}
            aria-hidden
          />
        ))}
      </span>
      <span className="text-[14px] text-ink-soft">{label}</span>
    </div>
  );
}

/** A labelled figure, for the small stat widgets. */
export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="tnum text-[1.5rem] leading-none font-semibold text-ink">{value}</p>
      <p className="mt-1.5 text-[13px] text-ink-mute">{label}</p>
    </div>
  );
}

/** A row of chips — crop names, states, anything countable and short. */
export function Chips({
  items,
  tint,
}: {
  items: string[];
  tint?: string;
}) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li
          key={item}
          className={cn(
            "rounded-full px-3 py-1.5 text-[13.5px] font-medium",
            tint ?? "bg-surface text-ink-soft ring-1 ring-line",
          )}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}
