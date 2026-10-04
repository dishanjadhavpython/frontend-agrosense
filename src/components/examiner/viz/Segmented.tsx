"use client";

import { cn } from "@/lib/cn";

/**
 * The in-card toggle both references carry — `Σ / %`, `Monthly ⌄`, `Daily ⌄`.
 *
 * The only interactive control in this section, and it is held to one rule:
 * **every state it can reach must also be readable without touching it.** An
 * examiner reading a printed copy, or a screen-reader user, gets the default
 * view plus the caption; the toggle is a convenience for the person presenting,
 * never the only route to a number.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="no-print inline-flex items-center rounded-full border border-line bg-paper p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "min-h-8 rounded-full px-3 font-mono text-[12px] transition-colors",
            value === o.value
              ? "bg-ink text-paper dark:bg-line dark:text-ink"
              : "text-ink-mute hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
