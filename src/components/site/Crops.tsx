"use client";

import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/assets";
import { CROPS, categoryLabel, categoryTint } from "@/data/crops";
import { PhotoPanel } from "@/components/ui/PhotoPanel";
import { MarqueeRow, MarqueeCard } from "@/components/ui/MarqueeRow";
import { Eyebrow, SectionHead } from "@/components/ui/Type";

/**
 * The 22 crops the recommendation model can return.
 *
 * Runs full-bleed, so this is deliberately not a <Section>: the copy sits in
 * the content column and the row spans the body. The 100vw break-out trick
 * would overflow by the width of the scrollbar.
 */
export function Crops() {
  const { t, lang } = useLang();
  const mr = lang === "mr";

  return (
    <section id="crops" className="py-11 md:py-14">
      <header className="mx-auto max-w-7xl px-5 md:px-8">
        <Eyebrow className="mb-4">{t("secCrops")}</Eyebrow>
        <SectionHead tone="output">
          {mr
            ? "बावीस पिकं, तुमच्या मातीनुसार"
            : "Twenty-two crops, matched to your soil"}
        </SectionHead>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">
          {mr
            ? "तुमच्या मातीतील नत्र, स्फुरद, पालाश, सामू आणि गावचा पाऊस — हे पाहून यातलं कोणतं पीक तुमच्या जमिनीला सर्वात योग्य ते सांगितलं जातं."
            : "Nitrogen, phosphorus, potassium, pH and your local rainfall together decide which of these fits your land best."}
        </p>
      </header>

      <MarqueeRow
        className="mt-9"
        baseVelocity={-2.4}
        ariaLabel={mr ? "शिफारस केलेली पिकं" : "Recommended crops"}
      >
        {CROPS.map((crop) => {
          const tag = categoryLabel[crop.category];
          return (
            <MarqueeCard
              key={crop.key}
              lead={mr ? crop.mr : crop.en}
              sub={mr ? crop.en : crop.mr}
              tag={mr ? tag.mr : tag.en}
              tagClass={categoryTint[crop.category]}
            >
              <PhotoPanel
                src={photo(crop.img)}
                awaiting={crop.img}
                alt={mr ? crop.mr : crop.en}
                ratio="1 / 1"
                sizes="(max-width: 640px) 55vw, 256px"
              />
            </MarqueeCard>
          );
        })}
      </MarqueeRow>

      <p className="mx-auto mt-8 max-w-7xl px-5 text-ink-mute md:px-8">
        {mr
          ? "तृणधान्य, कडधान्य, फळं आणि नगदी पिकं — सगळ्यांतून तुमच्यासाठी एकच निवडलं जातं."
          : "Grains, pulses, fruits and cash crops — one is picked out of all of them for you."}
      </p>
    </section>
  );
}
