"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { cleanEngineMarathi, cropFromEngine, fertilizerFromEngine } from "@/data/cropOntology";
import type { CropAdvice, FertiliserPlan } from "@/lib/recommendTypes";
import { LiebigStaves, factorLabel } from "./LiebigStaves";

/**
 * Everything the engine worked out about the one crop currently selected.
 *
 * Five stages' worth of output, in the order a farmer actually asks: is this
 * a good idea (S2's gate), how much will I get (S3's band), and what do I
 * put on it (S4's dose). The provenance of each is on the surface rather
 * than in a footnote — "decided by rules", "state-wide median", "your card"
 * — because a number whose source is invisible is a number nobody can argue
 * with, and every one of these is arguable.
 */

const YIELD_CLASS: Record<string, { mr: string; en: string; tint: string }> = {
  below: { mr: "सरासरीपेक्षा कमी", en: "Below this crop's norm", tint: "bg-anar-wash text-anar" },
  typical: { mr: "नेहमीसारखं", en: "Typical for this crop", tint: "bg-leaf-wash text-leaf-deep" },
  above: { mr: "सरासरीपेक्षा जास्त", en: "Above this crop's norm", tint: "bg-leaf-wash text-leaf-deep" },
};

const LEACH_BAND: Record<string, { mr: string; en: string }> = {
  low: { mr: "कमी", en: "low" },
  moderate: { mr: "मध्यम", en: "moderate" },
  high: { mr: "जास्त", en: "high" },
};

function Panel({
  title,
  note,
  children,
  className,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-[var(--radius-card)] border border-line bg-surface p-5", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h4 className="text-[1.02rem] font-semibold text-ink font-[family-name:var(--font-display)]">
          {title}
        </h4>
        {note ? <p className="text-[13px] text-ink-mute">{note}</p> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** p10 — p50 — p90, drawn as the band it is rather than three numbers. */
function YieldBand({ advice, mr }: { advice: CropAdvice; mr: boolean }) {
  const { yield_p10_t_ha: p10, yield_p50_t_ha: p50, yield_p90_t_ha: p90 } = advice;

  if (advice.yield_abstained || p10 == null || p50 == null || p90 == null) {
    return (
      <Panel title={mr ? "उत्पन्नाचा अंदाज" : "Yield outlook"}>
        <p className="text-[14px] leading-relaxed text-ink-soft">
          {mr
            ? "या पिकासाठी आकडा सांगणं प्रामाणिक ठरणार नाही — मॉडेलची अचूकता इथे सरासरीपेक्षाही कमी आहे, म्हणून ते गप्प बसतं."
            : "No number here would be honest — on this crop the model scores worse than simply guessing the average, so it declines rather than guesses."}
        </p>
        {advice.yield_interval_note ? (
          <p className="mt-2 text-[12.5px] text-ink-mute">{advice.yield_interval_note}</p>
        ) : null}
      </Panel>
    );
  }

  const span = p90 - p10 || 1;
  const mid = ((p50 - p10) / span) * 100;
  const klass = advice.yield_class ? YIELD_CLASS[advice.yield_class] : null;

  return (
    <Panel
      title={mr ? "उत्पन्नाचा अंदाज" : "Yield outlook"}
      note={mr ? "टन प्रति हेक्टर" : "tonnes per hectare"}
    >
      <div className="flex items-baseline gap-2">
        <span className="tnum text-[2rem] leading-none font-semibold text-ink">{p50.toFixed(2)}</span>
        <span className="text-[13px] text-ink-mute">{mr ? "मध्यम अंदाज" : "median"}</span>
      </div>

      <div className="mt-4">
        <div className="relative h-2.5 rounded-full bg-leaf-1">
          <div
            className="absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full border-2 border-surface bg-leaf"
            style={{ left: `calc(${mid}% - 7px)` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[12px] text-ink-mute">
          <span className="tnum">{p10.toFixed(2)}</span>
          <span className="tnum">{p90.toFixed(2)}</span>
        </div>
      </div>

      {klass ? (
        <p className="mt-3">
          <span className={cn("rounded-full px-2.5 py-1 text-[12.5px] font-medium", klass.tint)}>
            {mr ? klass.mr : klass.en}
          </span>
          {advice.yield_class_confidence != null ? (
            <span className="tnum ml-2 text-[12px] text-ink-mute">
              {Math.round(advice.yield_class_confidence * 100)}%
            </span>
          ) : null}
        </p>
      ) : null}

      {advice.yield_interval_note ? (
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-mute">
          {advice.yield_interval_note}
        </p>
      ) : null}
    </Panel>
  );
}

/** The dose, in kilograms of the bags a farmer can actually buy. */
function DosePlan({ plan, mr }: { plan: FertiliserPlan | null; mr: boolean }) {
  if (!plan || !plan.available) {
    return (
      <Panel title={mr ? "खताचा डोस" : "Fertiliser dose"}>
        <p className="text-[14px] leading-relaxed text-ink-soft">
          {mr
            ? "सरकारी तक्त्यात या पिकासाठी कुठलीही शिफारस नाही. अंदाजाने आकडा देण्यापेक्षा काहीच न देणं योग्य."
            : "The government table carries no recipe for this crop anywhere — not even a state-wide median. Nothing is invented to fill the gap."}
        </p>
        {plan?.note ? <p className="mt-2 text-[12.5px] text-ink-mute">{plan.note}</p> : null}
      </Panel>
    );
  }

  const products = Object.entries(plan.table_products_kg_ha ?? {});
  const schedule = plan.nitrogen_schedule;

  return (
    <Panel
      title={mr ? "खताचा डोस" : "Fertiliser dose"}
      note={
        plan.estimated
          ? mr ? "राज्याची सरासरी — तुमच्या जिल्ह्याची नोंद नाही" : "state-wide median — your district has no published recipe"
          : mr ? "किलो प्रति हेक्टर" : "kg per hectare"
      }
    >
      {products.length ? (
        <ul className="grid gap-2 sm:grid-cols-3">
          {products.map(([product, kg]) => {
            const bag = fertilizerFromEngine(product);
            return (
              <li key={product} className="rounded-[12px] border border-line bg-paper px-3.5 py-3">
                <p className="tnum text-[1.35rem] leading-none font-semibold text-ink">
                  {kg.toFixed(1)}
                  <span className="ml-1 text-[12px] font-normal text-ink-mute">kg/ha</span>
                </p>
                <p className="mt-1.5 text-[13.5px] font-medium text-ink-soft">
                  {bag ? (mr ? bag.mr : bag.name) : product}
                </p>
                {bag ? (
                  <Link
                    href={`/prediction/fertilizer/${bag.key}`}
                    className="mt-1 inline-flex items-center gap-1 text-[12px] text-leaf hover:underline"
                  >
                    {mr ? "माहिती" : "About"}
                    <ArrowRight className="size-3" strokeWidth={2} aria-hidden />
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {schedule ? (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-[13.5px] font-semibold text-ink">
            {mr ? "नत्र कधी द्यायचं" : "When to put the nitrogen on"}
          </p>
          <ol className="mt-2.5 grid gap-1.5">
            {schedule.schedule.map((step, i) => (
              <li
                key={`${step.stage}-${i}`}
                className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5 text-[14px] last:border-0"
              >
                <span className="text-ink-soft">{step.stage}</span>
                <span className="tnum shrink-0 font-medium text-ink">
                  {step.n_kg_ha.toFixed(1)} kg N/ha
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-mute">
            {schedule.rationale}
            {" "}
            {mr ? "वाहून जाण्याचा धोका" : "Leaching risk"}:{" "}
            {(LEACH_BAND[schedule.leach_risk_band] ?? { mr: schedule.leach_risk_band, en: schedule.leach_risk_band })[mr ? "mr" : "en"]}.
            {" "}
            {mr ? "स्फुरद व पालाश" : "P and K"}: {schedule.phosphorus_potassium}.
          </p>
        </div>
      ) : null}

      {plan.sulphur_swap ? (
        <p className="mt-4 rounded-[12px] border border-haldi/40 bg-haldi-wash px-3.5 py-3 text-[13px] leading-relaxed text-haldi-ink">
          {plan.sulphur_swap.note}
        </p>
      ) : null}

      {plan.notes?.length ? (
        <ul className="mt-4 grid gap-1.5">
          {plan.notes.map((note) => (
            <li key={note} className="text-[12.5px] leading-relaxed text-ink-mute">
              {note}
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}

export function CropDetailPanel({ advice, mr }: { advice: CropAdvice; mr: boolean }) {
  const crop = cropFromEngine(advice.crop);
  const name = crop
    ? (mr ? crop.mr : crop.en)
    : (mr ? cleanEngineMarathi(advice.crop_marathi) ?? advice.crop : advice.crop);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h3 className="section-head text-[1.5rem] text-ink">{name}</h3>
        {crop ? (
          <Link
            href={`/prediction/crop/${crop.key}`}
            className="inline-flex items-center gap-1.5 text-[14px] font-medium text-leaf hover:underline"
          >
            {mr ? "या पिकाबद्दल सगळं" : "Everything about this crop"}
            <ArrowRight className="size-4" strokeWidth={1.8} aria-hidden />
          </Link>
        ) : null}
      </div>

      <p className="mt-2 max-w-[68ch] text-[15px] leading-relaxed text-ink-soft">{advice.reason}</p>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Panel
          title={mr ? "का, आणि कशामुळे अडतंय" : "Why, and what holds it back"}
          note={
            mr
              ? `अडथळा: ${factorLabel(advice.limiting_factor, true)}`
              : `Limiting: ${factorLabel(advice.limiting_factor, false)}`
          }
          className="lg:col-span-2"
        >
          <LiebigStaves
            factors={advice.factors}
            limiting={advice.limiting_factor}
            mr={mr}
          />
        </Panel>

        <YieldBand advice={advice} mr={mr} />
        <DosePlan plan={advice.fertiliser} mr={mr} />
      </div>
    </div>
  );
}
