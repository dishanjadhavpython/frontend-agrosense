"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { useActiveSection } from "@/lib/useActiveSection";
import { cn } from "@/lib/cn";
import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import { ButtonLink } from "@/components/ui/Button";
import { clerkAppearance } from "@/lib/clerkAppearance";
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
  const { isLoaded, isSignedIn } = useAuth();
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
          {/* Signed out, the primary action is to sign in — not "get started",
              which pointed at /dashboard, a route that does not exist. Signed
              in, it becomes the avatar, which is also the way out.

              `<SignedIn>` / `<SignedOut>` are gone in Clerk 7 and their
              replacement, `<Show>`, is an async server component — unusable in
              this file, which is `"use client"` because the whole site renders
              bilingually through `useLang()`. The hook is the client-side
              equivalent. */}
          {!isLoaded ? (
            // A reserved box, not a spinner and not nothing. Clerk resolves in
            // a few hundred milliseconds and either branch would otherwise
            // shift the whole header sideways as it lands.
            <span className="hidden h-12 w-[7.5rem] sm:block" aria-hidden />
          ) : isSignedIn ? (
            <UserButton
              appearance={{
                ...clerkAppearance,
                elements: {
                  ...clerkAppearance.elements,
                  // Clerk's default avatar is 28px. Every tap target on this
                  // site clears 44, and this one opens the only menu that can
                  // sign somebody out.
                  avatarBox: "size-11",
                },
              }}
            />
          ) : (
            <SignInButton mode="modal">
              <button
                type="button"
                className="hidden min-h-12 items-center justify-center rounded-full bg-ink px-5 text-[15px] font-semibold text-paper transition-colors duration-200 hover:bg-leaf-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf sm:inline-flex dark:bg-leaf-5 dark:text-on-light dark:hover:bg-leaf-deep"
              >
                {t("actSignIn")}
              </button>
            </SignInButton>
          )}
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
            {isSignedIn ? (
              <ButtonLink href="/#upload" variant="primary" className="flex-1">
                {t("actTestSoil")}
              </ButtonLink>
            ) : (
              <SignInButton mode="modal">
                <button
                  type="button"
                  className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full bg-ink px-6 text-[15px] font-semibold text-paper hover:bg-leaf-deep dark:bg-leaf-5 dark:text-on-light"
                >
                  {t("actSignIn")}
                </button>
              </SignInButton>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
