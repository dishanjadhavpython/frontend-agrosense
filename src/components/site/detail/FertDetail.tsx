"use client";

import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/assets";
import { FERTILIZERS, biasLabel, biasTint } from "@/data/fertilizers";
import { findFertPrediction } from "@/data/prediction";
import { fertilizerTopicSlug } from "@/data/topics";
import { FertVisuals } from "./FertVisuals";
import { Insights } from "./Insights";
import { LiveFertBand } from "./LiveBand";
import { useHasPrediction, useLiveFert } from "@/lib/livePick";
import { Badge, DetailPage } from "./DetailPage";

/**
 * One bag, and whether to buy it.
 *
 * All seven blends have a page. The verdict is no longer read off the fixture
 * — it comes from the farmer's own card through `<LiveFertBand>`, because
 * "apply" or "hold" is a property of their soil, not of the product. A page
 * opened without a prediction shows the composition and the guidance and
 * declines to give a verdict at all, which is the honest version.
 */
export function FertDetail({ fertKey }: { fertKey: string }) {
  const { lang } = useLang();
  const mr = lang === "mr";
  const hasPrediction = useHasPrediction();
  const isLive = useLiveFert(fertKey) !== null;
  const fert = FERTILIZERS.find((f) => f.key === fertKey);
  if (!fert) return null;

  const bias = biasLabel[fert.bias];
  // Example copy only without a prediction, and labelled — see SoilDetail.
  const pick = hasPrediction ? undefined : findFertPrediction(fertKey);

  return (
    <DetailPage
      eyebrow={mr ? "खत" : "Fertilizer"}
      title={mr ? fert.mr : fert.en}
      subtitle={`${fert.name} · ${fert.npk.join("-")}`}
      photoSrc={photo(fert.img)}
      photoAlt={fert.name}
      badges={
        <Badge className={biasTint[fert.bias]}>{mr ? bias.mr : bias.en}</Badge>
      }
      live={<LiveFertBand fertKey={fertKey} />}
      isLive={isLive}
      example={pick !== undefined}
      visuals={<FertVisuals fertKey={fertKey} />}
      why={pick?.why}
      facts={pick?.facts}
      notes={pick?.notes}
      // The research topic is spelled `20-20` where this catalogue says
      // `20-20-20`. One seam, already mapped, reused rather than repeated.
      insights={<Insights category="fertilizer" slug={fertilizerTopicSlug(fertKey)} />}
    />
  );
}
