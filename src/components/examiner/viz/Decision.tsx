import { Check } from "lucide-react";
import type { Decision } from "@/data/examiner/types";
import { cn } from "@/lib/cn";

/**
 * A decision, rendered in the shape it gets asked about.
 *
 * The brief for this section was to justify the engineering, and prose does
 * that badly — an examiner reading a paragraph cannot tell whether the
 * alternatives were considered or merely not mentioned. A fixed five-part
 * structure makes the omission visible: an option list with nothing measured
 * beside it, or an empty `cost`, reads as a gap on the page rather than as a
 * confident sentence.
 */
export function DecisionCard({ decision: d }: { decision: Decision }) {
  return (
    <section
      id={d.id}
      className="print-block rounded-[var(--radius-card)] border border-line bg-surface p-5 md:p-6"
    >
      <p className="ex-num">Decision</p>
      <h3 className="ex-head mt-1.5">{d.question}</h3>

      <ul className="mt-5 flex flex-col gap-px overflow-hidden rounded-[10px] border border-line bg-line">
        {d.options.map((o) => (
          <li
            key={o.name}
            className={cn(
              "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3.5 py-2.5",
              o.chosen ? "bg-gold-wash" : "bg-paper",
            )}
          >
            <span className="flex items-center gap-2 text-[14px]">
              {o.chosen ? (
                <Check
                  className="size-3.5 shrink-0 text-gold"
                  aria-label="chosen"
                />
              ) : (
                <span aria-hidden className="inline-block size-3.5 shrink-0" />
              )}
              <span
                className={cn(
                  o.chosen ? "font-semibold text-ink" : "text-ink-soft",
                )}
              >
                {o.name}
              </span>
            </span>
            {o.measured ? (
              <span className="ml-5 font-mono text-[13px] tabular-nums text-ink-mute">
                {o.measured}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      <dl className="mt-5 flex flex-col gap-3">
        <Row term="Decided">{d.decision}</Row>
        <Row term="Because">{d.because}</Row>
        {d.cost ? <Row term="Cost">{d.cost}</Row> : null}
      </dl>

      {d.source ? (
        <p data-source className="ex-source mt-4 border-t border-line pt-2.5">
          {d.source}
        </p>
      ) : null}
    </section>
  );
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[6rem_1fr] sm:gap-4">
      <dt className="ex-source pt-0.5 tracking-wider uppercase">{term}</dt>
      <dd className="max-w-2xl text-[15px] leading-relaxed text-ink-soft">
        {children}
      </dd>
    </div>
  );
}
