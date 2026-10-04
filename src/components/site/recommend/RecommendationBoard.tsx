"use client";

import { useEffect, useState } from "react";
import { Sprout } from "lucide-react";
import { title as titleCase } from "@/lib/format";
import { cropFromEngine } from "@/data/cropOntology";
import { requestResearch } from "@/lib/research";
import type { Recommendation } from "@/lib/recommendTypes";
import { Deck } from "@/components/ui/Deck";
import { CropCard } from "./CropCard";
import { CropDetailPanel } from "./CropDetailPanel";
import { ConfidenceNote, ContextAudit, Micronutrients } from "./RecommendAside";

/**
 * The engine's answer, on one board.
 *
 * The ranked crops are a deck — the same object the worked example's crops
 * are drawn as — and the crop in the centre is the one opened below it. A
 * farmer needs one decision, not five, but the four they did not pick stay one
 * swipe away or the ranking is just an assertion. Swiping and tapping end in
 * the same place: whichever crop settles in the middle is the one described.
 *
 * Down the page, the order the questions arrive in: is this answer
 * trustworthy at all (the warnings), what should I sow (the deck), why and
 * how much (the open crop), and then what the soil is short of and where each
 * number came from.
 *
 * What the engine ruled out is no longer listed. Twelve crops a farmer was
 * never going to sow, each with a reason in the engine's vocabulary, sat
 * between the answer and the advice that follows from it; the ranking already
 * says what to sow, and what not to sow is everything else.
 */

const SEASON_LABEL: Record<string, { mr: string; en: string }> = {
  Kharif: { mr: "खरीप", en: "Kharif" },
  Rabi: { mr: "रब्बी", en: "Rabi" },
  Summer: { mr: "उन्हाळी", en: "Summer" },
  "Whole Year": { mr: "बारमाही", en: "Whole Year" },
};

export function RecommendationBoard({
  recommendation: r,
  mr,
}: {
  recommendation: Recommendation;
  mr: boolean;
}) {
  const [openIndex, setOpenIndex] = useState(0);
  const open = r.crops[openIndex] ?? r.crops[0];

  // Start the agents on the top crops now, so each crop's page has its latest
  // report — prices, schemes, a video — by the time the farmer opens it. The
  // engine is a separate service and starts no research of its own. Three,
  // because that is how many run at once; the rest wait for a tap or the
  // sweep. Fire and forget: the board is the answer, this only warms the
  // pages it links to. (The board is keyed on the answer, so this runs once
  // per recommendation.)
  useEffect(() => {
    const crops = r.crops
      .slice(0, 3)
      .map((c) => cropFromEngine(c.crop)?.key)
      .filter((k): k is string => Boolean(k));
    if (crops.length) void requestResearch({ crop: crops });
  }, [r.crops]);

  const season = SEASON_LABEL[r.season] ?? { mr: r.season, en: r.season };
  const farmer = r.soil_test_source === "farmer soil health card";

  return (
    <div>
      {/* What this answer is about, in one line the farmer can check. */}
      <p className="text-[15px] leading-relaxed text-ink-soft">
        {titleCase(r.taluka)}, {titleCase(r.district)} ·{" "}
        {mr ? season.mr : season.en} ·{" "}
        {r.irrigated
          ? (mr ? "सिंचन आहे" : "irrigated")
          : (mr ? "फक्त पावसावर" : "rainfed")}
        {" · "}
        {farmer
          ? (mr ? "तुमच्या पत्रिकेवरून" : "from your card")
          : (mr ? "तालुक्याच्या सरासरीवरून" : "from the taluka average")}
      </p>

      <ConfidenceNote recommendation={r} mr={mr} />

      {r.crops.length ? (
        <>
          <div className="mt-10 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h3 className="flex items-center gap-2.5 text-[17px] font-semibold text-ink">
              <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-leaf-wash text-leaf">
                <Sprout className="size-[18px]" strokeWidth={1.9} aria-hidden />
              </span>
              {mr ? "तुमच्या शेतासाठी सर्वोत्तम पिकं" : "The best crops for your field"}
            </h3>
            <p className="text-[14px] text-ink-mute">
              {mr
                ? `${r.crops.length} पिकं, सर्वोत्तम आधी · बाजूला सरकवा किंवा दाबा`
                : `${r.crops.length} crops, best first · swipe or tap one`}
            </p>
          </div>

          <Deck
            label={mr ? "शिफारस केलेली पिकं" : "Recommended crops"}
            glow="leaf"
            focusIndex={openIndex}
            onActiveChange={setOpenIndex}
          >
            {r.crops.map((advice, i) => (
              <CropCard
                key={advice.crop}
                advice={advice}
                selected={i === openIndex}
                onSelect={() => setOpenIndex(i)}
                mr={mr}
              />
            ))}
          </Deck>

          {open ? (
            <div className="mt-8">
              <CropDetailPanel advice={open} mr={mr} />
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-6 rounded-[var(--radius-card)] border border-anar/50 bg-anar-wash px-4 py-3 text-[14px] text-anar">
          {mr
            ? "या हंगामात इथे शिफारस करण्यासारखं एकही पीक नाही. हंगाम किंवा पाण्याची सोय बदलून पुन्हा बघा."
            : "No crop suits this field this season. Try another season, or say whether you can irrigate."}
        </p>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Micronutrients items={r.micronutrients} mr={mr} />
        <ContextAudit
          context={r.context}
          soilTestSource={r.soil_test_source}
          soilClass={r.soil_class}
          mr={mr}
        />
      </div>
    </div>
  );
}
