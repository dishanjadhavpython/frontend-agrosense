"use client";

import { Moon, Sun } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/cn";

/**
 * Day and night, which is how the working day is actually divided here —
 * not "light/dark", which names the interface rather than the hour.
 *
 * Both glyphs are in the markup and CSS decides which is visible, keyed off
 * the `data-theme` the head script set before paint. So the right icon is
 * showing in the very first frame, before React has hydrated anything: no
 * sun blinking into a moon a beat after the page settles.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const { lang } = useLang();
  const mr = lang === "mr";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={theme === "dark"}
      aria-label={mr ? "रात्रीची रंगसंगती" : "Night theme"}
      onClick={toggle}
      className={cn(
        "grid size-12 shrink-0 place-items-center rounded-full border border-line",
        "bg-surface text-ink-soft transition-colors hover:text-ink",
        className,
      )}
    >
      <Sun className="size-5 dark:hidden" aria-hidden />
      <Moon className="hidden size-5 dark:block" aria-hidden />
    </button>
  );
}
