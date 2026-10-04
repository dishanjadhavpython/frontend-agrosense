"use client";

import { useState } from "react";
import { title as titleCase } from "@/lib/format";
import type { Recommendation } from "@/lib/recommendTypes";
import { CropCard } from "./CropCard";
import { CropDetailPanel } from "./CropDetailPanel";
import {
  ConfidenceNote,
  ContextAudit,
  Micronutrients,
  VetoedCrops,
} from "./RecommendAside";

/**
 * The engine's answer, on one board.
 *
 * The five ranked crops sit in a row and one of them is open below. That
 * shape is deliberate: a farmer needs one decision, not five, but the four
 * they did not pick have to stay visible or the ranking is just an assertion.
 * Clicking a card opens it — no accordion, no route change, nothing to lose
 * your place in.
 *
 * The order down the page is the order the questions arrive: is this answer
 * trustworthy at all (the abstention banner), what should I sow (the cards),
 * why and how much (the open crop), and then the three things that qualify
 * all of it — what was ruled out, what the soil is short of, and which
 * number came from whose measurement.
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
  const [openRank, setOpenRank] = useState(1);
  const open = r.crops.find((c) => c.rank === openRank) ?? r.crops[0];

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
          <ul className="mt-7 grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {r.crops.map((advice) => (
              <li key={advice.crop}>
                <CropCard
                  advice={advice}
                  selected={advice.rank === open?.rank}
                  onSelect={() => setOpenRank(advice.rank)}
                  mr={mr}
                />
              </li>
            ))}
          </ul>

          {open ? <CropDetailPanel advice={open} mr={mr} /> : null}
        </>
      ) : (
        <p className="mt-6 rounded-[var(--radius-card)] border border-anar/50 bg-anar-wash px-4 py-3 text-[14px] text-anar">
          {mr
            ? "या हंगामात इथे शिफारस करण्यासारखं एकही पीक नाही. खाली कारणं आहेत."
            : "Nothing clears the agronomic gate here this season. The reasons are below."}
        </p>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Micronutrients items={r.micronutrients} mr={mr} />
        <VetoedCrops vetoed={r.vetoed} notAssessable={r.not_assessable} mr={mr} />
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
