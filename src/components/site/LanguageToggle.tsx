"use client";

import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/cn";

/**
 * Both languages stay visible; the toggle only decides which one leads.
 * Hiding the inactive one would make the control a guess for anyone who
 * can't read the active label.
 */
export function LanguageToggle({ className }: { className?: string }) {
  const { lang, setLang } = useLang();

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border border-line bg-surface p-1",
        className,
      )}
      role="group"
      aria-label="भाषा / Language"
    >
      {(
        [
          { code: "mr", label: "मराठी" },
          { code: "en", label: "English" },
        ] as const
      ).map(({ code, label }) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
          className={cn(
            // 48px like every other tap target. The rule doesn't get a
            // discount for being a small control.
            "min-h-12 rounded-full px-4 text-[14px] font-semibold transition-colors",
            lang === code
              ? // On paper this is a quiet dark chip. Inverting it in the dark
                // would make a language selector the brightest object in the
                // header, ahead of the actual call to action — so it becomes a
                // raised chip instead of a lit one.
                "bg-ink text-paper dark:bg-line dark:text-ink"
              : "text-ink-mute hover:text-ink",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
