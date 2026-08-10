"use client";

import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/assets";
import { SOILS, retentionLabel, retentionTint } from "@/data/soils";
import { CROPS } from "@/data/crops";
import { PREDICTED_CROPS, type SoilPrediction } from "@/data/prediction";
import { Insights } from "./Insights";
import { Badge, DetailPage, type DetailLink } from "./DetailPage";

/** The classified soil, and everything the recommender put on it. */
export function SoilDetail({ pick }: { pick: SoilPrediction }) {
  const { lang } = useLang();
  const mr = lang === "mr";
  const soil = SOILS.find((s) => s.key === pick.key);
  if (!soil) return null;

  const retention = retentionLabel[soil.retention];

  const links: DetailLink[] = PREDICTED_CROPS.map((p) => {
    const crop = CROPS.find((c) => c.key === p.key);
    if (!crop) return null;
    return {
      href: `/prediction/crop/${crop.key}`,
      lead: mr ? crop.mr : crop.en,
      sub: `${p.score}% ${mr ? "जुळतं" : "match"}`,
    };
  }).filter((l): l is DetailLink => l !== null);

  return (
    <DetailPage
      eyebrow={mr ? "ओळखलेली माती" : "Soil, classified"}
      title={mr ? soil.mr : soil.en}
      subtitle={mr ? soil.en : soil.mr}
      photoSrc={photo(soil.img)}
      photoAlt={mr ? soil.mr : soil.en}
      badges={
        <>
          <Badge>
            {pick.score}% {mr ? "खात्री" : "confidence"}
          </Badge>
          <Badge className={retentionTint[soil.retention]}>
            {mr ? retention.mr : retention.en}
          </Badge>
          {/* The runners-up, kept on the page. A classifier that shows only its
              winner hides the part a farmer standing in the field can check. */}
          {pick.alternatives.map((alt) => {
            const other = SOILS.find((s) => s.key === alt.key);
            return (
              <Badge key={alt.key} className="bg-surface text-ink-mute ring-1 ring-line">
                {other ? (mr ? other.mr : other.en) : alt.key} {alt.score}%
              </Badge>
            );
          })}
        </>
      }
      why={pick.why}
      facts={pick.facts}
      notes={pick.notes}
      links={links}
      insights={<Insights category="soil" slug={pick.key} />}
      linksTitle={mr ? "या मातीत काय लावायचं" : "What we'd plant in it"}
    />
  );
}
