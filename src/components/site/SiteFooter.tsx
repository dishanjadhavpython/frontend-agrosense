"use client";

import Image from "next/image";
import Link from "next/link";
import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/assets";
import { ButtonLink } from "@/components/ui/Button";
import { Statement } from "@/components/ui/Type";
import { Logo } from "./Logo";

/**
 * Link columns on paper, then the one dark band — the page's single moment of
 * emphasis, and the last thing you see (PLAN.md §2, §6).
 */
export function SiteFooter() {
  const { t, lang } = useLang();
  const mr = lang === "mr";

  const columns = [
    {
      heading: mr ? "उत्पादन" : "Product",
      links: [
        { label: t("navDashboard"), href: "/dashboard" },
        { label: t("navSoilScan"), href: "/soil" },
        { label: t("navMarket"), href: "/market" },
        { label: t("navReports"), href: "/reports" },
      ],
    },
    {
      heading: mr ? "मदत" : "Help",
      links: [
        { label: t("secFaq"), href: "/support" },
        { label: t("secGlossary"), href: "/support#glossary" },
        { label: t("secSchemes"), href: "/schemes" },
        { label: mr ? "संपर्क" : "Contact", href: "/support#contact" },
      ],
    },
    {
      heading: mr ? "संस्था" : "Company",
      links: [
        { label: mr ? "आमच्याबद्दल" : "About", href: "/about" },
        { label: mr ? "गोपनीयता" : "Privacy", href: "/privacy" },
        { label: mr ? "अटी व शर्ती" : "Terms", href: "/terms" },
      ],
    },
  ];

  return (
    <footer className="mt-24">
      <div className="mx-auto max-w-7xl px-5 pb-14 md:px-8">
        <div className="grid gap-10 border-t border-line pt-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <div className="flex items-center gap-2.5 text-leaf-deep">
              <Logo />
              <span className="wordmark text-leaf text-[17px] font-semibold tracking-tight">
                {t("appName")}
              </span>
            </div>
            <p className="mt-3 max-w-xs text-ink-mute">{t("tagline")}</p>
            {/* Not mono: Plex Mono has no Devanagari and falls back mid-line. */}
            <p className="mt-4 text-[14px] text-ink-mute">
              सोमवार – शनिवार · सकाळी ९ – संध्याकाळी ६
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.heading}>
              <h3 className="eyebrow mb-4 text-ink-mute">{col.heading}</h3>
              <ul>
                {col.links.map((link) => (
                  <li key={link.label}>
                    {/* Footer links were 25px tall — the one place in the
                        product that missed the tap-target rule. */}
                    <Link
                      href={link.href}
                      className="flex min-h-11 items-center text-ink-soft transition-colors hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <CloseBand />

      {/* Runs on under the band. In dark the band is lime, so this returns to
          the page ground rather than sitting as a second, competing dark. */}
      <div className="bg-night px-5 pb-8 text-center md:px-8 dark:bg-paper dark:pt-8">
        <p className="text-[13px] text-mist/60 dark:text-ink-mute">
          © 2026 {t("appName")} · महाराष्ट्र
        </p>
      </div>
    </footer>
  );
}

/**
 * The dark band. Full-bleed dawn field, statement type, one action.
 * On paper this is the only place the public site goes dark.
 *
 * In dark mode it can't be — a dark band on a dark page is no band at all.
 * So it inverts completely: the photograph and its scrim drop away and the
 * whole block becomes solid lime with near-black type. The emphasis survives
 * by flipping polarity rather than by getting darker, and the page still ends
 * on one loud note.
 *
 * All of it is CSS off `data-theme`, never a branch in the markup — the
 * server has no idea which theme is coming, and swapping structure on
 * something it can't see is how hydration breaks.
 */
function CloseBand() {
  const { t, lang } = useLang();
  const mr = lang === "mr";
  const src = photo("close/dawn-field.jpg");

  return (
    <section className="relative isolate overflow-hidden bg-night dark:bg-leaf-5">
      {src ? (
        <Image
          src={src}
          alt=""
          fill
          sizes="100vw"
          className="object-cover opacity-45 dark:hidden"
          aria-hidden
        />
      ) : (
        // Stands in for the dawn field until it lands: the sky gradient
        // already in the token set, laid under the same scrim.
        <div
          className="absolute inset-0 sky-dawn opacity-40 dark:hidden"
          aria-hidden
        />
      )}
      {/* Keeps the type legible whatever the photograph turns out to be. */}
      <div
        className="absolute inset-0 dark:hidden"
        style={{
          background:
            "linear-gradient(180deg, rgba(7,12,9,.86) 0%, rgba(7,12,9,.55) 45%, rgba(7,12,9,.9) 100%)",
        }}
        aria-hidden
      />
      {/* Ploughed rows, so the lime block reads as a field and not a swatch.
          The furrow colour is forced back to dark here — the block is a lit
          surface, and furrows on a lit surface are shadows. */}
      <div
        className="absolute inset-0 hidden field-rows dark:block"
        style={
          {
            "--field-row-line": "rgba(20,32,26,.20)",
            "--field-row-pitch": "58px",
          } as React.CSSProperties
        }
        aria-hidden
      />

      <div className="relative mx-auto max-w-5xl px-5 py-24 text-center md:px-8 md:py-32">
        <Statement as="p" className="text-chalk dark:text-on-light">
          {mr ? "आजच सुरुवात करा." : "Start with your soil."}
        </Statement>
        <p className="mx-auto mt-5 max-w-lg text-lg text-mist dark:text-on-light/80">
          {mr
            ? "तुमची माती आरोग्य पत्रिका द्या. पुढचं आम्ही सांगू."
            : "Share your Soil Health Card. We'll take it from there."}
        </p>
        <ButtonLink
          href="/soil"
          variant="onNight"
          className="mt-8 px-7 dark:bg-on-light dark:text-leaf-5 dark:hover:bg-on-light-soft"
        >
          {t("actTestSoil")}
        </ButtonLink>
      </div>
    </section>
  );
}
