import type { Metadata } from "next";
import Link from "next/link";
import { ChapterNav } from "@/components/examiner/Rail";
import { ViewSwitch } from "@/components/examiner/ViewSwitch";
import { ThemeToggle } from "@/components/site/ThemeToggle";
import { Logo } from "@/components/site/Logo";
import { BuiltMark } from "@/components/examiner/BuiltMark";

/**
 * The examiner walkthrough.
 *
 * A plain segment rather than a route group: `(examiner)/page.tsx` and
 * `(site)/page.tsx` would both resolve to `/` and error — the "Conflicting
 * paths" caveat in `file-conventions/route-groups.md`. It is also deliberately
 * NOT a second root layout; `(site)/layout.tsx` records why, and the reason
 * applies twice over here, since crossing between the two halves is the one
 * thing this section exists to make cheap.
 *
 * Nested under the root layout, it inherits the fonts, the pre-paint theme
 * script, Clerk and the language provider for free, and inherits nothing from
 * `(site)` — no header, no footer, no CardProvider. The walkthrough carries no
 * card and needs none of them.
 *
 * Should anyone later add `src/app/(site)/examiner/page.tsx`, it resolves to
 * this same URL and the build fails. Put it here or nowhere.
 */

export const metadata: Metadata = {
  title: {
    default: "How this system is built",
    template: "%s · How this system is built",
  },
  description:
    "A chaptered walkthrough of the AgroSense system: its data, models, agents and deployment, with the measurements behind each decision.",
  // Internal paths, dataset locations and honest write-ups of where the models
  // are weak. Public so an examiner can open it without an account; not indexed,
  // because being readable and being advertised are different things.
  robots: { index: false, follow: false },
};

export default function ExaminerLayout({ children }: LayoutProps<"/examiner">) {
  return (
    <div className="examiner-skin flex min-h-full flex-col bg-paper text-ink">
      {/* Arrowhead markers, defined once for every diagram in the section.
          SVG markers are document-scoped, so per-diagram <defs> would collide
          on ids and push whoever hits that toward random ones — which is a
          hydration mismatch waiting to happen. */}
      <svg aria-hidden className="pointer-events-none absolute size-0">
        <defs>
          <marker
            id="ex-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0,1 L9,5 L0,9 z" fill="var(--color-ink-mute)" />
          </marker>
          <marker
            id="ex-arrow-gold"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0,1 L9,5 L0,9 z" fill="var(--color-gold)" />
          </marker>
          <marker
            id="ex-arrow-clay"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0,1 L9,5 L0,9 z" fill="var(--color-clay)" />
          </marker>
        </defs>
      </svg>

      <a
        href="#main"
        className="sr-only rounded-full bg-ink text-paper focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-100 focus:px-6 focus:py-4"
      >
        Skip to content
      </a>

      {/* The brand line lives here rather than in `Chapter`, because it belongs
          on every page in the section and this is the one file all twelve of
          them pass through. The wordmark drops below `sm` and the plaque does
          not: at 390px the mark, the plaque and the theme toggle still fit
          across, and the line the owner asked for is on the narrow rendering
          too rather than being the first thing a breakpoint throws away. */}
      <header className="no-print border-b border-line">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-5 md:px-8">
          <Link
            href="/examiner"
            className="flex shrink-0 items-center gap-2.5 text-ink"
            aria-label="How this system is built — contents"
          >
            <Logo />
            <span className="hidden font-serif text-[17px] sm:block">
              AgroSense
            </span>
          </Link>
          <BuiltMark />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <ChapterNav />

      <main
        id="main"
        className="mx-auto w-full max-w-[1600px] flex-1 px-5 md:px-8"
      >
        {children}
      </main>

      <ViewSwitch />
    </div>
  );
}
