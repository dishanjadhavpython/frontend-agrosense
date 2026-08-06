import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The display register. Three sizes, one family, driven by Anek's width axis.
 *
 * `statement` is deliberately rare — the hero and the closing band, and
 * nowhere else. Spending boldness in two places is what makes those two land.
 */

type TypeProps = {
  as?: ElementType;
  className?: string;
  children: ReactNode;
};

/**
 * Statement additionally forwards plain element attributes — `lang` above all,
 * because that is what decides whether the width axis compresses (see the
 * :lang(mr) rule in globals.css).
 */
type StatementProps = TypeProps &
  Omit<HTMLAttributes<HTMLElement>, "className" | "children">;

export function Statement({
  as: Tag = "h1",
  className,
  children,
  ...rest
}: StatementProps) {
  return (
    <Tag className={cn("statement text-ink", className)} {...rest}>
      {children}
    </Tag>
  );
}

/**
 * `tone="output"` marks the three sections that are the model's answers —
 * soil, crop, fertilizer. It is structure carrying meaning rather than
 * decoration: green here means "this is what you get back", and nothing else
 * on the page is allowed to borrow it.
 *
 * One class covers both themes, because `leaf` already flips — a deep
 * standing-crop green on paper (5.4:1) and new-growth lime in the dark
 * (12.9:1). Both clear AA for display sizes with room to spare.
 */
export function SectionHead({
  as: Tag = "h2",
  tone = "default",
  className,
  children,
}: TypeProps & { tone?: "default" | "output" }) {
  return (
    <Tag
      className={cn(
        "section-head",
        tone === "output" ? "text-leaf" : "text-ink",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function Eyebrow({ as: Tag = "p", className, children }: TypeProps) {
  return (
    <Tag className={cn("eyebrow text-ink-mute", className)}>{children}</Tag>
  );
}

/**
 * The highlighter. Haldi behind ink — 6.7:1, and the way a real marker works.
 * `<mark>` is the honest element: this is text singled out for reference.
 */
export function Marked({ className, children }: Omit<TypeProps, "as">) {
  return <mark className={cn("marked bg-transparent", className)}>{children}</mark>;
}

/**
 * A measured value. Mono, tabular, so columns of readings line up.
 * Every number that came off an instrument goes through here.
 */
export function Value({
  className,
  children,
}: Omit<TypeProps, "as">) {
  return <span className={cn("tnum", className)}>{children}</span>;
}
