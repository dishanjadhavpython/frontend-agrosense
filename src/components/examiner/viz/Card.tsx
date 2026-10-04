import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, ArrowDown, ArrowUp } from "lucide-react";
import type { Tone } from "@/data/examiner/types";
import { cn } from "@/lib/cn";
import { TONE, WASH } from "./geom";

/**
 * The bento cell.
 *
 * Everything in a chapter body is one of these: a figure, a decision, a
 * limitation, a block of prose. Cards declare a column span on a twelve-column
 * grid and collapse to one column below `md`, in source order.
 *
 * The footer source line is the part that is not decoration. This project's
 * first rule is that no number is invented, and printing the artifact path
 * under the card is what makes that checkable rather than merely claimed — an
 * examiner can ask for the file. The QA sweep counts cards without one.
 */

const SPAN: Record<number, string> = {
  3: "md:col-span-3 lg:col-span-3",
  4: "md:col-span-6 lg:col-span-4",
  5: "md:col-span-6 lg:col-span-5",
  6: "md:col-span-6 lg:col-span-6",
  7: "md:col-span-6 lg:col-span-7",
  8: "md:col-span-6 lg:col-span-8",
  9: "md:col-span-6 lg:col-span-9",
  12: "md:col-span-6 lg:col-span-12",
};

export function Grid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-6 lg:grid-cols-12">
      {children}
    </div>
  );
}

export function Card({
  span = 12,
  title,
  n,
  lede,
  icon,
  tone = "gold",
  control,
  href,
  footnote,
  source,
  at,
  wide,
  quiet,
  className,
  children,
}: {
  span?: keyof typeof SPAN;
  title?: string;
  /** "Fig. 5.3" — examiners cite these aloud. */
  n?: string;
  lede?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  tone?: Tone;
  /** A segmented control or similar, right-aligned in the header. */
  control?: ReactNode;
  /** Turns the corner button into a link. */
  href?: string;
  footnote?: ReactNode;
  source?: string;
  at?: string;
  /** Let a wide matrix or table scroll inside the card rather than squeeze. */
  wide?: boolean;
  /** No border or fill — for prose that should read as page, not as panel. */
  quiet?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  // A numbered, captioned chart is a `<figure>`, and saying so is not
  // pedantry: the QA sweep measures the smallest type inside a figure and
  // counts figures without a source line, and it was finding none of them
  // while every card rendered as a plain section.
  const Tag = n ? "figure" : "section";
  const Caption = n ? "figcaption" : "header";

  return (
    <Tag
      className={cn(
        "print-block flex flex-col",
        !quiet &&
          "rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card md:p-6",
        SPAN[span],
        className,
      )}
    >
      {title || icon || control ? (
        <Caption className="flex items-start gap-3">
          {icon ? <IconTile icon={icon} tone={tone} /> : null}
          <div className="min-w-0 flex-1">
            {n ? <p className="ex-num">{n}</p> : null}
            {title ? (
              <h3 className={cn("ex-head text-[1.0625rem]", n && "mt-1")}>
                {title}
              </h3>
            ) : null}
          </div>
          {control ? <div className="shrink-0">{control}</div> : null}
          {href ? (
            <Link
              href={href}
              aria-label={`More on ${title ?? "this"}`}
              className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink-mute transition-colors hover:border-line-strong hover:text-ink"
            >
              <ArrowUpRight className="size-4" aria-hidden />
            </Link>
          ) : null}
        </Caption>
      ) : null}

      {lede ? (
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
          {lede}
        </p>
      ) : null}

      {children ? (
        <div
          className={cn(
            // `flex-1`, so a card whose row is taller than its own content
            // gives that height to the figure rather than to a gap above the
            // source line. Block children ignore it and stay where they were.
            "min-w-0 flex-1",
            (title || lede) && "mt-5",
            wide && "hide-scrollbar -mx-1 overflow-x-auto px-1",
          )}
        >
          {children}
        </div>
      ) : null}

      {/* A div, not a `p`. The slot takes a ReactNode and most footnotes are now
          a `Points` list; a `ul` inside a `p` is invalid HTML, and the browser
          closes the paragraph early, which meant the server tree and the client
          tree disagreed and every chapter threw a hydration error. */}
      {footnote ? (
        <div className="ex-caption mt-4 max-w-2xl">{footnote}</div>
      ) : null}

      {source ? (
        <p data-source className="ex-source mt-auto border-t border-line pt-3">
          {source}
          {at ? <span className="text-ink-mute"> · {at}</span> : null}
        </p>
      ) : null}
    </Tag>
  );
}

/**
 * The rounded accent tile both reference dashboards put at the top-left of a
 * card. The hue is chosen by meaning, never by position in a row — see the
 * `Tone` docstring.
 */
export function IconTile({
  icon: Icon,
  tone = "gold",
  size = "md",
}: {
  icon: ComponentType<{ className?: string }>;
  tone?: Tone;
  size?: "sm" | "md";
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-[12px]",
        size === "md" ? "size-10" : "size-8",
      )}
      style={{ background: TONE[tone], color: "var(--color-on-accent)" }}
    >
      <Icon className={size === "md" ? "size-5" : "size-4"} />
    </span>
  );
}

/**
 * The hero card: tile, one very large numeral, an optional delta, one line of
 * label. The numeral scale is the strongest single cue both references share.
 */
export function StatCard({
  span = 3,
  value,
  unit,
  label,
  sub,
  icon,
  tone = "gold",
  delta,
}: {
  span?: keyof typeof SPAN;
  value: string | number;
  unit?: string;
  label: string;
  sub?: string;
  icon?: ComponentType<{ className?: string }>;
  tone?: Tone;
  delta?: DeltaProps;
}) {
  return (
    <div
      className={cn(
        "print-block flex flex-col rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card",
        SPAN[span],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {icon ? <IconTile icon={icon} tone={tone} /> : <span />}
        {delta ? <DeltaChip {...delta} /> : null}
      </div>
      <p className="mt-4 flex items-baseline gap-1.5">
        <span className="font-mono text-[2.25rem] leading-none font-medium tracking-[-0.02em] tabular-nums text-ink">
          {value}
        </span>
        {unit ? (
          <span className="text-[14px] text-ink-mute">{unit}</span>
        ) : null}
      </p>
      <p className="mt-2.5 text-[14px] leading-snug text-ink-soft">{label}</p>
      {sub ? <p className="ex-caption mt-1">{sub}</p> : null}
    </div>
  );
}

export type DeltaProps = {
  /** Printed as given: "+1.97", "9/12", "−244 MB". */
  value: string;
  /** Which way the project moved, not which way the number moved. */
  direction: "up" | "down";
  /** Whether that movement was the good outcome. */
  good: boolean;
  title?: string;
};

/**
 * The pill both references put beside a hero number.
 *
 * It appears only where a genuine before-and-after exists — the scorecard's
 * 6.00 to 7.97, the OCR's 3/12 to 12/12, the container image losing 244 MB.
 * Most numbers in this walkthrough have no delta, and giving them a decorative
 * one would be the fastest way to make a measured page look like a mock-up.
 *
 * `direction` and `good` are separate on purpose: a false-veto rate falling is
 * a down arrow and a good outcome, and collapsing the two would either draw the
 * wrong arrow or colour the right one wrongly.
 */
export function DeltaChip({ value, direction, good, title }: DeltaProps) {
  const tone: Tone = good ? "green" : "clay";
  const Icon = direction === "up" ? ArrowUp : ArrowDown;
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[12px] tabular-nums"
      style={{ background: WASH[tone], color: TONE[tone] }}
    >
      <Icon className="size-3" aria-hidden />
      {value}
    </span>
  );
}

/** A labelled bar with `215/426` on the right, as in the first reference. */
export function ProgressRow({
  rows,
  tone = "gold",
}: {
  rows: readonly { label: string; value: number; of: number; tone?: Tone }[];
  tone?: Tone;
}) {
  return (
    <div className="flex flex-col gap-3.5">
      {rows.map((r) => {
        const width = Math.round((r.value / r.of) * 1000) / 10;
        return (
          <div key={r.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[14px] text-ink-soft">{r.label}</span>
              <span className="font-mono text-[13px] tabular-nums text-ink-mute">
                <span className="text-ink">
                  {r.value.toLocaleString("en-IN")}
                </span>
                /{r.of.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-sunk">
              <div
                className="h-full rounded-full"
                style={{ width: `${width}%`, background: TONE[r.tone ?? tone] }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * A small floating note over a chart, as both references use. Used sparingly:
 * to point at the one cell or the one point that carries the argument.
 */
export function Annotation({
  tone = "ink",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-1.5 text-[13px] text-ink shadow-card">
      <span
        aria-hidden
        className="inline-block size-2 shrink-0 rounded-full"
        style={{ background: TONE[tone] }}
      />
      {children}
    </span>
  );
}
