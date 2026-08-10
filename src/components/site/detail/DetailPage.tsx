"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { Bi, Fact } from "@/data/prediction";

/**
 * The shape every prediction detail page takes.
 *
 * Crops, soils and fertilizers are different subjects, but the questions a
 * farmer brings to them are the same three in the same order: what is it, why
 * did you pick it for my field, and what do I do about it. So they share one
 * layout and differ only in what they pour into it — which also means the back
 * link, the notice, the type scale and the photographic header cannot drift
 * apart between the three.
 *
 * Two things changed once the research agents started filling the last section
 * with dated, sourced, current information:
 *
 *   * Sections are announced by a real heading rather than a 12px eyebrow. Five
 *     stacked blocks that all opened with the same tiny grey label gave a
 *     farmer nothing to scan for; the page read as one long column of text.
 *   * The caveat moved to the top. It used to sit below everything, including
 *     below the live report — the last word on the page was a warning about
 *     content the reader had already finished acting on.
 */

export type DetailLink = { href: string; lead: string; sub: string };

export function DetailPage({
  eyebrow,
  title,
  subtitle,
  photoSrc,
  photoAlt,
  badges,
  why,
  facts,
  notes,
  links,
  linksTitle,
  insights,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  photoSrc?: string;
  photoAlt: string;
  badges: ReactNode;
  why: Bi;
  facts: Fact[];
  notes: Bi[];
  links?: DetailLink[];
  linksTitle?: string;
  /** The research section, when the page has a topic to show one for. */
  insights?: ReactNode;
}) {
  const { lang } = useLang();
  const mr = lang === "mr";

  return (
    <article className="mx-auto max-w-5xl px-5 py-10 md:px-8 md:py-14">
      <Link
        href="/#prediction"
        className="inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold text-ink-soft transition-colors hover:text-leaf"
      >
        <ArrowLeft className="size-4" strokeWidth={2} aria-hidden />
        {mr ? "अंदाजाकडे परत" : "Back to the prediction"}
      </Link>

      {/* ---- The header. Photograph, then the name over paper — not over the
              photograph, because these names run long in Devanagari and a
              scrim deep enough to hold them would have hidden the subject. */}
      <header className="mt-6">
        <div
          className="relative aspect-[16/7] overflow-hidden rounded-[var(--radius-photo)] bg-leaf-wash"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          {photoSrc ? (
            <Image
              src={photoSrc}
              alt={photoAlt}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 900px"
              className="object-cover"
            />
          ) : (
            <div
              className="field-rows absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(160deg, var(--color-leaf-4) 0%, var(--color-leaf-5) 100%)",
              }}
              aria-hidden
            />
          )}
        </div>

        <p className="eyebrow mt-7 text-ink-mute">{eyebrow}</p>
        <h1 className="section-head mt-3 text-ink">{title}</h1>
        <p className="mt-1.5 text-lg text-ink-mute">{subtitle}</p>

        <div className="mt-5 flex flex-wrap items-center gap-2">{badges}</div>

        {/* A caveat belongs before the thing it qualifies. At the foot of the
            page it was a footnote to a decision already made. */}
        <p
          role="status"
          className="mt-6 rounded-[var(--radius-card)] border border-haldi/50 bg-haldi-wash px-4 py-3 text-[14px] leading-relaxed text-haldi-ink"
        >
          <strong className="font-semibold">
            {mr ? "नमुना आकडे. " : "Sample figures. "}
          </strong>
          {mr
            ? "या पानावरचे आकडे नमुन्याचे आहेत, तुमच्या शेताचे नाहीत. खालची ताजी माहिती मात्र खरी आणि आजची आहे."
            : "The figures on this page are a worked example, not a reading of your field. The latest updates below are real and current."}
        </p>

        {/* The one piece of the page that changed this morning is also the one
            piece furthest from the top. This closes that distance without
            reordering the page: checked, written content still leads. */}
        {insights ? (
          <a
            href="#updates"
            className="mt-4 inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold text-leaf underline decoration-leaf/35 underline-offset-4 transition-colors hover:decoration-leaf"
          >
            {mr ? "ताजी माहिती बघा" : "See the latest updates"}
            <ArrowDown className="size-4" strokeWidth={2.2} aria-hidden />
          </a>
        ) : null}
      </header>

      {/* ---- Why this, for this field. The question the other two sections
              cannot answer, and the only reason this page exists rather than
              an encyclopedia entry. */}
      <section className="mt-12 rounded-[var(--radius-card)] border-l-4 border-leaf bg-leaf-1/60 py-6 pr-6 pl-7">
        <p className="eyebrow text-ink-mute">
          {mr ? "तुमच्या शेतासाठी का" : "Why this, for your field"}
        </p>
        <p className="mt-3 text-[1.15rem] leading-relaxed text-ink-soft">
          {mr ? why.mr : why.en}
        </p>
      </section>

      {/* ---- The figures. */}
      <Section title={mr ? "थोडक्यात" : "At a glance"}>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {facts.map((f) => (
            <div
              key={f.label.en}
              className="rounded-[var(--radius-card)] border border-line bg-surface p-5"
            >
              <dt className="text-[13px] leading-tight text-ink-mute">
                {mr ? f.label.mr : f.label.en}
              </dt>
              <dd className="mt-2 text-[1.1rem] leading-snug font-semibold text-ink">
                {mr ? f.value.mr : f.value.en}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      {/* ---- The prose. Set in the document face: this is the part that
              should read like something printed and kept, not like UI. */}
      <Section title={mr ? "काय लक्षात ठेवायचं" : "What to keep in mind"}>
        <div className="space-y-5">
          {notes.map((n, i) => (
            <p
              key={i}
              className={cn(
                "max-w-2xl text-[1.08rem] leading-relaxed text-ink-soft",
                !mr && "font-[family-name:var(--font-doc)]",
              )}
            >
              {mr ? n.mr : n.en}
            </p>
          ))}
        </div>
      </Section>

      {links && links.length > 0 ? (
        <Section title={linksTitle ?? ""}>
          <ul className="grid gap-3 sm:grid-cols-2">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="group flex min-h-16 items-center justify-between gap-4 rounded-[var(--radius-card)] border border-line bg-surface px-5 py-4 transition-colors hover:border-leaf/45 hover:bg-leaf-wash"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink">
                      {l.lead}
                    </span>
                    <span className="block truncate text-[14px] text-ink-mute">
                      {l.sub}
                    </span>
                  </span>
                  <ArrowRight
                    className="size-5 shrink-0 text-leaf transition-transform duration-300 group-hover:translate-x-1"
                    strokeWidth={2}
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {insights}
    </article>
  );
}

/**
 * One band of the page.
 *
 * The heading is set in the display face at a size a farmer can find while
 * scrolling with one thumb — the eyebrow this replaces was 12px, uppercase and
 * grey, which is a label for a field, not a heading for a section. The rule
 * above it does the separating, so the sections need no boxes of their own.
 */
function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-14 border-t border-line pt-8">
      <h2 className="text-[1.3rem] leading-tight font-semibold text-ink font-[family-name:var(--font-display)]">
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** The one badge shape all three pages use. */
export function Badge({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1.5 text-[14px] font-semibold",
        className ?? "bg-leaf-wash text-leaf-deep",
      )}
    >
      {children}
    </span>
  );
}
