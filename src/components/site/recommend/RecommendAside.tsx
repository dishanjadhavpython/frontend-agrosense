"use client";

import { AlertTriangle, Droplets, Info } from "lucide-react";
import { cn } from "@/lib/cn";
import { cleanEngineMarathi, cropFromEngine } from "@/data/cropOntology";
import { factorLabel } from "./LiebigStaves";
import type {
  MicronutrientCorrection,
  NotAssessableCrop,
  RecommendContext,
  Recommendation,
  VetoedCrop,
} from "@/lib/recommendTypes";

/**
 * The parts of the answer that are not a crop: what was ruled out, what the
 * soil is short of, how confident the engine is, and — the one that matters
 * most — which number came from whose measurement.
 *
 * None of this is an appendix. "Nine crops were vetoed because they are not
 * grown in Rabi" is advice. "Your zinc is low, the taluka's manganese is"
 * is two different claims and they are labelled as two different claims.
 */

function Block({
  title,
  tone = "quiet",
  icon,
  children,
}: {
  title: string;
  tone?: "quiet" | "warn" | "water";
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const tint = {
    quiet: "border-line bg-surface",
    warn: "border-anar/40 bg-anar-wash",
    water: "border-jal/40 bg-jal-wash",
  }[tone];
  const head = { quiet: "text-ink", warn: "text-anar", water: "text-jal-ink" }[tone];
  return (
    <section className={cn("rounded-[var(--radius-card)] border p-5", tint)}>
      <h4 className={cn("flex items-center gap-2 text-[1.02rem] font-semibold font-[family-name:var(--font-display)]", head)}>
        {icon}
        {title}
      </h4>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Which reading decided this — the farmer's own card, or the taluka's. */
function SourceTag({ farmer, mr }: { farmer: boolean; mr: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium",
        farmer ? "bg-leaf-wash text-leaf-deep" : "bg-surface text-ink-mute ring-1 ring-line",
      )}
    >
      {farmer
        ? (mr ? "तुमच्या पत्रिकेतून" : "your card")
        : (mr ? "तालुक्याच्या सरासरीतून" : "taluka average")}
    </span>
  );
}

export function ConfidenceNote({
  recommendation: r,
  mr,
}: {
  recommendation: Recommendation;
  mr: boolean;
}) {
  const salty = r.context.ec_card_high === true;
  if (r.confident && !r.water_limited && !salty) return null;
  const sensitive = (r.context.ec_least_tolerant ?? [])
    .map((name) => {
      const crop = cropFromEngine(name);
      return crop ? (mr ? crop.mr : crop.en) : name;
    })
    .join(", ");
  return (
    <div className="mt-6 grid gap-4">
      {!r.confident ? (
        <Block
          title={mr ? "हा तालुका वेगळा आहे" : "This taluka is unlike the training data"}
          tone="warn"
          icon={<AlertTriangle className="size-4.5" strokeWidth={1.8} aria-hidden />}
        >
          <p className="text-[14px] leading-relaxed text-anar">
            {r.abstention_reason ??
              (mr
                ? "शिकलेलं मॉडेल इथे गप्प बसलं आहे; शिफारस फक्त कृषिशास्त्राच्या नियमांवर आहे."
                : "The learned ranker has been suppressed here; the recommendation rests on the agronomic rules alone.")}
          </p>
        </Block>
      ) : null}
      {salty ? (
        <Block
          title={mr ? "पत्रिकेवर क्षारता (EC) जास्त आहे" : "Your card shows salinity (EC) above its range"}
          tone="warn"
          icon={<AlertTriangle className="size-4.5" strokeWidth={1.8} aria-hidden />}
        >
          <p className="text-[14px] leading-relaxed text-anar">
            {mr
              ? "यावरून एकही पीक बाद केलेलं नाही — पत्रिकेवरची मर्यादा ओलांडली म्हणजे जमीन क्षारपड आहे असं नाही. पण क्षार सहन न होणाऱ्या पिकांबाबत जपून राहा, पाण्याचा निचरा सुधारा आणि कृषी विज्ञान केंद्राचा सल्ला घ्या."
              : "No crop was ruled out on this alone — being over the card's printed range does not make the field saline. Still, be careful with salt-sensitive crops, keep drainage good, and ask your KVK."}
            {sensitive
              ? mr
                ? ` तुमच्या यादीतली कमी क्षार सहन करणारी पिकं: ${sensitive}.`
                : ` In your list, the least salt-tolerant are: ${sensitive}.`
              : ""}
          </p>
        </Block>
      ) : null}
      {r.water_limited ? (
        <Block
          title={mr ? "पाण्याशिवाय बरंच काही पिकणार नाही" : "Most of what suits here needs water supplied"}
          tone="water"
          icon={<Droplets className="size-4.5" strokeWidth={1.8} aria-hidden />}
        >
          <p className="text-[14px] leading-relaxed text-jal-ink">
            {mr
              ? "इथे कोरडवाहू पर्याय मर्यादित आहेत. वर 'सिंचन आहे' निवडून पुन्हा बघा — उत्तर बदलेल."
              : "Rainfed options are limited on this land. Switch the water setting above to irrigated and ask again — the answer changes."}
          </p>
        </Block>
      ) : null}
    </div>
  );
}

export function Micronutrients({
  items,
  mr,
}: {
  items: MicronutrientCorrection[];
  mr: boolean;
}) {
  if (!items.length) return null;
  return (
    <Block title={mr ? "सूक्ष्म अन्नद्रव्यं" : "Micronutrients"}>
      <p className="mb-3 text-[13px] leading-relaxed text-ink-mute">
        {mr
          ? "सरकारी तक्ता ही सोडून देतो. प्रत्येकावर तो आकडा कुठून आला ते लिहिलं आहे."
          : "The government dose table omits these. Each one says which reading it came from."}
      </p>
      <ul className="grid gap-3">
        {items.map((m) => (
          <li key={m.component} className="border-b border-line pb-3 last:border-0 last:pb-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[15px] font-semibold text-ink">{m.component}</span>
              <span className="tnum text-[14px] text-ink-soft">
                {m.rate_kg_ha} kg/ha {m.product}
              </span>
              <SourceTag farmer={m.source === "farmer soil health card"} mr={mr} />
              {m.priority === "high" ? (
                <span className="rounded-full bg-anar-wash px-2 py-0.5 text-[11px] font-medium text-anar">
                  {mr ? "आधी हे" : "first"}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-mute">
              {m.note}
              {m.deficient_pct != null
                ? ` ${mr ? "तालुक्यात" : "Taluka"}: ${m.deficient_pct}% ${mr ? "नमुने कमी" : "of samples deficient"}.`
                : ""}
            </p>
          </li>
        ))}
      </ul>
    </Block>
  );
}

export function VetoedCrops({
  vetoed,
  notAssessable,
  mr,
}: {
  vetoed: VetoedCrop[];
  notAssessable: NotAssessableCrop[];
  mr: boolean;
}) {
  if (!vetoed.length && !notAssessable.length) return null;
  const nameOf = (engineCrop: string, marathi?: string | null) => {
    const crop = cropFromEngine(engineCrop);
    if (crop) return mr ? crop.mr : crop.en;
    return mr ? cleanEngineMarathi(marathi ?? null) ?? engineCrop : engineCrop;
  };

  return (
    <Block title={mr ? "हे नाही, आणि का नाही" : "Ruled out, and why"}>
      {vetoed.length ? (
        <ul className="grid gap-2.5">
          {vetoed.map((v) => (
            <li key={v.crop} className="border-b border-line pb-2.5 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[14.5px] font-medium text-ink">{nameOf(v.crop)}</span>
                <span className="rounded-full bg-anar-wash px-2 py-0.5 text-[11px] font-medium text-anar">
                  {factorLabel(v.limiting_factor, mr)}
                </span>
              </div>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-mute">{v.reason}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {notAssessable.length ? (
        <div className={cn(vetoed.length && "mt-4 border-t border-line pt-3")}>
          <p className="text-[13px] font-medium text-ink-soft">
            {mr ? "यांबद्दल काही सांगता येत नाही" : "Nothing can be said about these"}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-mute">
            {notAssessable.map((n) => n.crop).join(", ")} —{" "}
            {mr
              ? "सरकारी आकडेवारीतले गठ्ठे, वेगळं पीक नाही."
              : "aggregates in the government statistics rather than a crop with an envelope of its own."}
          </p>
        </div>
      ) : null}
    </Block>
  );
}

export function ContextAudit({
  context: c,
  soilTestSource,
  soilClass,
  mr,
}: {
  context: RecommendContext;
  soilTestSource: string;
  soilClass: string;
  mr: boolean;
}) {
  const farmer = soilTestSource === "farmer soil health card";
  const rows: { label: string; value: string; tag?: React.ReactNode }[] = [
    { label: mr ? "वार्षिक पाऊस" : "Annual rainfall", value: `${c.annual_rainfall_mm} mm` },
    {
      label: mr ? "हंगामातला पाऊस" : "Season rainfall",
      value: c.season_rainfall_mm == null ? "—" : `${c.season_rainfall_mm} mm`,
    },
    { label: mr ? "मुळांच्या थरातलं पाणी" : "Root-zone water", value: `${c.rootzone_awc_mm} mm` },
    { label: mr ? "जमिनीची खोली" : "Soil depth", value: `${c.soil_depth_mm} mm` },
    { label: mr ? "वाढीचा काळ" : "Growing period", value: `${c.lgp_days} ${mr ? "दिवस" : "days"}` },
    { label: mr ? "कोरडेपणा निर्देशांक" : "Aridity index", value: c.aridity_index.toFixed(2) },
    {
      label: mr ? "सामू (pH)" : "pH",
      value: String(c.ph_used),
      tag: <SourceTag farmer={c.ph_source === "farmer soil health card"} mr={mr} />,
    },
    {
      label: mr ? "क्षारता" : "Salinity",
      value: `${c.ec_saline_pct_used}%`,
      tag: <SourceTag farmer={c.ec_source === "farmer soil health card"} mr={mr} />,
    },
    {
      label: "N · P · K · OC",
      value: [c.soil_test.N, c.soil_test.P, c.soil_test.K, c.soil_test.OC]
        .map((v) => (v == null ? "—" : v))
        .join(" · "),
      tag: <SourceTag farmer={farmer} mr={mr} />,
    },
  ];

  return (
    <Block
      title={mr ? "कोणते आकडे वापरले" : "Every number this used"}
      icon={<Info className="size-4.5" strokeWidth={1.8} aria-hidden />}
    >
      <p className="mb-3 text-[13px] leading-relaxed text-ink-mute">
        {mr
          ? `मातीचा वर्ग: ${soilClass}. तालुक्यातले ${c.shc_samples} नमुने.`
          : `Fertility class ${soilClass}, from ${c.shc_samples} Soil Health Card samples in this taluka.`}
      </p>
      <dl className="grid gap-1.5">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-line pb-1.5 last:border-0"
          >
            <dt className="text-[13.5px] text-ink-soft">{r.label}</dt>
            <dd className="flex items-baseline gap-2">
              {r.tag}
              <span className="tnum text-[13.5px] font-medium text-ink">{r.value}</span>
            </dd>
          </div>
        ))}
      </dl>
    </Block>
  );
}
