"use client";

import Link from "next/link";
import { Droplets, Sprout, ThumbsDown } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { CROPS } from "@/data/crops";
import { SOILS, retentionLabel } from "@/data/soils";
import { findSuitability } from "@/data/soilSuitability";
import { DotMeter, Widget, WidgetGrid } from "./Widgets";

/**
 * What this ground grows, and what it fights.
 *
 * Reads the suitability table rather than the worked example's crop list. The
 * old soil page linked to whichever crops the fixture happened to contain,
 * which was right for laterite and wrong for the other seven soils — now that
 * all eight have pages, that would have been seven pages confidently
 * recommending the Konkan's crops for the Deccan's soil.
 *
 * Crops are links, so the two halves of the recommendation join up: a farmer
 * reading about their black soil can tap straight through to cotton.
 */
export function SoilVisuals({ soilKey }: { soilKey: string }) {
  const { lang } = useLang();
  const mr = lang === "mr";
  const soil = SOILS.find((s) => s.key === soilKey);
  const fit = findSuitability(soilKey);
  if (!soil || !fit) return null;

  const retention = retentionLabel[soil.retention];
  const holding = soil.retention === "high" ? 5 : soil.retention === "medium" ? 3 : 1;

  const named = (keys: string[]) =>
    keys
      .map((k) => CROPS.find((c) => c.key === k))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));

  return (
    <section className="mt-12 border-t border-line pt-8">
      <h2 className="text-[1.3rem] leading-tight font-semibold text-ink font-[family-name:var(--font-display)]">
        {mr ? "या जमिनीत काय येतं" : "What this ground grows"}
      </h2>

      <WidgetGrid>
        <Widget
          span
          title={mr ? "ही जमीन कशी वागते" : "How it behaves"}
          icon={<Droplets className="size-[18px]" strokeWidth={1.9} aria-hidden />}
          tint="bg-jal-wash text-jal-ink"
        >
          <p className="text-[1.02rem] leading-relaxed text-ink-soft">
            {mr ? fit.why.mr : fit.why.en}
          </p>
          <div className="mt-5 border-t border-line pt-4">
            <DotMeter
              value={holding}
              label={`${mr ? "पाणी धरून ठेवण्याची क्षमता" : "Water holding"} — ${mr ? retention.mr : retention.en}`}
            />
          </div>
        </Widget>

        <Widget
          title={mr ? "चांगली येणारी पिकं" : "Crops it suits"}
          note={`${fit.favoured.length}`}
          icon={<Sprout className="size-[18px]" strokeWidth={1.9} aria-hidden />}
        >
          <CropChips crops={named(fit.favoured)} mr={mr} tone="good" />
        </Widget>

        <Widget
          title={mr ? "टाळावी अशी पिकं" : "Crops it fights"}
          note={fit.discouraged.length ? `${fit.discouraged.length}` : undefined}
          icon={<ThumbsDown className="size-[18px]" strokeWidth={1.9} aria-hidden />}
          tint="bg-haldi-wash text-haldi-ink"
        >
          {fit.discouraged.length ? (
            <CropChips crops={named(fit.discouraged)} mr={mr} tone="bad" />
          ) : (
            // Alluvial genuinely discourages nothing, and saying so is more
            // useful than an empty box that looks like missing data.
            <p className="text-[15px] leading-relaxed text-ink-mute">
              {mr
                ? "या जमिनीत जवळपास सगळंच येतं — टाळावं असं काही नाही."
                : "Nothing in particular. This soil suits almost everything on the list."}
            </p>
          )}
        </Widget>
      </WidgetGrid>

      <p className="mt-4 text-[12.5px] leading-relaxed text-ink-mute">
        {mr
          ? "ही जोडणी ICAR च्या मार्गदर्शनावरून बनवलेली तक्ता आहे, मॉडेलचा निकाल नाही — आणि कृषी तज्ज्ञाकडून तपासलेली नाही."
          : "This pairing is a compiled table from ICAR guidance, not a model output — and it has not been checked by an agronomist."}
      </p>
    </section>
  );
}

function CropChips({
  crops,
  mr,
  tone,
}: {
  crops: { key: string; mr: string; en: string }[];
  mr: boolean;
  tone: "good" | "bad";
}) {
  return (
    <ul className="flex flex-wrap gap-2">
      {crops.map((crop) => (
        <li key={crop.key}>
          <Link
            href={`/prediction/crop/${crop.key}`}
            className={
              tone === "good"
                ? "inline-flex min-h-9 items-center rounded-full bg-leaf-wash px-3 py-1.5 text-[13.5px] font-medium text-leaf-deep transition-colors hover:bg-leaf hover:text-paper"
                : "inline-flex min-h-9 items-center rounded-full bg-surface px-3 py-1.5 text-[13.5px] font-medium text-ink-mute ring-1 ring-line transition-colors hover:text-ink"
            }
          >
            {mr ? crop.mr : crop.en}
          </Link>
        </li>
      ))}
    </ul>
  );
}
