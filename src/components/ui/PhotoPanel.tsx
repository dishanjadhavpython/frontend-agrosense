import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Photography in a rounded container, with a panel breaking its edge.
 *
 * The most repeated device across both product references (PLAN.md §5), and
 * the reason it is one component: it covers the landing's plot section, the
 * dashboard's map readout, the crop cards and the report header. Build it
 * once, well.
 *
 * `variant="night"` is the emphasis case — at most one per page.
 */

type PhotoPanelProps = {
  src?: string;
  alt: string;
  /** CSS aspect-ratio for the photo, e.g. "4 / 3". */
  ratio?: string;
  panel?: ReactNode;
  position?: "bottom-left" | "bottom-right" | "top-right";
  variant?: "paper" | "night";
  priority?: boolean;
  sizes?: string;
  /** Shown in dev only, when src is missing — says which photo belongs here. */
  awaiting?: string;
  className?: string;
  children?: ReactNode;
};

const positionClasses: Record<NonNullable<PhotoPanelProps["position"]>, string> =
  {
    "bottom-left":
      "bottom-4 left-4 md:bottom-8 md:-left-6 lg:-left-10",
    "bottom-right":
      "bottom-4 right-4 md:bottom-8 md:-right-6 lg:-right-10",
    "top-right": "top-4 right-4 md:top-8 md:-right-6 lg:-right-10",
  };

export function PhotoPanel({
  src,
  alt,
  ratio = "4 / 3",
  panel,
  position = "bottom-left",
  variant = "paper",
  priority = false,
  sizes = "(max-width: 768px) 100vw, (max-width: 1200px) 60vw, 720px",
  awaiting,
  className,
  children,
}: PhotoPanelProps) {
  return (
    // Not clipped — the panel has to be able to hang past the photo's edge.
    <div className={cn("relative", className)}>
      <div
        className="relative overflow-hidden rounded-[var(--radius-photo)] bg-leaf-wash"
        style={{ aspectRatio: ratio }}
      >
        {src ? (
          <Image
            src={src}
            alt={alt}
            fill
            priority={priority}
            sizes={sizes}
            className="object-cover"
          />
        ) : (
          <PhotoAwaiting label={awaiting ?? alt} />
        )}
        {children}
      </div>

      {panel ? (
        <div
          className={cn(
            "absolute z-10 max-w-[min(20rem,calc(100%-2rem))]",
            positionClasses[position],
          )}
        >
          <div
            className={cn(
              "rounded-[var(--radius-card)] p-4 md:p-5",
              variant === "night"
                ? "bg-night/92 text-chalk backdrop-blur-sm"
                : "bg-surface text-ink border border-line",
            )}
            style={{ boxShadow: "var(--shadow-panel)" }}
          >
            {panel}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Stands in until the real photograph lands. Ploughed rows over a leaf wash —
 * it reads as an intentional surface rather than a broken image, so layout
 * review isn't blocked on the shoot.
 */
function PhotoAwaiting({ label }: { label: string }) {
  return (
    <div
      className="absolute inset-0 field-rows"
      style={{
        backgroundColor: "var(--color-leaf-2)",
        backgroundImage: `linear-gradient(160deg, var(--color-leaf-3) 0%, var(--color-leaf-2) 42%, var(--color-leaf-1) 100%)`,
      }}
      aria-hidden
    >
      <div className="absolute inset-0 field-rows opacity-[0.18]" />
      {process.env.NODE_ENV !== "production" ? (
        <span className="absolute top-3 right-4 font-mono text-[11px] tracking-wide text-leaf-deep/60">
          {label}
        </span>
      ) : null}
    </div>
  );
}
