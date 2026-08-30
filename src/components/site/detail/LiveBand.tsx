"use client";

import type { ReactNode } from "react";
import { CheckCircle2, CircleSlash, Sprout } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { SOILS } from "@/data/soils";
import { useLiveCrop, useLiveFert, useLiveSoil } from "@/lib/livePick";

/**
 * "This is yours" — the band that turns a reference page into a result.
 *
 * Every detail page now exists for all 37 topics the models can name, which
 * means most of them are opened as reference: someone reading about cotton who
 * has not sent a card. For the farmer who *did*, and who tapped their own top
 * recommendation to get here, the page has to say so in the first screen —
 * otherwise their 49% match, their soil's verdict, and the hold on a bag they
 * were about to buy are all one page-scroll away and indistinguishable from
 * general advice.
 *
 * Green, because this site reserves green for model output and this is the
 * model's output about their field. It renders only when the prediction is in
 * context (see `livePick.ts`); there is no fallback and no fixture behind it.
 */

function Band({
  tone = "leaf",
  eyebrow,
  children,
}: {
  tone?: "leaf" | "haldi";
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "mt-8 rounded-[var(--radius-card)] border-l-4 py-6 pr-6 pl-7",
        tone === "leaf" ? "border-leaf bg-leaf-wash" : "border-haldi bg-haldi-wash",
      )}
    >
      <p className="eyebrow text-ink-mute">{eyebrow}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** The big number, in the data face, with what it means beside it. */
function Figure({ value, unit, label }: { value: number; unit: string; label: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="tnum text-[2.4rem] leading-none font-semibold text-ink">
        {value}
        <span className="text-[1.3rem]">{unit}</span>
      </span>
      <span className="text-[15px] text-ink-soft">{label}</span>
    </div>
  );
}

export function LiveCropBand({ cropKey }: { cropKey: string }) {
  const { lang } = useLang();
  const mr = lang === "mr";
  const live = useLiveCrop(cropKey);
  if (!live) return null;

  const soil = live.soilKey ? SOILS.find((s) => s.key === live.soilKey) : undefined;
  const soilName = soil ? (mr ? soil.mr : soil.en) : null;

  // How the identified soil treated this crop. `neutral` is deliberately not
  // dressed up — a soil that neither helps nor hinders is a real answer.
  const fit =
    live.soilFit === "favoured"
      ? mr
        ? `${soilName} या मातीला हे पीक चांगलं मानवतं, म्हणून ते वर आलं.`
        : `Your ${soilName?.toLowerCase()} suits this crop, which moved it up the list.`
      : live.soilFit === "discouraged"
        ? mr
          ? `${soilName} या मातीवर हे पीक अवघड आहे, तरी पोषणद्रव्यं आणि हवामान बघता ते टिकून राहिलं.`
          : `Your ${soilName?.toLowerCase()} works against this crop — it still ranked here on climate and pH alone.`
        : null;

  return (
    <Band eyebrow={mr ? "तुमच्या शेतासाठी" : "For your field"}>
      <Figure
        value={live.confidence}
        unit="%"
        label={mr ? "जुळतं" : "match"}
      />
      <p className="mt-3 text-[1.05rem] leading-relaxed text-ink-soft">
        {mr
          ? `तुमच्या पत्रिकेवरून आणि तुम्ही भरलेल्या शेतातल्या स्थितीवरून हे पीक ${live.rank} व्या क्रमांकावर आलं.`
          : `Ranked #${live.rank} for your card and the field conditions you entered.`}
        {fit ? ` ${fit}` : ""}
      </p>
    </Band>
  );
}

export function LiveSoilBand({ soilKey }: { soilKey: string }) {
  const { lang } = useLang();
  const mr = lang === "mr";
  const live = useLiveSoil(soilKey);
  if (!live) return null;

  const runnerUp = live.alternatives[0];
  const runnerUpSoil = runnerUp ? SOILS.find((s) => s.key === runnerUp.key) : undefined;

  return (
    <Band eyebrow={mr ? "तुमच्या मातीचा फोटो" : "From your soil photo"}>
      <Figure value={live.confidence} unit="%" label={mr ? "खात्री" : "confident"} />
      <p className="mt-3 text-[1.05rem] leading-relaxed text-ink-soft">
        {mr
          ? "तुम्ही दिलेल्या फोटोवरून ही माती ओळखली आहे."
          : "Identified from the photograph you sent."}
        {/* The runner-up travels with the answer. A classifier trained on ~28
            real photographs of some of these soils is not entitled to state
            one answer and stop talking — the same rule the prediction board
            follows. */}
        {runnerUpSoil ? (
          <>
            {" "}
            {mr
              ? `दुसरी शक्यता ${runnerUpSoil.mr} — ${runnerUp.score}%.`
              : `Second guess: ${runnerUpSoil.en.toLowerCase()}, ${runnerUp.score}%.`}
          </>
        ) : null}
      </p>
    </Band>
  );
}

export function LiveFertBand({ fertKey }: { fertKey: string }) {
  const { lang } = useLang();
  const mr = lang === "mr";
  const live = useLiveFert(fertKey);
  if (!live) return null;

  const hold = live.verdict === "hold";

  // Which macronutrients the card printed a range for. A `null` is not a bag
  // ruled out — it is a bag nothing could rule on, and the two must not look
  // the same to somebody deciding whether to spend money.
  const unjudged = (["N", "P", "K"] as const).filter(
    (n) => live.nutrientStatus[n] === null,
  );

  return (
    <Band tone={hold ? "haldi" : "leaf"} eyebrow={mr ? "तुमच्या पत्रिकेवरून" : "From your card"}>
      <p
        className={cn(
          "flex items-center gap-2.5 text-[1.6rem] leading-tight font-semibold",
          hold ? "text-haldi-ink" : "text-leaf-deep",
        )}
      >
        {hold ? (
          <CircleSlash className="size-7 shrink-0" strokeWidth={2} aria-hidden />
        ) : (
          <CheckCircle2 className="size-7 shrink-0" strokeWidth={2} aria-hidden />
        )}
        {hold
          ? mr
            ? "हे खत आत्ता घेऊ नका"
            : "Don't buy this one"
          : mr
            ? "हे खत घ्यायला हरकत नाही"
            : "Worth buying"}
      </p>
      <p className="mt-3 text-[1.05rem] leading-relaxed text-ink-soft">
        {hold
          ? mr
            ? "या खतातलं मुख्य अन्नद्रव्य तुमच्या जमिनीत आधीच पुरेसं — किंवा जास्त — आहे. पैसे वाचवा."
            : "The nutrient this bag mostly supplies is already at or above the range printed on your card. Keep the money."
          : mr
            ? "तुमच्या पत्रिकेत जे कमी आहे, ते या खतातून मिळतं."
            : "This supplies what your card measured as short."}
      </p>
      {unjudged.length > 0 ? (
        <p className="mt-2.5 flex items-start gap-2 text-[14px] leading-relaxed text-ink-mute">
          <Sprout className="mt-0.5 size-4 shrink-0" strokeWidth={1.9} aria-hidden />
          {mr
            ? `तुमच्या पत्रिकेवर ${unjudged.join(", ")} साठी मर्यादा छापलेली नाही, त्यामुळे या अन्नद्रव्यांवरून काहीच ठरवता आलेलं नाही.`
            : `Your card prints no range for ${unjudged.join(", ")}, so nothing here rests on ${unjudged.length === 1 ? "that nutrient" : "those nutrients"}.`}
        </p>
      ) : null}
    </Band>
  );
}
