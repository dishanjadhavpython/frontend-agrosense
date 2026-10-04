"use client";

import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/assets";
import { CROPS, categoryLabel, categoryTint } from "@/data/crops";
import { FERTILIZERS } from "@/data/fertilizers";
import {
  PREDICTED_FERTILIZERS,
  findCropPrediction,
  verdictLabel,
} from "@/data/prediction";
import { CropVisuals } from "./CropVisuals";
import { Insights } from "./Insights";
import { LiveCropBand } from "./LiveBand";
import { useLivePrediction } from "@/lib/livePick";
import { Badge, DetailPage, type DetailLink } from "./DetailPage";

/**
 * One crop the model can recommend.
 *
 * Takes a key rather than a fixture row. Every one of the 22 crops the model
 * can name has a page now — before this, `generateStaticParams` was fed from
 * the five-crop worked example and a farmer whose card came back `mothbeans`
 * got a 404 on their own top recommendation.
 *
 * So the hand-written copy is looked up and may be absent, and the page is
 * built from what always exists instead: the name and photograph, the
 * cultivation calendar, the farmer's live result if they came from a
 * prediction, and whatever the research agents have gathered.
 */
export function CropDetail({ cropKey }: { cropKey: string }) {
  const { lang } = useLang();
  const mr = lang === "mr";
  const live = useLivePrediction();
  const crop = CROPS.find((c) => c.key === cropKey);
  if (!crop) return null;

  const category = categoryLabel[crop.category];
  const isLive = live?.crops.some((c) => c.key === cropKey) ?? false;
  //: Written for five of the twenty-two, about one sample card. Shown only
  //: without a prediction, and labelled as the worked example when it is.
  const pick = live ? undefined : findCropPrediction(cropKey);

  // The bags this crop needs, carrying the verdict with them — a crop page
  // that links to a fertilizer without saying "hold off" would undo the one
  // useful thing the fertilizer deck says.
  //
  // With a prediction, these are the farmer's own verdicts, and only on the
  // crop the fertilizer model was actually run for: a verdict is a judgement
  // about one crop on one card, so the other crops have none to show. No dose
  // either — the model returns a verdict, and a dose would be invented.
  const links: DetailLink[] = live
    ? live.fertilizersFor === cropKey
      ? live.fertilizers
          .map((fp) => {
            const fert = FERTILIZERS.find((f) => f.key === fp.key);
            if (!fert) return null;
            const verdict = verdictLabel[fp.verdict];
            return {
              href: `/prediction/fertilizer/${fert.key}`,
              lead: `${mr ? fert.mr : fert.en} · ${fert.npk.join("-")}`,
              sub: `${mr ? verdict.mr : verdict.en} — ${mr ? "तुमच्या पत्रिकेवरून, या पिकासाठी" : "from your card, for this crop"}`,
            };
          })
          .filter((l): l is DetailLink => l !== null)
      : []
    : (pick?.fertilizers ?? [])
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
      eyebrow={mr ? "पीक" : "Crop"}
      title={mr ? crop.mr : crop.en}
      subtitle={mr ? crop.en : crop.mr}
      photoSrc={photo(crop.img)}
      photoAlt={mr ? crop.mr : crop.en}
      badges={
        <Badge className={categoryTint[crop.category]}>
          {mr ? category.mr : category.en}
        </Badge>
      }
      live={<LiveCropBand cropKey={cropKey} />}
      isLive={isLive}
      example={pick !== undefined}
      visuals={<CropVisuals cropKey={cropKey} />}
      why={pick?.why}
      facts={pick?.facts}
      notes={pick?.notes}
      links={links}
      insights={<Insights category="crop" slug={cropKey} />}
      linksTitle={
        pick
          ? mr ? "याला काय द्यायचं — नमुना उदाहरण" : "What to feed it — worked example"
          : mr ? "याला काय द्यायचं" : "What to feed it"
      }
    />
  );
}
