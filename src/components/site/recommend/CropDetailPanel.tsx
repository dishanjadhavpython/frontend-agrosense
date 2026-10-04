"use client";

import Link from "next/link";
import { ArrowRight, Droplets, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { cleanEngineMarathi, cropFromEngine, fertilizerFromEngine } from "@/data/cropOntology";
import type { CropAdvice, FertiliserPlan } from "@/lib/recommendTypes";
import { FactorBreakdown } from "./FactorBreakdown";
import { CLASS_LABEL } from "./CropCard";

/**
 * Everything the engine worked out about the one crop currently selected.
 *
 * Three questions, in the order a farmer asks them: does it suit my field and
 * what is in the way (the gate), how much will I get (the yield band), and
 * what do I put on it (the dose). Every number is said in the units a
 * Maharashtra farmer buys and sells in as well as the engine's own — quintal
 * per acre beside tonnes per hectare, bags beside kilograms — because a dose
 * nobody can turn into a number of bags is a dose nobody applies.
 */

/** One hectare is 2.471 acres; one tonne is ten quintals. */
const ACRES_PER_HA = 2.471;
const perAcre = (perHa: number) => perHa / ACRES_PER_HA;

const fmt = (v: number, digits = 1) =>
  v.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/**
 * The bag each product is sold in. Urea has come in 45 kg bags since the 2018
 * switch to neem-coated urea; DAP, MOP and SSP are 50 kg.
 */
const BAG_KG: Record<string, number> = { Urea: 45, DAP: 50, MOP: 50, SSP: 50 };

const YIELD_CLASS: Record<string, { mr: string; en: string; tint: string }> = {
  below: { mr: "नेहमीपेक्षा कमी", en: "Below this crop's usual", tint: "bg-anar-wash text-anar" },
  typical: { mr: "नेहमीसारखं", en: "Typical for this crop", tint: "bg-leaf-wash text-leaf-deep" },
  above: { mr: "नेहमीपेक्षा जास्त", en: "Above this crop's usual", tint: "bg-leaf-wash text-leaf-deep" },
};

const LEACH_BAND: Record<string, { mr: string; en: string }> = {
  low: { mr: "कमी", en: "low" },
  moderate: { mr: "मध्यम", en: "moderate" },
  high: { mr: "जास्त", en: "high" },
};

/** "basal", "25-30 DAS" — the engine's stage names, in a farmer's words. */
function stageLabel(stage: string, mr: boolean): string {
  if (/^basal$/i.test(stage.trim())) return mr ? "पेरणीच्या वेळी" : "At sowing";
  const das = stage.match(/^(\d+)\s*-\s*(\d+)\s*DAS$/i);
  if (das) {
    return mr
      ? `पेरणीनंतर ${das[1]}–${das[2]} दिवसांनी`
      : `${das[1]}–${das[2]} days after sowing`;
  }
  return stage;
}

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
    <section
      className={cn("rounded-[var(--radius-card)] border border-line bg-surface p-5 sm:p-6", className)}
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h4 className="text-[1.05rem] font-semibold text-ink font-[family-name:var(--font-display)]">
          {title}
        </h4>
        {note ? <p className="text-[13px] text-ink-mute">{note}</p> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** p10 — p50 — p90, as the range it is and in quintals per acre. */
function YieldBand({ advice, mr }: { advice: CropAdvice; mr: boolean }) {
  const { yield_p10_t_ha: p10, yield_p50_t_ha: p50, yield_p90_t_ha: p90 } = advice;

  if (advice.yield_abstained || p10 == null || p50 == null || p90 == null) {
    return (
      <Panel title={mr ? "किती उत्पन्न येईल" : "Expected harvest"}>
        <p className="text-[14px] leading-relaxed text-ink-soft">
          {mr
            ? "या पिकासाठी अंदाजाचा आकडा देत नाही — इथे मॉडेलचा अंदाज सरासरीपेक्षाही कमी अचूक ठरतो, म्हणून चुकीचा आकडा देण्यापेक्षा न देणं बरं."
            : "No figure for this crop — here the model guesses worse than the plain average would, so it gives no number rather than a wrong one."}
        </p>
      </Panel>
    );
  }

  const span = p90 - p10 || 1;
  const mid = ((p50 - p10) / span) * 100;
  const klass = advice.yield_class ? YIELD_CLASS[advice.yield_class] : null;
  // Tonnes per hectare to quintals per acre: x10, then per acre.
  const qAcre = (tHa: number) => perAcre(tHa * 10);

  return (
    <Panel title={mr ? "किती उत्पन्न येईल" : "Expected harvest"}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="tnum text-[2.25rem] leading-none font-semibold text-ink">
          {fmt(qAcre(p50))}
        </span>
        <span className="text-[14px] font-medium text-ink-soft">
          {mr ? "क्विंटल प्रति एकर" : "quintal per acre"}
        </span>
      </div>
      <p className="tnum mt-1.5 text-[13px] text-ink-mute">
        {mr ? `= ${fmt(p50, 2)} टन प्रति हेक्टर` : `= ${fmt(p50, 2)} tonnes per hectare`}
      </p>

      <div className="mt-5">
        <div className="relative h-3 rounded-full bg-leaf-1">
          <div
            className="absolute top-1/2 size-4 -translate-y-1/2 rounded-full border-[3px] border-surface bg-leaf shadow-sm"
            style={{ left: `calc(${mid}% - 8px)` }}
          />
        </div>
        <div className="tnum mt-1.5 flex justify-between text-[12.5px] text-ink-mute">
          <span>{fmt(qAcre(p10))}</span>
          <span>{fmt(qAcre(p90))}</span>
        </div>
      </div>
      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
        {mr
          ? `बहुतेक वर्षी ${fmt(qAcre(p10))} ते ${fmt(qAcre(p90))} क्विंटल प्रति एकर. मधला ठिपका म्हणजे सर्वात शक्य उत्पन्न.`
          : `Most years land between ${fmt(qAcre(p10))} and ${fmt(qAcre(p90))} quintal per acre. The dot is the likeliest.`}
      </p>

      {klass ? (
        <p className="mt-3">
          <span className={cn("rounded-full px-2.5 py-1 text-[12.5px] font-medium", klass.tint)}>
            {mr ? klass.mr : klass.en}
          </span>
        </p>
      ) : null}
    </Panel>
  );
}

/** The dose, in kilograms and in the bags a farmer actually buys. */
function DosePlan({ plan, mr }: { plan: FertiliserPlan | null; mr: boolean }) {
  if (!plan || !plan.available) {
    return (
      <Panel title={mr ? "किती खत द्यायचं" : "How much fertiliser"}>
        <p className="text-[14px] leading-relaxed text-ink-soft">
          {mr
            ? "सरकारी शिफारस तक्त्यात या पिकासाठी डोस नाही. अंदाजाने आकडा देण्यापेक्षा काहीच न देणं योग्य."
            : "The government's dose table has no recipe for this crop, so none is given — nothing is invented to fill the gap."}
        </p>
      </Panel>
    );
  }

  const products = Object.entries(plan.table_products_kg_ha ?? {}).filter(([, kg]) => kg > 0);
  const schedule = plan.nitrogen_schedule;

  return (
    <Panel
      title={mr ? "किती खत द्यायचं" : "How much fertiliser"}
      note={
        plan.estimated
          ? mr ? "राज्याची सरासरी — तुमच्या जिल्ह्याची शिफारस नाही" : "State average — no recipe published for your district"
          : mr ? "सरकारी शिफारशीनुसार" : "From the government recommendation"
      }
    >
      {products.length ? (
        <ul className="grid gap-2.5">
          {products.map(([product, kg]) => {
            const bag = fertilizerFromEngine(product);
            const acre = perAcre(kg);
            const bagKg = BAG_KG[product];
            return (
              <li
                key={product}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-[14px] border border-line bg-paper px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-ink">
                    {bag ? (mr ? bag.mr : bag.name) : product}
                  </p>
                  {bag ? (
                    <Link
                      href={`/prediction/fertilizer/${bag.key}`}
                      className="mt-0.5 inline-flex items-center gap-1 text-[12.5px] font-medium text-leaf hover:underline"
                    >
                      {mr ? "या खताबद्दल" : "About this fertiliser"}
                      <ArrowRight className="size-3" strokeWidth={2} aria-hidden />
                    </Link>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="tnum text-[1.3rem] leading-none font-semibold text-ink">
                    {fmt(acre, 0)}
                    <span className="ml-1 text-[12.5px] font-normal text-ink-mute">
                      {mr ? "किलो/एकर" : "kg/acre"}
                    </span>
                  </p>
                  <p className="tnum mt-1 text-[12.5px] text-ink-mute">
                    {bagKg
                      ? mr
                        ? `≈ ${fmt(acre / bagKg)} पोती (${bagKg} किलो) · ${fmt(kg, 0)} किलो/हेक्टर`
                        : `≈ ${fmt(acre / bagKg)} bags of ${bagKg} kg · ${fmt(kg, 0)} kg/ha`
                      : `${fmt(kg, 0)} kg/ha`}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {schedule ? (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-[14px] font-semibold text-ink">
            {mr ? "नत्र (युरिया) कधी द्यायचं" : "When to give the nitrogen"}
          </p>
          <ol className="mt-2.5 grid gap-1.5">
            {schedule.schedule.map((step, i) => (
              <li
                key={`${step.stage}-${i}`}
                className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5 text-[14px] last:border-0"
              >
                <span className="flex items-baseline gap-2 text-ink-soft">
                  <span className="tnum grid size-5 shrink-0 place-items-center rounded-full bg-leaf-wash text-[11px] font-semibold text-leaf-deep">
                    {i + 1}
                  </span>
                  {stageLabel(step.stage, mr)}
                </span>
                <span className="tnum shrink-0 font-medium text-ink">
                  {fmt(perAcre(step.n_kg_ha))} {mr ? "किलो नत्र/एकर" : "kg N/acre"}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-mute">
            {mr
              ? `नत्र वाहून जाण्याचा धोका ${(LEACH_BAND[schedule.leach_risk_band] ?? { mr: schedule.leach_risk_band }).mr} आहे, म्हणून ${schedule.n_splits} हप्त्यांत. स्फुरद व पालाश पूर्ण पेरणीच्या वेळी.`
              : `Nitrogen washes out at a ${(LEACH_BAND[schedule.leach_risk_band] ?? { en: schedule.leach_risk_band }).en} rate here, so it goes on in ${schedule.n_splits} parts. Phosphorus and potassium all at sowing.`}
          </p>
        </div>
      ) : null}

      {plan.sulphur_swap ? (
        <p className="mt-4 flex items-start gap-2.5 rounded-[12px] border border-haldi/40 bg-haldi-wash px-3.5 py-3 text-[13px] leading-relaxed text-haldi-ink">
          <Sparkles className="mt-0.5 size-4 shrink-0" strokeWidth={2} aria-hidden />
          <span>
            {mr
              ? `गंधकही हवा असेल तर DAP ऐवजी SSP (${fmt(perAcre(plan.sulphur_swap.ssp_kg_ha), 0)} किलो/एकर) वापरा, आणि कमी पडणारं नत्र युरियाने भरून काढा.`
              : `If you also need sulphur, use SSP instead of DAP (${fmt(perAcre(plan.sulphur_swap.ssp_kg_ha), 0)} kg/acre) and make up the nitrogen DAP would have given with urea.`}
          </span>
        </p>
      ) : null}
    </Panel>
  );
}

export function CropDetailPanel({ advice, mr }: { advice: CropAdvice; mr: boolean }) {
  const crop = cropFromEngine(advice.crop);
  const name = crop
    ? (mr ? crop.mr : crop.en)
    : (mr ? cleanEngineMarathi(advice.crop_marathi) ?? advice.crop : advice.crop);
  const klass = CLASS_LABEL[advice.suitability_class] ?? CLASS_LABEL["?"];

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="eyebrow text-ink-mute">
            {mr ? `क्रमांक ${advice.rank} चं पीक` : `Choice no. ${advice.rank}`}
          </p>
          <h3 className="section-head mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[1.75rem] text-ink">
            {name}
            <span className={cn("rounded-full px-2.5 py-1 text-[13px] font-semibold tracking-normal", klass.tint)}>
              {mr ? klass.mr : klass.en}
            </span>
            {advice.requires_irrigation ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-jal-wash px-2.5 py-1 text-[13px] font-semibold tracking-normal text-jal-ink">
                <Droplets className="size-3.5" strokeWidth={2} aria-hidden />
                {mr ? "पाणी द्यावं लागेल" : "Needs irrigation"}
              </span>
            ) : null}
          </h3>
        </div>
        {crop ? (
          <Link
            href={`/prediction/crop/${crop.key}#updates`}
            className="inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-5 text-[14px] font-semibold text-paper transition-colors hover:bg-leaf-deep dark:bg-leaf dark:text-on-light dark:hover:bg-leaf-4"
          >
            {mr ? "या पिकाची सगळी व ताजी माहिती" : "Everything about this crop, and the latest"}
            <ArrowRight className="size-4" strokeWidth={2} aria-hidden />
          </Link>
        ) : null}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Panel
          title={mr ? "का योग्य, आणि कशामुळे अडतं" : "Why it suits, and what holds it back"}
          className="lg:col-span-2"
        >
          <FactorBreakdown
            crop={name}
            factors={advice.factors}
            limiting={advice.limiting_factor}
            evidence={advice.evidence}
            needs={advice.needs}
            mr={mr}
          />
        </Panel>

        <YieldBand advice={advice} mr={mr} />
        <DosePlan plan={advice.fertiliser} mr={mr} />
      </div>
    </div>
  );
}
