"use client";

import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/assets";
import { SOILS, retentionLabel, retentionTint } from "@/data/soils";
import { PhotoPanel } from "@/components/ui/PhotoPanel";
import { MarqueeRow, MarqueeCard } from "@/components/ui/MarqueeRow";
import { Eyebrow, SectionHead } from "@/components/ui/Type";

/**
 * The 9 soils the classifier can tell apart, from a photograph of the ground.
 *
 * Drifts right, against the crop row above it — three rows all sliding the
 * same way would read as one long conveyor belt.
 */
export function Soils() {
  const { lang } = useLang();
  const mr = lang === "mr";

  return (
    <section id="soils" className="py-11 md:py-14">
      <header className="mx-auto max-w-7xl px-5 md:px-8">
        <Eyebrow className="mb-4">{mr ? "मातीचे प्रकार" : "Soil types"}</Eyebrow>
        <SectionHead tone="output">
          {mr
            ? "फोटो काढा, माती ओळखली जाते"
            : "Photograph the ground, and we name the soil"}
        </SectionHead>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">
          {mr
            ? "कार्ड नसलं तरी चालेल. शेतातल्या मातीचा फोटो काढा — नऊ प्रकारांपैकी तुमची कोणती ते ओळखून, त्याप्रमाणे सल्ला मिळतो."
            : "No card, no problem. Photograph the soil in your field and it's matched against nine types, then advised accordingly."}
        </p>
      </header>

      <MarqueeRow
        className="mt-9"
        baseVelocity={2}
        ariaLabel={mr ? "मातीचे प्रकार" : "Soil types"}
      >
        {SOILS.map((s) => {
          const tag = retentionLabel[s.retention];
          return (
            <MarqueeCard
              key={s.key}
              lead={mr ? s.mr : s.en}
              sub={mr ? s.en : s.mr}
              tag={mr ? tag.mr : tag.en}
              tagClass={retentionTint[s.retention]}
            >
              <PhotoPanel
                src={photo(s.img)}
                awaiting={s.img}
                alt={mr ? s.mr : s.en}
                ratio="1 / 1"
                sizes="(max-width: 640px) 55vw, 256px"
              />
            </MarqueeCard>
          );
        })}
      </MarqueeRow>

      <p className="mx-auto mt-8 max-w-7xl px-5 text-ink-mute md:px-8">
        {mr
          ? "माती किती पाणी धरून ठेवते यावर पाण्याचं आणि खताचं वेळापत्रक ठरतं."
          : "How much water a soil holds is what sets the irrigation and fertilizer schedule."}
      </p>
    </section>
  );
}
