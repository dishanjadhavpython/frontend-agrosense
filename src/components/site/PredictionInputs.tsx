"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import type { CardReadResult, ExtractedMetric, MetricKey } from "@/lib/cardTypes";

/**
 * The eight numbers, before anybody predicts anything.
 *
 * This section exists because of what the prediction path used to do with the
 * blanks. Four field conditions had server-side defaults — 26°C, 68% humidity,
 * 110mm rainfall, 34% soil moisture — and nothing ever sent real ones, so every
 * recommendation this product has made was computed for a field that does not
 * exist. A missing nitrogen became 0, a missing pH became 6.5, and a farmer
 * reading the answer had no way to tell which of their numbers were theirs.
 *
 * So the numbers are put on screen and handed back to the person who owns them.
 * Two groups, because they have two different provenances and two different
 * failure modes:
 *
 *   * **Off the card** — prefilled, and editable precisely because they might
 *     be wrong. On a clean render of the test card, OCR reads nitrogen 245.15
 *     as 945.15: in range, entirely plausible, and it flips the advice from
 *     "apply urea" to "apply none". The printed range sits beside each field so
 *     there is something to check against without leaving the page.
 *   * **The field conditions** — blank, and required. Deliberately not
 *     prefilled from the weather panel: that feed is fixed to Baramati, and a
 *     number nobody typed for their own plot is the thing being removed here.
 *
 * Each group is labelled with what it decides, because that is not guessable
 * and it changed. N/P/K reach the fertilizer, not the crop: the crop model was
 * retrained without them once its N/P/K columns turned out to be the crop's
 * recommended fertilizer dose rather than a soil test. pH and the three field
 * conditions choose the crop; the nutrients choose the bag, by comparison with
 * the range printed on the card beside them.
 *
 * Nothing is validated towards an expected value. The bounds below are
 * plausibility limits that catch a misplaced decimal point — pH 3.6 is unusual
 * and allowed, pH 36 is a typing mistake.
 */

type FieldName =
  | "nitrogen"
  | "phosphorus"
  | "potassium"
  | "ph"
  | "temperature"
  | "humidity"
  | "rainfall"
  | "moisture";

export type PredictionValues = Record<FieldName, string>;

type Spec = {
  name: FieldName;
  mr: string;
  en: string;
  unit: string;
  min: number;
  max: number;
  step: string;
  /** Only on the card group — which of the twelve this field is filled from. */
  metricKey?: MetricKey;
};

/** Bounds mirror `REQUIRED` in `src/app/api/predict/route.ts`, which is the
 *  actual rule; these are the courtesy copy that stops a farmer submitting. */
const CARD_FIELDS: Spec[] = [
  { name: "nitrogen", mr: "नत्र (N)", en: "Nitrogen (N)", unit: "kg/ha", min: 0, max: 2000, step: "0.01", metricKey: "available_nitrogen" },
  { name: "phosphorus", mr: "स्फुरद (P)", en: "Phosphorus (P)", unit: "kg/ha", min: 0, max: 500, step: "0.01", metricKey: "available_phosphorus" },
  { name: "potassium", mr: "पालाश (K)", en: "Potassium (K)", unit: "kg/ha", min: 0, max: 2000, step: "0.01", metricKey: "available_potassium" },
  { name: "ph", mr: "सामू (pH)", en: "pH", unit: "", min: 2, max: 12, step: "0.01", metricKey: "ph" },
];

const FIELD_FIELDS: Spec[] = [
  { name: "temperature", mr: "तापमान", en: "Temperature", unit: "°C", min: -10, max: 60, step: "0.1" },
  { name: "humidity", mr: "हवेतला ओलावा", en: "Air humidity", unit: "%", min: 0, max: 100, step: "0.1" },
  { name: "rainfall", mr: "पाऊस", en: "Rainfall", unit: "mm", min: 0, max: 5000, step: "0.1" },
  { name: "moisture", mr: "मातीतला ओलावा", en: "Soil moisture", unit: "%", min: 0, max: 100, step: "0.1" },
];

const ALL_FIELDS = [...CARD_FIELDS, ...FIELD_FIELDS];

/** Prefill the four the card carries; leave everything else for the farmer. */
export function valuesFromCard(result: CardReadResult): PredictionValues {
  const byKey = new Map<string, ExtractedMetric>(
    result.soil_metrics.map((metric) => [metric.key, metric]),
  );
  const off = (key: MetricKey) => {
    const metric = byKey.get(key);
    return metric ? String(metric.reading) : "";
  };
  return {
    nitrogen: off("available_nitrogen"),
    phosphorus: off("available_phosphorus"),
    potassium: off("available_potassium"),
    ph: off("ph"),
    temperature: "",
    humidity: "",
    rainfall: "",
    moisture: "",
  };
}

function invalid(spec: Spec, raw: string): "empty" | "bounds" | null {
  if (raw.trim() === "") return "empty";
  const value = Number(raw);
  if (!Number.isFinite(value)) return "bounds";
  if (value < spec.min || value > spec.max) return "bounds";
  return null;
}

export function isComplete(values: PredictionValues): boolean {
  return ALL_FIELDS.every((spec) => invalid(spec, values[spec.name]) === null);
}

export function PredictionInputs({
  result,
  values,
  onChange,
  onPredict,
  predicting,
  soilPhotoMissing,
  failure,
}: {
  result: CardReadResult;
  values: PredictionValues;
  onChange: (name: FieldName, value: string) => void;
  onPredict: () => void;
  predicting: boolean;
  /** The models cannot run without it, and the button has to say so. */
  soilPhotoMissing: boolean;
  failure: string | null;
}) {
  const { t, lang } = useLang();
  const mr = lang === "mr";

  // Errors only after a first attempt. Marking eight fields red before anyone
  // has typed in them is scolding, not help.
  const [attempted, setAttempted] = useState(false);

  const metrics = useMemo(
    () => new Map<string, ExtractedMetric>(result.soil_metrics.map((m) => [m.key, m])),
    [result.soil_metrics],
  );

  const complete = isComplete(values);
  const ready = complete && !soilPhotoMissing;

  const attempt = () => {
    setAttempted(true);
    if (ready) onPredict();
  };

  return (
    <div className="border-t-2 border-ink p-5 sm:p-6">
      <h3 className="section-head text-[1.35rem] text-ink sm:text-[1.6rem]">
        {mr ? "अंदाजासाठी लागणारे आकडे" : "What the prediction runs on"}
      </h3>
      <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-ink-soft">
        {mr
          ? "हे आठ आकडे थेट मॉडेलमध्ये जातात. यातला एकही आम्ही स्वतःहून भरत नाही — पत्रिकेवरचे चार तपासून घ्या, आणि शेतातले चार तुम्हीच भरा."
          : "These eight numbers go straight into the models. Not one of them is filled in for you — check the four from your card, and enter the four for your field yourself."}
      </p>

      {/* ---- Group one: what the card said, for confirmation. ------------ */}
      <p className="eyebrow mt-7 text-ink-mute">{t("fldConfirm")}</p>
      <p className="mt-1.5 max-w-[62ch] text-[14px] leading-relaxed text-ink-mute">
        {mr
          ? "नत्र, स्फुरद आणि पालाश यांवरून कोणतं खत घ्यायचं — आणि कोणतं टाळायचं — हे ठरतं. प्रत्येक आकडा तुमच्याच पत्रिकेवरच्या मर्यादेशी ताडून बघितला जातो. सामू पिकाच्या शिफारशीत जातो."
          : "Nitrogen, phosphorus and potassium decide which bag to buy — and which to walk past — each judged against the range printed on your own card. pH goes to the crop recommendation."}
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CARD_FIELDS.map((spec) => {
          const metric = spec.metricKey ? metrics.get(spec.metricKey) : undefined;
          return (
            <Field
              key={spec.name}
              spec={spec}
              value={values[spec.name]}
              onChange={onChange}
              attempted={attempted}
              mr={mr}
              // Amber when OCR produced it, and named as not-found when the
              // card had no row for it at all.
              unconfirmed={metric?.confidence === "unconfirmed"}
              missing={!metric}
              hint={
                metric
                  ? `${t("fldRangeOnCard")}: ${metric.range_display}`
                  : t("fldNotFound")
              }
            />
          );
        })}
      </div>

      {/* ---- Group two: the field itself. -------------------------------- */}
      <p className="eyebrow mt-8 text-ink-mute">{t("fldConditions")}</p>
      <p className="mt-1.5 max-w-[62ch] text-[14px] leading-relaxed text-ink-mute">
        {mr
          ? "तापमान, हवेतला ओलावा आणि पाऊस यांवरून — सामू आणि मातीच्या प्रकारासोबत — कोणतं पीक हे ठरतं. हवामान खात्याचे आकडे इथे आपोआप भरले जात नाहीत: ते बारामतीचे असतात, तुमच्या शेताचे नाहीत."
          : "Temperature, air humidity and rainfall — with pH and the soil type — are what choose the crop. The weather feed does not fill these in: it reports Baramati, not your plot."}
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FIELD_FIELDS.map((spec) => (
          <Field
            key={spec.name}
            spec={spec}
            value={values[spec.name]}
            onChange={onChange}
            attempted={attempted}
            mr={mr}
          />
        ))}
      </div>

      {/* ---- Predict. ---------------------------------------------------- */}
      <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Button
          type="button"
          variant={ready ? "primary" : "secondary"}
          onClick={attempt}
          disabled={predicting}
          className="w-full sm:w-auto sm:min-w-[13rem]"
        >
          {predicting ? t("fldPredicting") : t("fldPredict")}
          {ready && !predicting ? (
            <ArrowRight className="size-5" strokeWidth={1.8} aria-hidden />
          ) : null}
        </Button>

        {/* Says what is outstanding rather than leaving a quiet button to
            explain itself. Photo first — it is a trip back outside, and the
            eight numbers are not worth typing before knowing that. */}
        {soilPhotoMissing ? (
          <p className="text-[14px] text-ink-mute">
            {mr
              ? "वर मातीचा फोटो द्या — त्याशिवाय मातीचा प्रकार ओळखता येत नाही."
              : "Add the soil photo above — without it the soil type cannot be identified."}
          </p>
        ) : !complete ? (
          <p className="text-[14px] text-ink-mute">
            {mr ? "सगळे आठ आकडे भरा." : "Fill in all eight figures."}
          </p>
        ) : null}
      </div>

      {failure ? (
        <p
          role="alert"
          className="mt-4 rounded-[var(--radius-card)] border border-anar/50 bg-anar-wash px-4 py-3 text-[14px] leading-relaxed text-anar"
        >
          {failure}
        </p>
      ) : null}
    </div>
  );
}

function Field({
  spec,
  value,
  onChange,
  attempted,
  mr,
  unconfirmed = false,
  missing = false,
  hint,
}: {
  spec: Spec;
  value: string;
  onChange: (name: FieldName, value: string) => void;
  attempted: boolean;
  mr: boolean;
  unconfirmed?: boolean;
  missing?: boolean;
  hint?: string;
}) {
  const { t } = useLang();
  const problem = attempted ? invalid(spec, value) : null;
  const id = `predict-${spec.name}`;

  return (
    <div>
      <label
        htmlFor={id}
        className="flex items-baseline gap-1.5 text-[14px] font-semibold text-ink"
      >
        <span>{mr ? spec.mr : spec.en}</span>
        {spec.unit ? (
          <span className="font-mono text-[11px] font-normal text-ink-mute">
            {spec.unit}
          </span>
        ) : null}
      </label>

      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={spec.step}
        min={spec.min}
        max={spec.max}
        value={value}
        onChange={(event) => onChange(spec.name, event.target.value)}
        aria-invalid={problem !== null}
        aria-describedby={`${id}-hint`}
        // min-h-12 matches every other tap target on this page: outdoors,
        // one-handed, often on a cracked screen.
        className={cn(
          "tnum mt-1.5 min-h-12 w-full rounded-[12px] border bg-surface px-3.5 text-[16px] text-ink",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf",
          problem
            ? "border-anar bg-anar-wash"
            : unconfirmed
              ? "border-haldi/60 bg-haldi-wash"
              : "border-line",
        )}
      />

      <p id={`${id}-hint`} className="mt-1.5 text-[12px] leading-snug text-ink-mute">
        {problem === "empty" ? (
          <span className="text-anar">{t("fldRequired")}</span>
        ) : problem === "bounds" ? (
          <span className="text-anar">
            {t("fldOutOfBounds")} ({spec.min}–{spec.max})
          </span>
        ) : unconfirmed ? (
          <span className="inline-flex items-start gap-1 text-haldi-ink">
            <AlertTriangle className="mt-px size-3.5 shrink-0" strokeWidth={2} aria-hidden />
            <span>
              {mr ? "फोटोतून वाचलं — ताडून पहा. " : "Read from a photo — check it. "}
              {hint}
            </span>
          </span>
        ) : missing ? (
          <span className="text-haldi-ink">{hint}</span>
        ) : (
          hint ?? " "
        )}
      </p>
    </div>
  );
}
