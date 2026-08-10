"use client";

import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/assets";
import { CROPS, categoryLabel, categoryTint } from "@/data/crops";
import { FERTILIZERS } from "@/data/fertilizers";
import {
  PREDICTED_FERTILIZERS,
  verdictLabel,
  type CropPrediction,
} from "@/data/prediction";
import { Insights } from "./Insights";
import { Badge, DetailPage, type DetailLink } from "./DetailPage";

/** One recommended crop, and the bags matched to it. */
export function CropDetail({ pick }: { pick: CropPrediction }) {
  const { lang } = useLang();
  const mr = lang === "mr";
  const crop = CROPS.find((c) => c.key === pick.key);
  if (!crop) return null;

  const category = categoryLabel[crop.category];

  // The bags this crop needs, carrying the verdict with them — a crop page
  // that links to a fertilizer without saying "hold off" would undo the one
  // useful thing the fertilizer deck says.
  const links: DetailLink[] = pick.fertilizers
    .map((key) => {
      const fert = FERTILIZERS.find((f) => f.key === key);
      const fp = PREDICTED_FERTILIZERS.find((p) => p.key === key);
      if (!fert || !fp) return null;
      const verdict = verdictLabel[fp.verdict];
      return {
        href: `/prediction/fertilizer/${fert.key}`,
        lead: `${mr ? fert.mr : fert.en} · ${fert.npk.join("-")}`,
        sub: `${mr ? verdict.mr : verdict.en} — ${mr ? fp.dose.mr : fp.dose.en}`,
      };
    })
    .filter((l): l is DetailLink => l !== null);

  return (
    <DetailPage
      eyebrow={mr ? "शिफारस केलेलं पीक" : "Recommended crop"}
      title={mr ? crop.mr : crop.en}
      subtitle={mr ? crop.en : crop.mr}
      photoSrc={photo(crop.img)}
      photoAlt={mr ? crop.mr : crop.en}
      badges={
        <>
          <Badge>
            {pick.score}% {mr ? "जुळतं" : "match"}
          </Badge>
          <Badge className={categoryTint[crop.category]}>
            {mr ? category.mr : category.en}
          </Badge>
        </>
      }
      why={pick.why}
      facts={pick.facts}
      notes={pick.notes}
      links={links}
      insights={<Insights category="crop" slug={pick.key} />}
      linksTitle={mr ? "याला काय द्यायचं" : "What to feed it"}
    />
  );
}
