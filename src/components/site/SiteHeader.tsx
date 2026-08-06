"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { useActiveSection } from "@/lib/useActiveSection";
import { cn } from "@/lib/cn";
import { ButtonLink } from "@/components/ui/Button";
import { LanguageToggle } from "./LanguageToggle";
import { ThemeToggle } from "./ThemeToggle";
import { Logo } from "./Logo";

const SECTIONS = [
  "upload",
  "soils",
  "crops",
  "fertilizers",
  "weather",
  "prediction",
  "proof",
] as const;

export function SiteHeader() {
  const { t, lang } = useLang();
  const active = useActiveSection(SECTIONS);
  const [open, setOpen] = useState(false);

  const nav = [
    { id: "upload", label: t("secUpload") },
    { id: "soils", label: lang === "mr" ? "माती" : "Soil" },
    { id: "crops", label: lang === "mr" ? "पिकं" : "Crops" },
    { id: "fertilizers", label: lang === "mr" ? "खतं" : "Fertilizer" },
    { id: "weather", label: t("weather") },
    { id: "prediction", label: lang === "mr" ? "अंदाज" : "Prediction" },
    { id: "proof", label: lang === "mr" ? "शेतकरी काय म्हणतात" : "Farmers" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-5 md:px-8">
        <Link
          href="/"
          className="flex min-h-12 shrink-0 items-center gap-2.5 text-leaf-deep"
        >
          <Logo />
          {/* Same treatment as the hero wordmark — the glow is in em, so at
              17px it reads as a lit edge rather than a bloom. */}
          <span className="wordmark text-leaf text-[17px] font-semibold tracking-tight">
            {t("appName")}
          </span>
        </Link>

        <nav className="ml-6 hidden items-center gap-1 lg:flex">
          {nav.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={cn(
                "flex min-h-12 items-center rounded-md px-3 text-[15px] transition-colors",
                // The highlighter marks where you are — the one place the
                // accent earns a permanent home outside the hero.
                active === item.id
                  ? "marked font-semibold"
                  : "text-ink-soft hover:text-ink",
              )}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <LanguageToggle className="hidden sm:inline-flex" />
          <ThemeToggle />
          <ButtonLink
            href="/dashboard"
            variant="primary"
            className="hidden px-5 sm:inline-flex"
          >
            {t("actGetStarted")}
          </ButtonLink>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={lang === "mr" ? "मेनू" : "Menu"}
            className="grid size-12 place-items-center rounded-full text-ink lg:hidden"
          >
            {open ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>
      </div>

      {open ? (
        <div
          id="site-menu"
          className="border-t border-line bg-paper px-5 pb-6 pt-4 lg:hidden"
        >
          <nav className="flex flex-col">
            {nav.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={() => setOpen(false)}
                className="flex min-h-12 items-center border-b border-line/60 text-[17px] text-ink"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <LanguageToggle />
            <ButtonLink href="/dashboard" variant="primary" className="flex-1">
              {t("actGetStarted")}
            </ButtonLink>
          </div>
        </div>
      ) : null}
    </header>
  );
}
