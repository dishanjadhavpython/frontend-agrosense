"use client";

import { AlertTriangle, Droplets, Info } from "lucide-react";
import { cn } from "@/lib/cn";
import { cropFromEngine } from "@/data/cropOntology";
import type {
  MicronutrientCorrection,
  RecommendContext,
  Recommendation,
} from "@/lib/recommendTypes";

/**
 * The parts of the answer that are not a crop: how confident the engine is,
 * what the soil is short of, and — the one that matters most — which number
 * came from whose measurement.
 *
 * None of this is an appendix. "Your zinc is low, the taluka's manganese is"
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
    <section className={cn("rounded-[var(--radius-card)] border p-5 sm:p-6", tint)}>
      <h4 className={cn("flex items-center gap-2 text-[1.05rem] font-semibold font-[family-name:var(--font-display)]", head)}>
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
          title={mr ? "हा तालुका वेगळा आहे" : "This taluka is unlike the ones the model learned from"}
          tone="warn"
          icon={<AlertTriangle className="size-4.5" strokeWidth={1.8} aria-hidden />}
        >
          <p className="text-[14px] leading-relaxed text-anar">
            {mr
              ? "म्हणून इथे शिकलेलं मॉडेल वापरलेलं नाही; पिकांचा क्रम फक्त कृषिशास्त्राच्या नियमांवर आहे."
              : "So the learned model is not used here; the ranking rests on the agronomy rules alone."}
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
              : "No crop was dropped for this alone — being over the card's printed range does not make the field saline. Still, be careful with salt-sensitive crops, keep drainage good, and ask your KVK."}
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

const NUTRIENT: Record<string, { mr: string; en: string }> = {
  S: { mr: "गंधक", en: "Sulphur" },
  Fe: { mr: "लोह", en: "Iron" },
  Zn: { mr: "जस्त", en: "Zinc" },
  Cu: { mr: "तांबे", en: "Copper" },
  B: { mr: "बोरॉन", en: "Boron" },
  Mn: { mr: "मंगल", en: "Manganese" },
};

const PRODUCT: Record<string, { mr: string; en: string }> = {
  FeSO4: { mr: "फेरस सल्फेट", en: "ferrous sulphate" },
  "ZnSO4.7H2O": { mr: "झिंक सल्फेट", en: "zinc sulphate" },
  CuSO4: { mr: "कॉपर सल्फेट", en: "copper sulphate" },
  MnSO4: { mr: "मँगनीज सल्फेट", en: "manganese sulphate" },
  Borax: { mr: "बोरॅक्स", en: "borax" },
  Gypsum: { mr: "जिप्सम", en: "gypsum" },
};

/**
 * The engine's note for each correction, in plain words and in both
 * languages. Its own strings are English, written for the people building the
 * engine — one ends "see zn_lockout" — and a Marathi page printed them as-is.
 */
const NOTE: Record<string, { mr: string; en: string }> = {
  S: {
    mr: "किंवा DAP ऐवजी SSP वापरा — त्यात गंधक असतो, त्यामुळे वेगळा खर्च नाही.",
    en: "Or use SSP instead of DAP — it carries sulphur, so this costs nothing extra.",
  },
  Zn: {
    mr: "मातीत मिसळून द्या. अल्कधर्मी जमिनीत जस्त अडकून राहतं आणि कमतरता वाढते.",
    en: "Mix it into the soil. On alkaline soil zinc gets locked up and the shortage gets worse.",
  },
  Fe: {
    mr: "चुनखडीयुक्त जमिनीत मातीत देण्यापेक्षा ०.५% फवारणी जास्त परिणामकारक ठरते.",
    en: "On limey (calcareous) soil, a 0.5% spray on the leaves works better than soil application.",
  },
  B: {
    mr: "यापेक्षा जास्त कधीही देऊ नका — जास्त बोरॉन पिकाला विषारी ठरतो.",
    en: "Never use more than this — too much boron poisons the crop.",
  },
  Mn: {
    mr: "बहुतेकदा जस्तासोबतच कमी असतं.",
    en: "Often short together with zinc.",
  },
  Cu: {
    mr: "महाराष्ट्रात क्वचितच कमी असतं — ९८% तालुक्यांत पुरेसं आहे.",
    en: "Rarely short in Maharashtra — 98% of talukas have enough.",
  },
};

const ACRES_PER_HA = 2.471;

/** The dose table's fertility classes. */
const FERTILITY_MR: Record<string, string> = { Low: "कमी", Medium: "मध्यम", High: "जास्त" };

export function Micronutrients({
  items,
  mr,
}: {
  items: MicronutrientCorrection[];
  mr: boolean;
}) {
  if (!items.length) return null;
  return (
    <Block title={mr ? "सूक्ष्म अन्नद्रव्यं — मातीत कमी असलेली" : "Micronutrients your soil is short of"}>
      <p className="mb-3 text-[13px] leading-relaxed text-ink-mute">
        {mr
          ? "सरकारी खत तक्त्यात हे नसतात. प्रत्येकावर तो आकडा कुठून आला ते लिहिलं आहे."
          : "The government dose table leaves these out. Each one says which reading it came from."}
      </p>
      <ul className="grid gap-3">
        {items.map((m) => {
          const nutrient = NUTRIENT[m.component];
          const product = PRODUCT[m.product];
          const acre = m.rate_kg_ha / ACRES_PER_HA;
          return (
            <li key={m.component} className="border-b border-line pb-3 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-[15px] font-semibold text-ink">
                    {nutrient ? (mr ? nutrient.mr : nutrient.en) : m.component}
                  </span>
                  <SourceTag farmer={m.source === "farmer soil health card"} mr={mr} />
                  {m.priority === "high" ? (
                    <span className="rounded-full bg-anar-wash px-2 py-0.5 text-[11px] font-medium text-anar">
                      {mr ? "आधी हे" : "do this first"}
                    </span>
                  ) : null}
                </span>
                <span className="tnum text-[14px] text-ink">
                  <strong className="font-semibold">{acre.toFixed(acre < 10 ? 1 : 0)}</strong>{" "}
                  {mr ? "किलो/एकर" : "kg/acre"}{" "}
                  <span className="text-ink-mute">
                    {product ? (mr ? product.mr : product.en) : m.product}
                  </span>
                </span>
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-mute">
                {m.deficient_pct != null
                  ? mr
                    ? `तालुक्यातले ${Math.round(m.deficient_pct)}% नमुने यात कमी आहेत. `
                    : `${Math.round(m.deficient_pct)}% of the taluka's samples are short of it. `
                  : ""}
                {NOTE[m.component]
                  ? (mr ? NOTE[m.component].mr : NOTE[m.component].en)
                  : mr ? "" : m.note}
              </p>
            </li>
          );
        })}
      </ul>
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
  // Only what a farmer can check against their own field. The aridity index,
  // root-zone water capacity and rain-fed growing days the engine also used
  // are left out: they feed the factor scores, which the meters above already
  // say in words, and as raw figures nobody could check them.
  const rows: { label: string; value: string; tag?: React.ReactNode }[] = [
    {
      label: mr ? "या हंगामातला पाऊस" : "Rain this season",
      value: c.season_rainfall_mm == null ? "—" : `${Math.round(c.season_rainfall_mm)} mm`,
    },
    { label: mr ? "वर्षभराचा पाऊस" : "Rain in a year", value: `${Math.round(c.annual_rainfall_mm)} mm` },
    { label: mr ? "मातीची खोली" : "Soil depth", value: `${Math.round(c.soil_depth_mm / 10)} cm` },
    {
      label: mr ? "सामू (pH)" : "pH",
      value: String(c.ph_used),
      tag: <SourceTag farmer={c.ph_source === "farmer soil health card"} mr={mr} />,
    },
    {
      label: mr ? "खारट नमुने" : "Salty samples",
      value: `${c.ec_saline_pct_used}%`,
      tag: <SourceTag farmer={c.ec_source === "farmer soil health card"} mr={mr} />,
    },
    {
      label: mr ? "नत्र · स्फुरद · पालाश · सेंद्रिय कर्ब" : "N · P · K · organic carbon",
      value: [c.soil_test.N, c.soil_test.P, c.soil_test.K, c.soil_test.OC]
        .map((v) => (v == null ? "—" : v))
        .join(" · "),
      tag: <SourceTag farmer={farmer} mr={mr} />,
    },
  ];

  return (
    <Block
      title={mr ? "हे आकडे कुठून आले" : "Where these numbers came from"}
      icon={<Info className="size-4.5" strokeWidth={1.8} aria-hidden />}
    >
      <p className="mb-3 text-[13px] leading-relaxed text-ink-mute">
        {mr
          ? `तुमच्या पत्रिकेतले आकडे आणि तालुक्यातल्या ${c.shc_samples} माती आरोग्य पत्रिकांची सरासरी. सुपीकता वर्ग: ${FERTILITY_MR[soilClass] ?? soilClass}.`
          : `Your card, and the average of ${c.shc_samples} Soil Health Cards from this taluka. Fertility class ${soilClass}.`}
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
