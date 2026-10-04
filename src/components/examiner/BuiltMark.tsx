import { cn } from "@/lib/cn";

/**
 * "How this system is built", in the mark's own green.
 *
 * The colour is `#aadd3b` — R170 G221 B59, the green in the logo's lighter
 * leaf. It is the brightest thing in the section and it can only be used one
 * way: measured, it is 11.10:1 on ink and **1.60:1 on white**. Set as a heading
 * on the gallery-white page it would not be a marginal call, it would be
 * unreadable, and the section's hard gate is 4.5:1 in both themes.
 *
 * So it is never set on the page — it is set on a plaque. A dark rounded band
 * carries the exact colour at 11:1 in both themes, and the shape does something
 * the loose heading could not: it reads as a brand lockup, which is what the
 * line actually is. In the dark theme the plaque all but disappears into the
 * ground and the letters glow, which is the treatment the owner asked for and
 * the one the colour is built for.
 *
 * `lg` is the cover; the small one rides in the header on every page.
 */
export function BuiltMark({
  size = "sm",
  className,
}: {
  size?: "sm" | "lg";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "ex-brand-plaque",
        size === "lg" && "gap-3 px-4 py-2",
        className,
      )}
    >
      <Leaf className={size === "lg" ? "size-6" : "size-4"} />
      <span
        className={cn(
          "ex-brand-title",
          size === "lg" ? "text-[15px] md:text-[17px]" : "text-[11px]",
        )}
      >
        How this system is built
      </span>
    </span>
  );
}

/**
 * The shoot from the mark, redrawn as one path in `currentColor`.
 *
 * Not the photograph: at sixteen pixels on a dark plaque the raster mark is a
 * smudge, and it carries its own two greens and an amber, which is three more
 * colours than a plaque this size can hold. The full mark is used where it has
 * room to be itself — the header and the cover.
 */
function Leaf({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      aria-hidden
      style={{ color: "var(--color-brand)" }}
    >
      <path
        d="M12 21v-7.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M12 14c0-4 2.6-6.6 7-7 .4 4.2-2.4 7-7 7Z"
        fill="currentColor"
        opacity="0.95"
      />
      <path
        d="M11.4 15.4c0-3.4-2.2-5.7-6-6-.3 3.6 2.1 6 6 6Z"
        fill="currentColor"
        opacity="0.55"
      />
    </svg>
  );
}
