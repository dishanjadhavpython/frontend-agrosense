"use client";

import Image from "next/image";
import type { ComponentType } from "react";
import { AlertTriangle, Camera, Check, Droplets, HelpCircle, Layers, Map as MapIcon, Ruler } from "lucide-react";
import { photo } from "@/lib/assets";
import { cn } from "@/lib/cn";
import { SOILS } from "@/data/soils";
import { compareSoil, type SoilReadResult } from "@/lib/soilTypes";
import { isUnsureSoilRead } from "@/lib/soilConfidence";
import type { RecommendContext } from "@/lib/recommendTypes";

/**
 * The photograph's answer, weighed against the government soil map's.
 *
 * Said as two tiles and one sentence. This panel used to carry the whole
 * argument in prose — the classifier's accuracy on photographs it was not
 * trained on, which soils it reads worst, which factors fusion may move — and
 * a farmer had to read a paragraph to learn three things: what the photo
 * says, what the map says, and what to do when they disagree. Those three are
 * what is left, plus the survey's own description of the land in words a
 * farmer would use for it.
 *
 * **The photograph is an input.** The engine fuses it with the survey
 * (`src/rules/soil_fusion.py`): the survey's area shares are the prior, the
 * classifier's measured confusion matrix the likelihood, and the result can
 * change which crops are ranked. What it can never move is depth, drainage or
 * salinity — those come from profile pits, not from a picture of the surface —
 * so a photograph can add a caution and never remove one.
 *
 * **The photograph is also the less trustworthy half.** A disagreement is at
 * least as likely to be the classifier as the field, so the sentence says
 * "look at the ground yourself" rather than implying the photo caught
 * something the survey missed. Nothing here picks a winner.
 *
 * Runner-up guesses are shown only when they carry weight. "or possibly: peat
 * 0%, red 0%" was the honest top-three and said nothing; a second guess at a
 * tenth or more is a materially different answer and belongs on the tile.
 */

const SURVEY_MR: Record<string, string> = {
  "Alluvial": "गाळाची",
  "Black (Regur)": "काळी (रेगूर)",
  "Laterite": "जांभी",
  "Mountain / Forest": "डोंगर / जंगल",
  "Red & Yellow": "तांबडी व पिवळी",
  "Saline / Alkaline": "खारवट / चोपण",
};

const surveyName = (t: string, mr: boolean) => (mr ? SURVEY_MR[t] ?? t : t);

type Words = { mr: string; en: string };

/** The survey's vocabulary, with what each term means for a crop. */
const TEXTURE: Record<string, Words & { mean: Words }> = {
  Clayey: {
    mr: "भारी, चिकण", en: "Clayey",
    mean: { mr: "पाणी व अन्नद्रव्यं धरून ठेवते; कोरडी झाली की भेगा पडतात", en: "holds water and nutrients well; cracks when dry" },
  },
  "Clayey-skeletal": {
    mr: "चिकण, खडेयुक्त", en: "Clayey, with gravel",
    mean: { mr: "खड्यांमुळे साध्या चिकण मातीपेक्षा कमी पाणी धरते", en: "the stones mean it holds less water than plain clay" },
  },
  Loamy: {
    mr: "पोयटा (मध्यम)", en: "Loamy",
    mean: { mr: "मशागतीला सोपी, पाणी चांगलं धरते", en: "easy to work, holds water well" },
  },
  "Loamy-skeletal": {
    mr: "पोयटा, खडेयुक्त", en: "Loamy, with gravel",
    mean: { mr: "खड्यांमुळे लवकर कोरडी होते", en: "the stones make it dry out faster" },
  },
};

const DEPTH: Record<string, Words & { mean: Words }> = {
  "Very shallow": {
    mr: "खूप उथळ", en: "Very shallow",
    mean: { mr: "२५ सेंमीपेक्षा कमी — फक्त कमी मुळांची, कमी कालावधीची पिकं", en: "under 25 cm — only short, shallow-rooted crops" },
  },
  Shallow: {
    mr: "उथळ", en: "Shallow",
    mean: { mr: "२५–५० सेंमी — मुळं खोल जात नाहीत, जमीन लवकर कोरडी होते", en: "25–50 cm — roots cannot go deep, and it dries out fast" },
  },
  "Moderately deep": {
    mr: "मध्यम खोल", en: "Moderately deep",
    mean: { mr: "५०–१०० सेंमी — बहुतेक पिकांना पुरेशी", en: "50–100 cm — enough for most field crops" },
  },
  Deep: {
    mr: "खोल", en: "Deep",
    mean: { mr: "१–१.५ मीटर — मुळांसाठी भरपूर ओलावा", en: "1–1.5 m — plenty of moisture for the roots" },
  },
  "Very deep": {
    mr: "खूप खोल", en: "Very deep",
    mean: { mr: "१.५ मीटरपेक्षा जास्त — खोल मुळांच्या पिकांनाही चालते", en: "over 1.5 m — suits even deep-rooted crops" },
  },
};

const DRAINAGE: Record<string, Words & { mean: Words }> = {
  "Poorly drained": {
    mr: "निचरा कमी", en: "Poorly drained",
    mean: { mr: "पावसानंतर पाणी बराच काळ साचतं", en: "water stands for a long time after rain" },
  },
  "Imperfectly drained": {
    mr: "निचरा उशिरा", en: "Slow to drain",
    mean: { mr: "पाणी काही काळ साचू शकतं", en: "water can stand for a while" },
  },
  "Moderately well drained": {
    mr: "मध्यम निचरा", en: "Moderately well drained",
    mean: { mr: "थोडा वेळ ओली राहते, मग निचरा होतो", en: "stays wet briefly, then drains" },
  },
  "Well drained": {
    mr: "चांगला निचरा", en: "Well drained",
    mean: { mr: "पाणी साचत नाही — बहुतेक पिकांना योग्य", en: "water does not stand — good for most crops" },
  },
  "Somewhat excessively drained": {
    mr: "निचरा जलद", en: "Drains fast",
    mean: { mr: "पाणी लवकर निघून जातं, ओलावा कमी टिकतो", en: "water leaves quickly and little moisture stays" },
  },
  "Excessively drained": {
    mr: "निचरा खूप जलद", en: "Drains very fast",
    mean: { mr: "पाणी लगेच जमिनीतून निघून जातं; वारंवार पाणी द्यावं लागतं", en: "water runs straight through; it needs frequent watering" },
  },
};

/** The classifier's calibrated confidence, in a word. */
function sureWord(percent: number, mr: boolean): string {
  if (isUnsureSoilRead(percent)) return mr ? "खात्री कमी" : "unsure";
  if (percent >= 90) return mr ? "जवळजवळ खात्री" : "very sure";
  return mr ? "बऱ्यापैकी खात्री" : "fairly sure";
}

function Tile({
  icon: Icon,
  label,
  children,
  media,
}: {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  children: React.ReactNode;
  media?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3.5 rounded-[18px] border border-line bg-surface p-3.5">
      {media ?? (
        <span className="grid size-16 shrink-0 place-items-center rounded-[14px] bg-leaf-wash text-leaf">
          <Icon className="size-7" strokeWidth={1.6} />
        </span>
      )}
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-ink-mute">
          <Icon className="size-3.5 shrink-0" strokeWidth={2} />
          {label}
        </p>
        {children}
      </div>
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
  mean,
}: {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: string;
  mean?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-surface text-ink-soft ring-1 ring-line">
        <Icon className="size-4" strokeWidth={1.9} />
      </span>
      <div className="min-w-0">
        <p className="text-[12px] text-ink-mute">{label}</p>
        <p className="text-[14.5px] font-semibold text-ink">{value}</p>
        {mean ? <p className="mt-0.5 text-[12.5px] leading-snug text-ink-soft">{mean}</p> : null}
      </div>
    </div>
  );
}

export function SoilAgreement({
  soil,
  context,
  mr,
}: {
  soil: SoilReadResult;
  /** `null` until a recommendation exists — the survey lives on its context. */
  context: RecommendContext | null;
  mr: boolean;
}) {
  const surveyed = context?.surveyed_soil ?? null;
  const card = SOILS.find((s) => s.key === soil.key);
  const src = card ? photo(card.img) : undefined;
  const verdict = surveyed
    ? compareSoil(soil.key, surveyed.soil_type, surveyed.soil_type_secondary)
    : null;
  const fusion = context?.soil_fusion ?? null;
  const confidence = Math.round(soil.confidence);

  // Second guesses that carry weight, never the zeroes.
  const alternatives = soil.alternatives
    .filter((a) => a.confidence >= 10)
    .slice(0, 2)
    .map((a) => {
      const alt = SOILS.find((s) => s.key === a.key);
      return `${alt ? (mr ? alt.mr : alt.en) : a.key} ${Math.round(a.confidence)}%`;
    });

  const tone =
    verdict?.verdict === "agrees" ? "ok" : verdict?.verdict === "differs" ? "warn" : "quiet";

  const texture = surveyed?.texture ? TEXTURE[surveyed.texture] : undefined;
  const depth = surveyed?.depth ? DEPTH[surveyed.depth] : undefined;
  const drainage = surveyed?.drainage ? DRAINAGE[surveyed.drainage] : undefined;

  return (
    <section
      className="rounded-[var(--radius-card)] border border-line bg-paper p-5 sm:p-6"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 className="text-[1.15rem] font-semibold text-ink font-[family-name:var(--font-display)]">
          {mr ? "तुमची माती" : "Your soil"}
        </h3>
        {verdict ? (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold",
              tone === "ok" && "bg-leaf-wash text-leaf-deep",
              tone === "warn" && "bg-haldi-wash text-haldi-ink",
              tone === "quiet" && "bg-surface text-ink-mute ring-1 ring-line",
            )}
          >
            {tone === "ok" ? (
              <Check className="size-4" strokeWidth={2.2} aria-hidden />
            ) : tone === "warn" ? (
              <AlertTriangle className="size-4" strokeWidth={2} aria-hidden />
            ) : (
              <HelpCircle className="size-4" strokeWidth={2} aria-hidden />
            )}
            {tone === "ok"
              ? mr ? "फोटो आणि नकाशा जुळतात" : "Photo and map agree"
              : tone === "warn"
                ? mr ? "फोटो आणि नकाशा जुळत नाहीत" : "Photo and map disagree"
                : mr ? "तुलना करता येत नाही" : "Cannot be compared"}
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Tile
          icon={Camera}
          label={mr ? "तुमच्या फोटोवरून" : "From your photo"}
          media={
            <div className="relative size-16 shrink-0 overflow-hidden rounded-[14px] bg-night">
              {src ? (
                <Image
                  src={src}
                  alt={card ? (mr ? card.mr : card.en) : soil.key}
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              ) : (
                <div
                  className="field-rows absolute inset-0"
                  style={{
                    backgroundImage:
                      "linear-gradient(160deg, var(--color-night-rise) 0%, var(--color-night) 100%)",
                  }}
                  aria-hidden
                />
              )}
            </div>
          }
        >
          <p className="truncate text-[1.1rem] font-semibold text-ink">
            {card ? (mr ? card.mr : card.en) : soil.key}
          </p>
          <p className={cn("tnum text-[13px]", isUnsureSoilRead(confidence) ? "font-semibold text-haldi-ink" : "text-ink-soft")}>
            {sureWord(confidence, mr)} · {confidence}%
          </p>
          {alternatives.length ? (
            <p className="tnum truncate text-[12px] text-ink-mute">
              {mr ? "किंवा: " : "or: "}
              {alternatives.join(", ")}
            </p>
          ) : null}
        </Tile>

        <Tile icon={MapIcon} label={mr ? "सरकारी माती नकाशावरून" : "From the government soil map"}>
          {surveyed?.soil_type ? (
            <>
              <p className="truncate text-[1.1rem] font-semibold text-ink">
                {surveyName(surveyed.soil_type, mr)}
              </p>
              <p className="tnum text-[13px] text-ink-soft">
                {surveyed.share_pct != null
                  ? mr
                    ? `तालुक्याचा ${Math.round(surveyed.share_pct)}% भाग`
                    : `${Math.round(surveyed.share_pct)}% of this taluka`
                  : mr ? "या तालुक्यात मुख्यतः" : "mostly, in this taluka"}
              </p>
              {surveyed.soil_type_secondary ? (
                <p className="truncate text-[12px] text-ink-mute">
                  {mr ? "बाकी: " : "also: "}
                  {surveyName(surveyed.soil_type_secondary, mr)}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-[14px] text-ink-soft">
              {mr ? "तुमचं ठिकाण निवडल्यावर दिसेल" : "Shown once you choose your taluka"}
            </p>
          )}
        </Tile>
      </div>

      {/* What to do, in one sentence. */}
      {verdict ? (
        <p
          className={cn(
            "mt-4 rounded-[14px] px-4 py-3 text-[14px] leading-relaxed",
            tone === "ok" && "bg-leaf-wash text-leaf-deep",
            tone === "warn" && "bg-haldi-wash text-haldi-ink",
            tone === "quiet" && "bg-surface text-ink-soft ring-1 ring-line",
          )}
        >
          {verdict.verdict === "agrees"
            ? `${
                verdict.matched === surveyed?.soil_type
                  ? mr ? "दोन्ही एकच सांगतात." : "Both say the same."
                  : mr
                    ? `नकाशावर या तालुक्यात ${surveyName(verdict.matched, true)} मातीही आहे — तुमचा फोटो तिच्याशी जुळतो.`
                    : `The map shows ${surveyName(verdict.matched, false)} soil in this taluka too, and your photo matches it.`
              } ${
                fusion?.applied
                  ? mr ? "तुमचा फोटो पिकांच्या सल्ल्यात वापरला आहे." : "Your photo was used in the crop advice."
                  : mr ? "पिकांचा सल्ला तालुक्याच्या नकाशावर आधारित आहे." : "The crop advice follows the taluka's map."
              }`
            : verdict.verdict === "differs"
              ? fusion?.applied
                ? mr
                  ? `तुमचं शेत तालुक्याच्या नकाशापेक्षा वेगळं असू शकतं, किंवा फोटो चुकीचा ओळखला गेला असेल. सल्ला काढताना तुमच्या फोटोला जास्त वजन दिलं — जमीन स्वतः बघून खात्री करा.`
                  : `Your field may really differ from the taluka map — or the photo was misread. The advice leaned towards your photo, so check the ground yourself.`
                : mr
                  ? "तुमचं शेत तालुक्याच्या नकाशापेक्षा वेगळं असू शकतं, किंवा फोटो चुकीचा ओळखला गेला असेल. जमीन स्वतः बघून खात्री करा. पिकांचा सल्ला नकाशावर आधारित आहे."
                  : "Your field may really differ from the taluka map — or the photo was misread. Check the ground yourself. The crop advice follows the map."
              : mr
                ? "फोटोतला मातीचा प्रकार नकाशाच्या यादीत नाही, म्हणून दोन्हींची तुलना करता येत नाही. पिकांचा सल्ला नकाशावर आधारित आहे."
                : "The photo's soil type is not one the map uses, so the two cannot be compared. The crop advice follows the map."}
        </p>
      ) : null}

      {/* The land itself, in the survey's terms and a farmer's. */}
      {texture || depth || drainage ? (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-[13px] font-medium text-ink-mute">
            {mr ? "या जमिनीबद्दल (सरकारी सर्वेक्षणातून)" : "About this land (from the government survey)"}
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            {texture ? (
              <Fact
                icon={Layers}
                label={mr ? "पोत" : "Texture"}
                value={mr ? texture.mr : texture.en}
                mean={mr ? texture.mean.mr : texture.mean.en}
              />
            ) : null}
            {depth ? (
              <Fact
                icon={Ruler}
                label={mr ? "खोली" : "Depth"}
                value={mr ? depth.mr : depth.en}
                mean={mr ? depth.mean.mr : depth.mean.en}
              />
            ) : null}
            {drainage ? (
              <Fact
                icon={Droplets}
                label={mr ? "पाण्याचा निचरा" : "Drainage"}
                value={mr ? drainage.mr : drainage.en}
                mean={mr ? drainage.mean.mr : drainage.mean.en}
              />
            ) : null}
          </div>
          <p className="mt-4 text-[12px] leading-relaxed text-ink-mute">
            {mr
              ? "खोली, निचरा आणि क्षार नेहमी सर्वेक्षणातूनच घेतले जातात — ते फोटोत दिसत नाहीत."
              : "Depth, drainage and salt always come from the survey — a photo cannot show them."}
          </p>
        </div>
      ) : null}
    </section>
  );
}
