"use client";

import { AlertTriangle, Check } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { Reading } from "@/data/soilReading";
import type { CardReadResult } from "@/lib/cardTypes";
import { NutrientChart } from "./NutrientChart";

/**
 * What actually came off the card.
 *
 * This replaces the fixed sample profile that sat here while extraction was
 * unwired, and with it the standing "Sample figures" notice that PLAN.md §6
 * said must not be removed until reading was real. It is not deleted so much
 * as promoted: the amber block is still here, but it now carries provenance —
 * which file, how many of twelve were found, and whether the numbers came out
 * of a PDF's text layer or out of OCR.
 *
 * That last distinction is the one that matters. A PDF read is exact. An OCR
 * read is a guess that looks exactly like a fact: on a clean render of the
 * test card Tesseract turns nitrogen 245.15 into 945.15, which is plausible,
 * in range, and flips the advice from "apply urea" to "apply none". So an
 * OCR-sourced reading is never presented as settled — the panel says to check
 * it, and every row is marked.
 */
export function CardResult({
  result,
  readings,
  missing,
  mr,
}: {
  result: CardReadResult;
  readings: Reading[];
  missing: Reading[];
  mr: boolean;
}) {
  const { t } = useLang();
  const unconfirmed = result.needs_review;

  return (
    <div className="border-t-2 border-ink p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="section-head text-[1.35rem] text-ink sm:text-[1.6rem]">
          {mr ? "तुमच्या मातीत काय आहे" : "What's in your soil"}
        </h3>
        <p className="truncate font-mono text-[12px] text-ink-mute">{result.filename}</p>
      </div>

      {/* Provenance. Amber when the numbers need checking, quiet green when
          they came straight out of the document's own text. */}
      <p
        role="status"
        className={cn(
          "mb-6 flex gap-3 rounded-[var(--radius-card)] border px-4 py-3 text-[14px] leading-relaxed",
          unconfirmed
            ? "border-haldi/50 bg-haldi-wash text-haldi-ink"
            : "border-leaf/40 bg-leaf-wash text-leaf-deep",
        )}
      >
        {unconfirmed ? (
          <AlertTriangle className="mt-0.5 size-5 shrink-0" strokeWidth={1.8} aria-hidden />
        ) : (
          <Check className="mt-0.5 size-5 shrink-0" strokeWidth={2} aria-hidden />
        )}
        <span>
          <strong className="font-semibold">
            {unconfirmed
              ? mr
                ? "फोटोतून वाचलेले आकडे — तपासून घ्या. "
                : "Read from a photo — please check. "
              : mr
                ? "तुमच्या पत्रिकेवरचे आकडे. "
                : "Your card's own figures. "}
          </strong>
          {mr
            ? `बारापैकी ${readings.length} वाचता आले.`
            : `${readings.length} of 12 readings found.`}{" "}
          {unconfirmed
            ? mr
              ? "फोटोतून आकडे वाचताना चुका होऊ शकतात. खत घेण्यापूर्वी प्रत्येक आकडा कागदावरच्या आकड्याशी ताडून पहा. पत्रिकेची PDF असेल तर ती पाठवा — ती नक्की बरोबर वाचली जाते."
              : "Reading digits from a photo can go wrong. Check each figure against the paper before buying anything. If you have the PDF of this card, send that instead — it reads exactly."
            : mr
              ? "हे आकडे थेट कागदावरून घेतले आहेत."
              : "These came straight out of the document."}
        </span>
      </p>

      {/* What could not be read. Named rather than silently absent, and never
          filled in from the sample profile. */}
      {missing.length > 0 ? (
        <p className="mb-6 rounded-[var(--radius-card)] border border-line bg-paper px-4 py-3 text-[14px] leading-relaxed text-ink-soft">
          {mr ? "हे वाचता आले नाहीत: " : "Couldn't read: "}
          <span className="font-medium text-ink">
            {missing.map((r) => t(r.key)).join(mr ? ", " : ", ")}
          </span>
          {". "}
          {mr
            ? "यांचे आकडे खाली दाखवलेले नाहीत — अंदाज लावण्यापेक्षा न दाखवणं बरं."
            : "They're left out below rather than guessed at."}
        </p>
      ) : null}

      <NutrientChart readings={readings} />

      {/* Where the page goes next. The soil-health score, the crop and the
          fertilizer plan used to be printed here, and they were repeating —
          in a cramped column inside the upload control — what the sections
          below this one already say properly, at full width, with their own
          photography. This panel's job is the twelve numbers; the rest of the
          page's job is what follows from them. */}
      <p className="mt-6 border-t border-line pt-5 text-[14px] leading-relaxed text-ink-soft">
        {mr
          ? "हेच आकडे खाली प्रत्येक विभागात वापरले आहेत — माती, पीक आणि खत."
          : "These same figures run through the sections below — your soil, your crop, and what to feed it."}{" "}
        <a
          href="#reading"
          className="font-semibold text-leaf underline decoration-leaf/40 underline-offset-4 hover:decoration-leaf"
        >
          {mr ? "पुढे बघा" : "Keep reading"}
        </a>
      </p>
    </div>
  );
}
