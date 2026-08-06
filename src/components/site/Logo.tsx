import { cn } from "@/lib/cn";

/**
 * Soil strata with a shoot breaking the surface. The product reads what is
 * under the line and tells you what to do above it — that is the whole mark.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-8", className)}
      fill="none"
      aria-hidden
    >
      {/* the shoot */}
      <path
        d="M16 15V8"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M16 10.5c0-2.5-1.7-4.4-4.2-4.6-.2 2.6 1.5 4.6 4.2 4.6ZM16 12.4c0-2.2 1.5-3.9 3.8-4.1.2 2.3-1.4 4.1-3.8 4.1Z"
        fill="currentColor"
      />
      {/* the surface */}
      <path
        d="M3 16h26"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      {/* strata below, thinning with depth */}
      <path
        d="M6 21h20"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        opacity="0.62"
      />
      <path
        d="M10 25.5h12"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.34"
      />
    </svg>
  );
}
