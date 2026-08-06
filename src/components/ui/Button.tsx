import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Every tap target clears 48px. Non-negotiable for this audience — outdoors,
 * one-handed, often on a cracked screen.
 */
const base =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 " +
  "text-[15px] font-semibold transition-colors duration-200 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2";

const variants = {
  /**
   * The one real action on a screen. On paper it is the darkest thing there;
   * in the dark it is the brightest, and it takes the lime rather than
   * simply inverting to a white slab — the green is what the product is.
   */
  primary:
    "bg-ink text-paper hover:bg-leaf-deep focus-visible:outline-leaf " +
    "dark:bg-leaf-5 dark:text-on-light dark:hover:bg-leaf-deep",
  /** Sits beside primary. Reads as available, not urgent. */
  secondary:
    "border border-line bg-surface text-ink hover:bg-leaf-wash focus-visible:outline-leaf",
  /**
   * On a dark ground — a night panel, or a photograph. `text-on-light`, not
   * `text-ink`: the chalk fill doesn't flip, so the type on it can't either.
   */
  onNight:
    "bg-chalk text-on-light hover:bg-haldi focus-visible:outline-chalk",
  /** Second action on a dark ground — sits beside `onNight` without competing. */
  onNightQuiet:
    "border border-chalk/45 text-chalk hover:bg-chalk/12 focus-visible:outline-chalk",
  /** Text with an arrow. For the quieter of two choices. */
  quiet:
    "px-0 text-ink-soft hover:text-ink underline-offset-4 hover:underline focus-visible:outline-leaf",
} as const;

type Variant = keyof typeof variants;

export function Button({
  variant = "primary",
  className,
  children,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; children: ReactNode }) {
  return (
    <button className={cn(base, variants[variant], className)} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; children: ReactNode }) {
  return (
    <Link className={cn(base, variants[variant], className)} {...props}>
      {children}
    </Link>
  );
}
