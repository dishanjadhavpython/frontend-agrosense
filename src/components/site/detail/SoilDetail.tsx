"use client";

import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/assets";
import { SOILS, retentionLabel, retentionTint } from "@/data/soils";
import { PREDICTED_SOIL } from "@/data/prediction";
import { SoilVisuals } from "./SoilVisuals";
import { Insights } from "./Insights";
import { LiveSoilBand } from "./LiveBand";
import { Badge, DetailPage } from "./DetailPage";

/**
 * One soil the classifier can name.
 *
 * All eight classes have a page now, not just the one the worked example
 * happened to use. The crops that suit it come from the suitability table
 * rather than from the fixture's crop list — a page about black soil linking
 * to the laterite example's crops was the old behaviour and it was wrong on
 * seven pages out of eight.
 */
export function SoilDetail({ soilKey }: { soilKey: string }) {
  const { lang } = useLang();
  const mr = lang === "mr";
  const soil = SOILS.find((s) => s.key === soilKey);
  if (!soil) return null;

  const retention = retentionLabel[soil.retention];
  const pick = PREDICTED_SOIL.key === soilKey ? PREDICTED_SOIL : undefined;

  return (
    <DetailPage
      eyebrow={mr ? "मातीचा प्रकार" : "Soil type"}
      title={mr ? soil.mr : soil.en}
      subtitle={mr ? soil.en : soil.mr}
      photoSrc={photo(soil.img)}
      photoAlt={mr ? soil.mr : soil.en}
      badges={
        <Badge className={retentionTint[soil.retention]}>
          {mr ? retention.mr : retention.en}
        </Badge>
      }
      live={<LiveSoilBand soilKey={soilKey} />}
      visuals={<SoilVisuals soilKey={soilKey} />}
      why={pick?.why}
      facts={pick?.facts}
      notes={pick?.notes}
      insights={<Insights category="soil" slug={soilKey} />}
    />
  );
}
