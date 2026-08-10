"use client";

import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/assets";
import { FERTILIZERS, biasLabel, biasTint } from "@/data/fertilizers";
import { CROPS } from "@/data/crops";
import {
  PREDICTED_CROPS,
  verdictLabel,
  verdictTint,
  type FertPrediction,
} from "@/data/prediction";
import { Insights } from "./Insights";
import { Badge, DetailPage, type DetailLink } from "./DetailPage";

/** One bag, and whether to buy it. */
export function FertDetail({ pick }: { pick: FertPrediction }) {
  const { lang } = useLang();
  const mr = lang === "mr";
  const fert = FERTILIZERS.find((f) => f.key === pick.key);
  if (!fert) return null;

  const verdict = verdictLabel[pick.verdict];
  const bias = biasLabel[fert.bias];

  const links: DetailLink[] = pick.crops
    .map((key) => {
      const crop = CROPS.find((c) => c.key === key);
      const cp = PREDICTED_CROPS.find((p) => p.key === key);
      if (!crop || !cp) return null;
      return {
        href: `/prediction/crop/${crop.key}`,
        lead: mr ? crop.mr : crop.en,
        sub: `${cp.score}% ${mr ? "जुळतं" : "match"}`,
      };
    })
    .filter((l): l is DetailLink => l !== null);

  // Timing is only a fact when there is an application to time. On a `hold`
  // it reads as "—", and a facts grid full of dashes is worse than one row
  // short.
  const facts =
    pick.verdict === "apply"
      ? [
          ...pick.facts,
          {
            label: { mr: "कधी द्यायचं", en: "When to apply" },
            value: pick.timing,
          },
        ]
      : pick.facts;

  return (
    <DetailPage
      eyebrow={mr ? "खताचा सल्ला" : "Fertilizer advice"}
      title={mr ? fert.mr : fert.en}
      subtitle={`${fert.name} · ${fert.npk.join("-")}`}
      photoSrc={photo(fert.img)}
      photoAlt={fert.name}
      badges={
        <>
          <Badge className={verdictTint[pick.verdict]}>
            {mr ? verdict.mr : verdict.en}
          </Badge>
          <Badge className={biasTint[fert.bias]}>
            {mr ? bias.mr : bias.en}
          </Badge>
          <Badge className="bg-surface text-ink-mute ring-1 ring-line">
            {mr ? pick.dose.mr : pick.dose.en}
          </Badge>
        </>
      }
      why={pick.why}
      facts={facts}
      notes={pick.notes}
      links={links}
      insights={<Insights category="fertilizer" slug={pick.key} />}
      linksTitle={mr ? "कोणत्या पिकांसाठी" : "Which of your crops"}
    />
  );
}
