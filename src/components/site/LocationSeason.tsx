"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, ChevronDown } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { title as titleCase } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { soilTestFromCard } from "@/lib/soilTest";
import type { CardReadResult, ExtractedMetric, MetricKey } from "@/lib/cardTypes";
import type { RecommendMeta } from "@/app/api/recommend/meta/route";
import type { Season, ShcStatus, SoilTestIn, TalukaRow } from "@/lib/recommendTypes";
import { TalukaMap } from "./TalukaMap";

/**
 * Where the taluka, season and (optionally) the card's own readings go in.
 *
 * Replaces the old eight-field form. That form asked for four numbers the
 * engine no longer needs typed by hand at all — climate and soil physical
 * context now come from the taluka the farmer picks, not from a blank field
 * condition box. What's left to ask for is genuinely new: *where* the field
 * is and *when* it's being sown, since nothing upstream of this step has
 * ever asked either question.
 *
 * Only district, taluka and season are required — the engine already falls
 * back to the taluka's own Soil Health Card distribution when a farmer has
 * no card in hand, so a location-only "quick check" is a real, supported use
 * of this same form, not a degraded one.
 */

const SEASONS: Season[] = ["Kharif", "Rabi", "Summer", "Whole Year"];
const SEASON_LABEL: Record<Season, { mr: string; en: string }> = {
  Kharif: { mr: "खरीप", en: "Kharif" },
  Rabi: { mr: "रब्बी", en: "Rabi" },
  Summer: { mr: "उन्हाळी", en: "Summer" },
  "Whole Year": { mr: "बारमाही", en: "Whole Year" },
};

export type LocationSeasonValues = {
  district: string;
  taluka: string;
  season: Season | "";
  irrigated: boolean;
  soilTest: SoilTestIn;
};

export function initialLocationSeasonValues(card: CardReadResult | null): LocationSeasonValues {
  return {
    district: "",
    taluka: "",
    season: "",
    irrigated: false,
    soilTest: card ? soilTestFromCard(card) : {},
  };
}

export function isLocationSeasonComplete(values: LocationSeasonValues): boolean {
  return Boolean(values.district && values.taluka && values.season);
}

export function LocationSeason({
  card,
  values,
  onChange,
  onSubmit,
  submitting,
  failure,
}: {
  /** The read card, if there is one — only for showing where a prefilled
   *  reading came from. Prefill itself already happened when `values` was
   *  created (`initialLocationSeasonValues`); this component never re-reads it. */
  card: CardReadResult | null;
  values: LocationSeasonValues;
  onChange: (patch: Partial<LocationSeasonValues>) => void;
  onSubmit: () => void;
  submitting: boolean;
  failure: string | null;
}) {
  const { lang } = useLang();
  const mr = lang === "mr";

  const [meta, setMeta] = useState<RecommendMeta | null>(null);
  const [metaFailed, setMetaFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/recommend/meta")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("offline"))))
      .then((data: RecommendMeta) => { if (!cancelled) setMeta(data); })
      .catch(() => { if (!cancelled) setMetaFailed(true); });
    return () => { cancelled = true; };
  }, []);

  const districts = meta?.talukas.districts ?? [];
  const talukasInDistrict = useMemo(
    () => (meta?.talukas.talukas ?? []).filter((t) => t.District === values.district),
    [meta, values.district],
  );

  const [attempted, setAttempted] = useState(false);
  const [showSoilTest, setShowSoilTest] = useState(false);
  const complete = isLocationSeasonComplete(values);

  const attempt = () => {
    setAttempted(true);
    if (complete) onSubmit();
  };

  const setSoilTest = (patch: Partial<SoilTestIn>) =>
    onChange({ soilTest: { ...values.soilTest, ...patch } });

  // The engine's own casing is what gets stored. District and taluka are join
  // keys — `/talukas` returns them upper-cased and `pipeline.py` upper-cases
  // whatever it is sent — so keeping them as they arrived means the values in
  // `values` compare directly against `meta.talukas`. `titleCase` is applied
  // at render and nowhere else, which is what `format.ts` says it is for.
  const pickTaluka = (row: TalukaRow) =>
    onChange({ district: row.District, taluka: row.Taluka });

  return (
    <div className="border-t-2 border-ink p-5 sm:p-6">
      <h3 className="section-head text-[1.35rem] text-ink sm:text-[1.6rem]">
        {mr ? "शेत कुठे आहे, कधी पेरणार" : "Where the field is, and when"}
      </h3>
      <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-ink-soft">
        {mr
          ? "तालुका आणि हंगाम निवडा. हवामान आणि मातीची पार्श्वभूमी तिथूनच येते — ती टाइप करायची गरज नाही."
          : "Pick the taluka and the season. Climate and soil background come from there — nothing to type for those."}
      </p>

      {metaFailed ? (
        <p role="alert" className="mt-4 rounded-[var(--radius-card)] border border-anar/50 bg-anar-wash px-4 py-3 text-[14px] text-anar">
          {mr
            ? "तालुक्यांची यादी मिळाली नाही. जोडणी तपासून पान पुन्हा लोड करा."
            : "Could not load the taluka list. Check your connection and reload."}
        </p>
      ) : !meta ? (
        <p className="mt-4 text-[14px] text-ink-mute">{mr ? "तालुके लोड होत आहेत…" : "Loading talukas…"}</p>
      ) : (
        <>
          <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <TalukaMap
              atlas={meta.atlas}
              value={values.district && values.taluka ? { district: values.district, taluka: values.taluka } : null}
              onChange={pickTaluka}
              mr={mr}
            />

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-[14px] font-semibold text-ink" htmlFor="ls-district">
                  {mr ? "जिल्हा" : "District"}
                </label>
                <select
                  id="ls-district"
                  value={values.district}
                  onChange={(e) => onChange({ district: e.target.value, taluka: "" })}
                  className="tnum mt-1.5 min-h-12 w-full rounded-[12px] border border-line bg-surface px-3.5 text-[16px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf"
                >
                  <option value="">{mr ? "निवडा" : "Choose one"}</option>
                  {districts.map((d) => (
                    <option key={d} value={d}>{titleCase(d)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[14px] font-semibold text-ink" htmlFor="ls-taluka">
                  {mr ? "तालुका" : "Taluka"}
                </label>
                <select
                  id="ls-taluka"
                  value={values.taluka}
                  onChange={(e) => {
                    const row = talukasInDistrict.find((t) => t.Taluka === e.target.value);
                    if (row) pickTaluka(row);
                  }}
                  disabled={!values.district}
                  className="tnum mt-1.5 min-h-12 w-full rounded-[12px] border border-line bg-surface px-3.5 text-[16px] text-ink disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf"
                >
                  <option value="">{values.district ? (mr ? "निवडा" : "Choose one") : (mr ? "आधी जिल्हा निवडा" : "Pick a district first")}</option>
                  {talukasInDistrict.map((t) => (
                    <option key={t.Taluka} value={t.Taluka}>{titleCase(t.Taluka)}</option>
                  ))}
                </select>
                <p className="mt-1.5 text-[12px] text-ink-mute">
                  {mr ? "किंवा नकाशावर तालुका निवडा." : "Or pick the taluka on the map."}
                </p>
              </div>

              <div>
                <p className="text-[14px] font-semibold text-ink">{mr ? "हंगाम" : "Season"}</p>
                <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-label={mr ? "हंगाम" : "Season"}>
                  {SEASONS.map((s) => (
                    <Pill
                      key={s}
                      selected={values.season === s}
                      onClick={() => onChange({ season: s })}
                    >
                      {mr ? SEASON_LABEL[s].mr : SEASON_LABEL[s].en}
                    </Pill>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[14px] font-semibold text-ink">{mr ? "पाणी" : "Water"}</p>
                <div className="mt-1.5 flex gap-2" role="radiogroup" aria-label={mr ? "सिंचन" : "Irrigation"}>
                  <Pill selected={!values.irrigated} onClick={() => onChange({ irrigated: false })}>
                    {mr ? "फक्त पावसावर" : "Rainfed"}
                  </Pill>
                  <Pill selected={values.irrigated} onClick={() => onChange({ irrigated: true })}>
                    {mr ? "सिंचन आहे" : "Irrigated"}
                  </Pill>
                </div>
              </div>
            </div>
          </div>

          {attempted && !complete ? (
            <p className="mt-4 text-[14px] text-anar">
              {mr ? "जिल्हा, तालुका आणि हंगाम निवडा." : "Choose a district, taluka and season."}
            </p>
          ) : null}

          {/* ---- The card's own twelve, editable, optional. ------------- */}
          <button
            type="button"
            onClick={() => setShowSoilTest((v) => !v)}
            className="mt-7 flex min-h-12 w-full items-center justify-between border-t border-line pt-6 text-left"
          >
            <span>
              <span className="eyebrow text-ink-mute">
                {mr ? "माती आरोग्य पत्रिकेचे आकडे" : "Soil Health Card values"}
              </span>
              <span className="mt-1 block max-w-[56ch] text-[13px] leading-relaxed text-ink-mute">
                {mr
                  ? "ऐच्छिक. दिल्यास तुमच्या शेताचा आकडा तालुक्याच्या सरासरीपेक्षा वापरला जातो."
                  : "Optional. Given, your field's own reading is used instead of the taluka average, field by field."}
              </span>
            </span>
            <ChevronDown
              className={cn("size-5 shrink-0 text-ink-mute transition-transform", showSoilTest && "rotate-180")}
              strokeWidth={1.8}
              aria-hidden
            />
          </button>

          {showSoilTest ? (
            <SoilTestPanel card={card} value={values.soilTest} onChange={setSoilTest} mr={mr} />
          ) : null}

          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button
              type="button"
              variant={complete ? "primary" : "secondary"}
              onClick={attempt}
              disabled={submitting}
              className="w-full disabled:cursor-not-allowed sm:w-auto sm:min-w-[13rem]"
            >
              {submitting ? (mr ? "शिफारस काढत आहे…" : "Getting your recommendation…") : (mr ? "शिफारस पाहा" : "See the recommendation")}
              {complete && !submitting ? <ArrowRight className="size-5" strokeWidth={1.8} aria-hidden /> : null}
            </Button>
          </div>

          {failure ? (
            <p role="alert" className="mt-4 rounded-[var(--radius-card)] border border-anar/50 bg-anar-wash px-4 py-3 text-[14px] leading-relaxed text-anar">
              {failure}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function Pill({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "min-h-10 rounded-full border px-4 text-[14px] font-medium transition-colors",
        selected
          ? "border-ink bg-ink text-paper dark:border-leaf-5 dark:bg-leaf-5 dark:text-on-light"
          : "border-line bg-surface text-ink hover:bg-leaf-wash",
      )}
    >
      {children}
    </button>
  );
}

/* ---- the twelve card values, editable ----------------------------------- */

const NUMERIC_FIELDS: {
  key: "n_kg_ha" | "p_kg_ha" | "k_kg_ha" | "oc_pct" | "ph";
  metricKey: MetricKey;
  mr: string; en: string; unit: string; min: number; max: number; step: string;
}[] = [
  { key: "n_kg_ha", metricKey: "available_nitrogen", mr: "नत्र (N)", en: "Nitrogen (N)", unit: "kg/ha", min: 0, max: 2000, step: "0.01" },
  { key: "p_kg_ha", metricKey: "available_phosphorus", mr: "स्फुरद (P)", en: "Phosphorus (P)", unit: "kg/ha", min: 0, max: 500, step: "0.01" },
  { key: "k_kg_ha", metricKey: "available_potassium", mr: "पालाश (K)", en: "Potassium (K)", unit: "kg/ha", min: 0, max: 2000, step: "0.01" },
  { key: "oc_pct", metricKey: "organic_carbon", mr: "सेंद्रिय कर्ब (OC)", en: "Organic carbon (OC)", unit: "%", min: 0, max: 20, step: "0.01" },
  { key: "ph", metricKey: "ph", mr: "सामू (pH)", en: "pH", unit: "", min: 2, max: 12, step: "0.01" },
];

const STATUS_FIELDS: {
  key: "ec_status" | "sulphur_status" | "zinc_status" | "iron_status" | "copper_status" | "boron_status" | "manganese_status";
  metricKey: MetricKey;
  mr: string; en: string;
}[] = [
  { key: "ec_status", metricKey: "ec", mr: "क्षारता (EC)", en: "Salinity (EC)" },
  { key: "sulphur_status", metricKey: "available_sulphur", mr: "गंधक (S)", en: "Sulphur (S)" },
  { key: "zinc_status", metricKey: "available_zinc", mr: "जस्त (Zn)", en: "Zinc (Zn)" },
  { key: "iron_status", metricKey: "available_iron", mr: "लोह (Fe)", en: "Iron (Fe)" },
  { key: "copper_status", metricKey: "available_copper", mr: "तांबे (Cu)", en: "Copper (Cu)" },
  { key: "boron_status", metricKey: "available_boron", mr: "बोरॉन (B)", en: "Boron (B)" },
  { key: "manganese_status", metricKey: "available_manganese", mr: "मंगल (Mn)", en: "Manganese (Mn)" },
];

const STATUS_LABEL: Record<ShcStatus, { mr: string; en: string }> = {
  low: { mr: "कमी", en: "Low" },
  normal: { mr: "योग्य", en: "Normal" },
  high: { mr: "जास्त", en: "High" },
};

function SoilTestPanel({
  card,
  value,
  onChange,
  mr,
}: {
  card: CardReadResult | null;
  value: SoilTestIn;
  onChange: (patch: Partial<SoilTestIn>) => void;
  mr: boolean;
}) {
  const metrics = useMemo(
    () => new Map<string, ExtractedMetric>((card?.soil_metrics ?? []).map((m) => [m.key, m])),
    [card],
  );

  return (
    <div className="mt-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {NUMERIC_FIELDS.map((spec) => {
          const metric = metrics.get(spec.metricKey);
          const raw = value[spec.key];
          return (
            <div key={spec.key}>
              <label className="flex items-baseline gap-1.5 text-[13px] font-semibold text-ink" htmlFor={`ls-${spec.key}`}>
                <span>{mr ? spec.mr : spec.en}</span>
                {spec.unit ? <span className="font-mono text-[11px] font-normal text-ink-mute">{spec.unit}</span> : null}
              </label>
              <input
                id={`ls-${spec.key}`}
                type="number"
                inputMode="decimal"
                step={spec.step}
                min={spec.min}
                max={spec.max}
                value={raw ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  onChange({ [spec.key]: v === "" ? undefined : Number(v) } as Partial<SoilTestIn>);
                }}
                className={cn(
                  "tnum mt-1.5 min-h-11 w-full rounded-[10px] border bg-surface px-3 text-[15px] text-ink",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf",
                  metric?.confidence === "unconfirmed" ? "border-haldi/60 bg-haldi-wash" : "border-line",
                )}
              />
              <p className="mt-1 text-[11px] leading-snug text-ink-mute">
                {metric
                  ? metric.confidence === "unconfirmed"
                    ? (
                      <span className="inline-flex items-start gap-1 text-haldi-ink">
                        <AlertTriangle className="mt-px size-3 shrink-0" strokeWidth={2} aria-hidden />
                        {mr ? "फोटोतून वाचलं — ताडून पहा." : "Read from a photo — check it."}
                      </span>
                    )
                    : mr ? "पत्रिकेवरून" : "From your card"
                  : mr ? "पत्रिकेत नाही — रिकामं ठेवल्यास तालुक्याची सरासरी वापरली जाईल." : "Not on the card — left blank, the taluka average is used."}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STATUS_FIELDS.map((spec) => {
          const metric = metrics.get(spec.metricKey);
          const current = value[spec.key];
          return (
            <div key={spec.key}>
              <p className="text-[13px] font-semibold text-ink">{mr ? spec.mr : spec.en}</p>
              <div className="mt-1.5 flex gap-1.5" role="radiogroup" aria-label={mr ? spec.mr : spec.en}>
                {(["low", "normal", "high"] as ShcStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={current === s}
                    onClick={() => onChange({ [spec.key]: current === s ? undefined : s } as Partial<SoilTestIn>)}
                    className={cn(
                      "min-h-9 flex-1 rounded-[8px] border px-2 text-[12px] font-medium transition-colors",
                      current === s
                        ? "border-ink bg-ink text-paper dark:border-leaf-5 dark:bg-leaf-5 dark:text-on-light"
                        : "border-line bg-surface text-ink-soft hover:bg-leaf-wash",
                    )}
                  >
                    {mr ? STATUS_LABEL[s].mr : STATUS_LABEL[s].en}
                  </button>
                ))}
              </div>
              {metric ? (
                <p className="mt-1 text-[11px] text-ink-mute">
                  {mr ? "पत्रिकेवर: " : "Card reads: "}
                  {mr ? STATUS_LABEL[metric.status_code].mr : STATUS_LABEL[metric.status_code].en}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
