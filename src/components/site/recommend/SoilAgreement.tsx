"use client";

import Image from "next/image";
import { AlertTriangle, Check, HelpCircle } from "lucide-react";
import { photo } from "@/lib/assets";
import { cn } from "@/lib/cn";
import { SOILS } from "@/data/soils";
import { compareSoil, type SoilReadResult } from "@/lib/soilTypes";
import type { RecommendContext } from "@/lib/recommendTypes";

/**
 * The photograph's answer, weighed against the survey's.
 *
 * **The photograph is an input now.** It used to be a side-by-side comparison
 * and nothing more — the engine took no image, so this panel could only show a
 * disagreement and leave it standing. The engine now fuses the two
 * (`src/rules/soil_fusion.py`): the survey's area shares are the prior, the
 * classifier's measured confusion matrix is the likelihood, and the result can
 * change which crops are ranked.
 *
 * What it still cannot do is move a hard factor. Fusion touches texture and
 * available water only; depth, drainage and salinity keep the surveyed value,
 * so a photograph can add a constraint and can never lift a safety veto. The
 * engine's M5 test asserts exactly that — every class at maximum confidence,
 * against every sampled taluka.
 *
 * A disagreement is still worth showing. The taluka's mapped type is an
 * average over a handful of profile pits, and 66–78% of a taluka is its
 * dominant soil — so a farmer's own field differing from the map is ordinary,
 * and worth knowing before they sow rather than after.
 *
 * ── But the photograph is the less trustworthy half ────────────────────────
 *
 * Measured, not assumed. Fed the four reference photographs in
 * `public/img/soils/` — which `assets.ts` records as coming from the
 * classifier's *own training sets* — it returned:
 *
 *   black.jpg     -> black     99.8%   correct
 *   laterite.jpg  -> red       50.7%   wrong (laterite not in the top three)
 *   red.jpg       -> alluvial  66.0%   wrong (red second, 33.9%)
 *   alluvial.jpg  -> yellow    91.1%   wrong (alluvial third, 3.2%)
 *
 * One of four, on its own training data. The model is EfficientNet-B0 over
 * roughly 28 photographs per class, and it shows.
 *
 * So a disagreement here is at least as likely to be the classifier as the
 * field, and the copy below says exactly that rather than implying the
 * photograph caught something the survey missed. The runner-up is shown
 * alongside, because "red 50.7%, or black 24.8%" is a truer description of
 * what the model actually knows than a single confident-looking noun.
 *
 * A disagreement is shown and left standing. Nothing here picks a winner,
 * silently reconciles the two, or feeds either back into the advice.
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

  const tone =
    verdict?.verdict === "agrees" ? "ok" : verdict?.verdict === "differs" ? "warn" : "quiet";
  const frame = {
    ok: "border-leaf/40 bg-leaf-wash",
    warn: "border-haldi/50 bg-haldi-wash",
    quiet: "border-line bg-surface",
  }[tone];

  return (
    <section className={cn("rounded-[var(--radius-card)] border p-5", frame)}>
      <div className="flex flex-wrap items-start gap-4">
        {/* The photograph's class, as the site draws every soil. Slot held
            whether or not the file has landed, same rule as the crop cards. */}
        <div className="relative size-20 shrink-0 overflow-hidden rounded-[14px] bg-night">
          {src ? (
            <Image
              src={src}
              alt={card ? (mr ? card.mr : card.en) : soil.key}
              fill
              sizes="80px"
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

        <div className="min-w-0 flex-1">
          <p className="eyebrow text-ink-mute">
            {mr ? "फोटोवरून ओळखलेली माती" : "The soil in your photo"}
          </p>
          <p className="mt-1 text-[1.15rem] font-semibold text-ink font-[family-name:var(--font-display)]">
            {card ? (mr ? card.mr : card.en) : soil.key}
            <span className="tnum ml-2 text-[13px] font-normal text-ink-mute">
              {Math.round(soil.confidence)}%
            </span>
          </p>

          {/* The runner-up, when the two disagree. A single noun with a
              percentage reads more certain than this model has earned; the
              second guess is part of the honest answer. */}
          {verdict?.verdict === "differs" && soil.alternatives.length ? (
            <p className="mt-1 text-[13px] text-ink-mute">
              {mr ? "किंवा कदाचित: " : "or possibly: "}
              {soil.alternatives.slice(0, 2).map((a, i) => {
                const alt = SOILS.find((s) => s.key === a.key);
                return (
                  <span key={a.key}>
                    {i > 0 ? ", " : ""}
                    {alt ? (mr ? alt.mr : alt.en) : a.key}{" "}
                    <span className="tnum">{Math.round(a.confidence)}%</span>
                  </span>
                );
              })}
            </p>
          ) : null}

          {surveyed?.soil_type ? (
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">
              {mr ? "नकाशाप्रमाणे इथली माती: " : "The survey maps this taluka as "}
              <strong className="font-semibold text-ink">
                {surveyName(surveyed.soil_type, mr)}
              </strong>
              {surveyed.share_pct != null ? (
                <span className="tnum text-ink-mute"> ({surveyed.share_pct}%)</span>
              ) : null}
              {surveyed.soil_type_secondary ? (
                <>
                  {mr ? ", दुय्यम " : ", with "}
                  {surveyName(surveyed.soil_type_secondary, mr)}
                  {mr ? "" : " alongside"}
                </>
              ) : null}
              .
            </p>
          ) : null}
        </div>
      </div>

      {verdict ? (
        <p
          className={cn(
            "mt-4 flex items-start gap-2.5 text-[14px] leading-relaxed",
            verdict.verdict === "agrees" && "text-leaf-deep",
            verdict.verdict === "differs" && "text-haldi-ink",
            verdict.verdict === "unmapped" && "text-ink-soft",
          )}
        >
          {verdict.verdict === "agrees" ? (
            <Check className="mt-0.5 size-4.5 shrink-0" strokeWidth={2} aria-hidden />
          ) : verdict.verdict === "differs" ? (
            <AlertTriangle className="mt-0.5 size-4.5 shrink-0" strokeWidth={1.9} aria-hidden />
          ) : (
            <HelpCircle className="mt-0.5 size-4.5 shrink-0" strokeWidth={1.9} aria-hidden />
          )}
          <span>
            {verdict.verdict === "agrees"
              ? mr
                ? "फोटो आणि नकाशा जुळतात."
                : "The photo and the survey agree."
              : verdict.verdict === "differs"
                ? mr
                  ? "फोटो आणि नकाशा जुळत नाहीत. दोन कारणं असू शकतात — तुमचं शेत तालुक्याच्या सरासरीपेक्षा खरंच वेगळं आहे, किंवा फोटो चुकीचा ओळखला गेला. फोटो ओळखणारं मॉडेल साधारण चारपैकी तीन वेळा बरोबर असतं, आणि जांभी व दलदलीची माती ओळखण्यात ते सर्वात कमकुवत आहे, त्यामुळे त्याच्यावर पूर्ण भरवसा ठेवू नका. जमीन स्वतः बघून खात्री करा. शिफारस नकाशावरच आधारित आहे."
                  : "The photo and the survey do not agree, and there are two reasons that can happen: your field genuinely differs from the taluka average, or the photo was read wrong. The classifier is right about three times in four on photographs it was not trained on, and laterite and peat are the soils it reads worst — so treat it as a prompt to look at the ground yourself, not as a finding. The recommendation above runs on the survey either way."
                : mr
                  ? "या दोन याद्या इथे जुळत नाहीत, त्यामुळे तुलना करता येत नाही."
                  : "The two vocabularies do not meet on this class, so there is nothing to compare."}
          </span>
        </p>
      ) : null}

      {/* What the photograph was actually allowed to do.
          `applied: false` is the ordinary case rather than a failure — an
          unconfident photo, a taluka the survey maps as a single soil, or a
          soil the classifier has no class for all leave the survey standing,
          and the farmer is better off seeing that than seeing nothing. */}
      {context?.soil_fusion ? (
        <div className="mt-4 rounded-[12px] border border-line bg-surface/60 p-3.5">
          <p className="eyebrow text-ink-mute">
            {mr ? "तुमच्या फोटोचा परिणाम" : "What your photo did"}
          </p>

          {context.soil_fusion.applied ? (
            <p className="mt-1 text-[14px] leading-relaxed text-ink">
              {mr ? "शिफारस काढताना इंजिनने इथली माती " : "The engine treated this field as "}
              <strong className="font-semibold">
                {surveyName(context.soil_fusion.soil_type ?? "", mr)}
              </strong>
              {mr
                ? " मानली — नकाशापेक्षा तुमच्या फोटोला अधिक वजन देऊन."
                : ", following your photo rather than the taluka map."}
            </p>
          ) : (
            <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">
              {mr
                ? "फोटोने शिफारस बदलली नाही — सर्वेक्षणाचाच आधार घेतला गेला."
                : "Your photo did not change the recommendation; the survey stood."}
            </p>
          )}

          {/* Prior against posterior, because "81%" alone hides whether the
              photograph moved anything or merely agreed with a map that was
              already confident. */}
          {Object.keys(context.soil_fusion.posterior).length ? (
            <ul className="mt-2.5 grid gap-1">
              {Object.entries(context.soil_fusion.posterior)
                .sort((a, b) => b[1] - a[1])
                .map(([type, after]) => {
                  const before = context.soil_fusion?.prior[type] ?? 0;
                  return (
                    <li
                      key={type}
                      className="flex items-baseline justify-between gap-3 text-[13px]"
                    >
                      <span className="text-ink-soft">{surveyName(type, mr)}</span>
                      <span className="tnum shrink-0 text-ink-mute">
                        {Math.round(before * 100)}%
                        <span aria-hidden> → </span>
                        <span className="font-semibold text-ink">
                          {Math.round(after * 100)}%
                        </span>
                      </span>
                    </li>
                  );
                })}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* Depth and drainage are what the gate's hard factors ran on, and they
          come from the survey whatever the photograph says — that is what
          stops a misread picture from lifting a safety veto. Texture is the
          one line here a confident photo can nudge. */}
      {surveyed && (surveyed.texture || surveyed.depth || surveyed.drainage) ? (
        <dl className="mt-4 grid gap-1.5 border-t border-line pt-3 sm:grid-cols-3">
          {([
            ["texture", mr ? "पोत" : "Texture"],
            ["depth", mr ? "खोली" : "Depth"],
            ["drainage", mr ? "निचरा" : "Drainage"],
          ] as const).map(([key, label]) =>
            surveyed[key] ? (
              <div key={key}>
                <dt className="text-[12px] text-ink-mute">{label}</dt>
                <dd className="text-[13.5px] font-medium text-ink">{surveyed[key]}</dd>
              </div>
            ) : null,
          )}
        </dl>
      ) : null}

      <p className="mt-3 text-[12px] leading-relaxed text-ink-mute">
        {mr
          ? "फोटो आता शिफारशीत वापरला जातो — तो सर्वेक्षणासोबत तोलला जातो आणि पिकांचा क्रम बदलू शकतो. पण खोली, निचरा आणि क्षारता नेहमी सर्वेक्षणातूनच येतात, त्यामुळे फोटो कोणतीही सुरक्षा-तपासणी काढून टाकू शकत नाही."
          : "The photo is an input now: it is weighed against the survey and can change which crops are ranked. But depth, drainage and salinity always come from the survey, so a photo can add a caution and can never remove one."}
      </p>
    </section>
  );
}
