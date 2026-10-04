"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { CHAPTERS } from "@/data/examiner/chapters";

/**
 * Chapter navigation: one scrolling row of pills.
 *
 * A client component rather than markup in the layout, because layouts do not
 * re-render on navigation and therefore cannot read the pathname — Next says so
 * directly in `file-conventions/layout.md`. Computing the active chapter up
 * there would give a highlight that is correct exactly once, on first load.
 *
 * It was a left column until the owner's reference dashboards settled it: both
 * put navigation in a rounded pill row at the top, and moving it there gives
 * the bento grid the full width, which a twelve-column layout needs more than a
 * persistent rail is worth. Twelve chapters do not fit across a laptop, so the
 * row scrolls and fades at the right edge rather than wrapping — a wrapped
 * two-line pill bar reads as a toolbar, not as a contents list.
 */
export function ChapterNav() {
  const pathname = usePathname();

  return (
    <div className="no-print relative sticky top-0 z-30 w-full border-b border-line bg-paper/90 backdrop-blur-md">
      <nav
        aria-label="Chapters"
        className="hide-scrollbar w-full overflow-x-auto"
      >
        <ul className="mx-auto flex w-max items-center gap-1.5 px-5 py-2.5 md:px-8">
          {CHAPTERS.map((c) => {
            const active = pathname === c.href;
            return (
              <li key={c.href}>
                <Link
                  href={c.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-[14px] whitespace-nowrap transition-colors",
                    active
                      ? "bg-ink font-semibold text-paper dark:bg-line dark:text-ink"
                      : "border border-line text-ink-mute hover:border-line-strong hover:text-ink",
                  )}
                >
                  <span
                    className={cn(
                      "font-mono text-[11px] tabular-nums",
                      active ? "opacity-70" : "text-ink-mute",
                    )}
                  >
                    {c.n ?? "·"}
                  </span>
                  {c.short}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {/* Twelve chapters and about six fit. Without this the row looks like a
          complete list that happens to end at "Tournaments". */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-paper to-transparent"
      />
    </div>
  );
}
