import Image from "next/image";
import { cn } from "@/lib/cn";

/**
 * The AgroSense mark: two leaves opening on a rising sun.
 *
 * This replaced a hand-drawn SVG of soil strata once the real mark existed.
 * The drawing was a stand-in and read in `currentColor`, which meant it took
 * the colour of whatever sat around it; the mark has its own two greens and an
 * amber and is the same in both themes, which is the point of a mark.
 *
 * Keyed off its white matte at authoring time rather than at runtime — the
 * supplied file is a JPEG on white, and a white tile behind a logo is the
 * detail that makes an otherwise finished dark theme look unfinished. The
 * background was flood-filled from the border so the white inside the leaves,
 * which belongs to the drawing, survived.
 *
 * `alt=""`: every place this appears it sits beside the word "AgroSense", and
 * a screen reader announcing the name twice is worse than not announcing the
 * picture.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="/img/brand/agrosense-mark.png"
      alt=""
      width={192}
      height={170}
      className={cn("size-8 object-contain", className)}
    />
  );
}

/**
 * The full lockup — mark, wordmark and tagline — for the one or two places
 * that introduce the product rather than label it.
 *
 * The wordmark is dark green and stays dark green, so this is given a light
 * plate to sit on in both themes rather than being dropped straight onto the
 * page. That is the normal way to place a single-colour lockup on a dark
 * ground, and it is honest: the mark is not being restyled to suit the theme.
 */
export function LogoLockup({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-[20px] bg-white p-4",
        className,
      )}
    >
      <Image
        src="/img/brand/agrosense-logo.png"
        alt="AgroSense — for farmers, for tomorrow"
        width={440}
        height={401}
        className="h-auto w-full max-w-[180px] object-contain"
      />
    </span>
  );
}
