import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { chapterAt, neighbours } from "@/data/examiner/chapters";

/**
 * One place owns chapter rhythm.
 *
 * `ui/Section.tsx` makes the same argument for the product and gives the reason:
 * padding set per-page drifts and then fights itself across files. The same is
 * true of a chapter head, and more so here, because there are twelve of them
 * and an examiner reads them back to back — a title that sits four pixels lower
 * on chapter seven is exactly the kind of thing that reads as unfinished.
 *
 * Deliberately not `<Section>` itself: that applies `.defer-paint`
 * (`content-visibility: auto`) by default, which skips off-screen content when
 * the page is printed, and a printed copy of this walkthrough is a likely
 * outcome of the viva.
 */
export function Chapter({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const chapter = chapterAt(href);
  if (!chapter) throw new Error(`No chapter registered for ${href}`);
  const { prev, next } = neighbours(href);

  // The article runs full width now that the body is a bento grid — the cards
  // set their own measure. Only the chapter head is capped, because a title and
  // a lede still have to read as prose.
  return (
    <article className="py-8 md:py-12">
      <header className="max-w-3xl">
        {chapter.n !== null ? (
          <p className="ex-num">Chapter {chapter.n}</p>
        ) : null}
        <h1 className="ex-title mt-3">{chapter.title}</h1>
        <p className="ex-lede mt-5 max-w-2xl">{chapter.lede}</p>
      </header>

      <div className="mt-10 flex flex-col gap-12 md:mt-12">{children}</div>

      {prev || next ? (
        <nav
          aria-label="Chapter navigation"
          className="no-print mt-20 grid gap-3 border-t border-line pt-8 sm:grid-cols-2"
        >
          {prev ? (
            <Link
              href={prev.href}
              className="group flex min-h-16 flex-col justify-center rounded-[var(--radius-card)] border border-line px-5 py-3 transition-colors hover:border-line-strong"
            >
              <span className="ex-source flex items-center gap-1.5">
                <ArrowLeft className="size-3.5" aria-hidden />
                Previous
              </span>
              <span className="mt-1 text-[15px] font-semibold text-ink">
                {prev.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={next.href}
              className="group flex min-h-16 flex-col justify-center rounded-[var(--radius-card)] border border-line px-5 py-3 transition-colors hover:border-line-strong sm:items-end sm:text-right"
            >
              <span className="ex-source flex items-center gap-1.5">
                Next
                <ArrowRight className="size-3.5" aria-hidden />
              </span>
              <span className="mt-1 text-[15px] font-semibold text-ink">
                {next.title}
              </span>
            </Link>
          ) : null}
        </nav>
      ) : null}
    </article>
  );
}

/**
 * A chapter that has its route, its title and its place in the running order,
 * but not yet its content. Phase 0 ships twelve of these on purpose: it proves
 * routing, auth, the rail, the skin and the corner switch before a single
 * figure is drawn, so that when a figure *is* wrong there is only one new thing
 * it could be.
 */
export function Pending({ note }: { note: string }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-dashed border-line-strong bg-sunk px-6 py-10">
      <p className="ex-num">Not yet written</p>
      <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-soft">
        {note}
      </p>
    </section>
  );
}
