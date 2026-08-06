"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
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
      </header>

      {/* ---- Why this, for this field. The question the other two sections
              cannot answer, and the only reason this page exists rather than
              an encyclopedia entry. */}
      <section className="mt-10 rounded-[var(--radius-card)] border-l-4 border-leaf bg-leaf-1/60 py-5 pr-5 pl-6">
        <p className="eyebrow text-ink-mute">
          {mr ? "तुमच्या शेतासाठी का" : "Why this, for your field"}
        </p>
        <p className="mt-3 text-lg leading-relaxed text-ink-soft">
          {mr ? why.mr : why.en}
        </p>
      </section>

      {/* ---- The figures. */}
      <section className="mt-10">
        <h2 className="eyebrow text-ink-mute">
          {mr ? "थोडक्यात" : "At a glance"}
        </h2>
        <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {facts.map((f) => (
            <div
              key={f.label.en}
              className="rounded-[var(--radius-card)] border border-line bg-surface p-4"
            >
              <dt className="text-[13px] leading-tight text-ink-mute">
                {mr ? f.label.mr : f.label.en}
              </dt>
              <dd className="mt-1.5 text-[1.05rem] leading-snug font-semibold text-ink">
                {mr ? f.value.mr : f.value.en}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---- The prose. Set in the document face: this is the part that
              should read like something printed and kept, not like UI. */}
      <section className="mt-10 space-y-5">
        <h2 className="eyebrow text-ink-mute">
          {mr ? "काय लक्षात ठेवायचं" : "What to keep in mind"}
        </h2>
        {notes.map((n, i) => (
          <p
            key={i}
            className={cn(
              "max-w-2xl text-[1.05rem] leading-relaxed text-ink-soft",
              !mr && "font-[family-name:var(--font-doc)]",
            )}
          >
            {mr ? n.mr : n.en}
          </p>
        ))}
      </section>

      {links && links.length > 0 ? (
        <section className="mt-12 border-t border-line pt-8">
          <h2 className="eyebrow text-ink-mute">{linksTitle}</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="group flex items-center justify-between gap-4 rounded-[var(--radius-card)] border border-line bg-surface px-5 py-4 transition-colors hover:border-leaf/45 hover:bg-leaf-wash"
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
        </section>
      ) : null}

      <p
        role="status"
        className="mt-12 rounded-[var(--radius-card)] border border-haldi/50 bg-haldi-wash px-4 py-3 text-[14px] leading-relaxed text-haldi-ink"
      >
        <strong className="font-semibold">
          {mr ? "नमुना अंदाज. " : "Sample prediction. "}
        </strong>
        {mr
          ? "मॉडेल अजून जोडलेलं नाही — हा निकाल नमुन्याचा आहे, तुमच्या शेताचा नाही."
          : "The models aren't wired up yet — this is a worked example, not a reading of your field."}
      </p>
    </article>
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
