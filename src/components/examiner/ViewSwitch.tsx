"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical, Sprout } from "lucide-react";
import { cn } from "@/lib/cn";
import { examinerFor } from "@/data/examiner/chapters";

/**
 * The corner switch between the two halves of this project: the thing a farmer
 * uses, and the explanation of how it was built.
 *
 * Chassis borrowed wholesale from `LanguageToggle` — the same pill, the same
 * 48px halves, the same rule that both sides stay visible, for the same reason
 * stated there: hiding the inactive one would make the control a guess.
 *
 * One deliberate divergence. LanguageToggle is two buttons because language is
 * client state; this is navigation, so the inactive half is a real `<Link>` and
 * the active half is a span. That keeps the examiner view deep-linkable and
 * lets Next prefetch it, which matters when the thing you are about to do is
 * demonstrate it to someone who is watching the loading state.
 *
 * Bottom right rather than in the header: `SiteHeader` is `sticky top-0 z-50`
 * and a top-anchored pill fights it on every scroll, whereas the bottom-right
 * corner is empty on every route in the product.
 */
export function ViewSwitch({ className }: { className?: string }) {
  const pathname = usePathname();
  const onExaminer = pathname.startsWith("/examiner");

  // From inside the product, land on the chapter that explains the screen you
  // are standing on. From inside the walkthrough, the way back is always the
  // front door.
  const target = onExaminer ? "/" : examinerFor(pathname);

  return (
    <div
      className={cn(
        "no-print safe-bottom fixed right-4 bottom-4 z-50",
        // Below the skip link's focus z-100 on purpose: a keyboard user
        // tabbing into the page must never find this in front of it.
        className,
      )}
    >
      <div
        className="inline-flex items-center rounded-full border border-line bg-surface p-1 shadow-card"
        role="group"
        aria-label="Switch between the product and the examiner walkthrough"
      >
        <Half
          href={target}
          active={!onExaminer}
          icon={<Sprout className="size-[18px]" aria-hidden />}
          label="Product"
        />
        <Half
          href={target}
          active={onExaminer}
          icon={<FlaskConical className="size-[18px]" aria-hidden />}
          label="How it works"
        />
      </div>
    </div>
  );
}

function Half({
  href,
  active,
  icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  // 48px, like every other tap target on this project. The rule does not get a
  // discount for being a small control (see Button.tsx).
  const shape =
    "inline-flex min-h-12 items-center gap-2 rounded-full px-3.5 text-[14px] font-semibold transition-colors sm:px-4";

  if (active) {
    return (
      <span
        aria-current="page"
        className={cn(
          shape,
          // Quiet dark chip on paper; a raised chip rather than a lit one in
          // the dark, so a meta control never becomes the brightest object on
          // the page. LanguageToggle's reasoning, applied unchanged.
          "bg-ink text-paper dark:bg-line dark:text-ink",
        )}
      >
        {icon}
        <span className="hidden sm:inline">{label}</span>
        <span className="sr-only sm:hidden">{label}</span>
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={cn(shape, "text-ink-mute hover:text-ink")}
      prefetch
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </Link>
  );
}
