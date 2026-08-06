"use client";

import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/assets";
import { FERTILIZERS, biasLabel, biasTint } from "@/data/fertilizers";
import { PhotoPanel } from "@/components/ui/PhotoPanel";
import { MarqueeRow, MarqueeCard } from "@/components/ui/MarqueeRow";
import { Eyebrow, SectionHead } from "@/components/ui/Type";

/**
 * The 7 fertilizers the model can recommend.
 *
 * The grade sits on the photograph rather than under it: N-P-K is the entire
 * reason a farmer reaches for one bag over another, and it's the one thing on
 * a fertilizer sack that is genuinely worth reading.
 */
export function Fertilizers() {
  const { lang } = useLang();
  const mr = lang === "mr";

  return (
    <section id="fertilizers" className="py-11 md:py-14">
      <header className="mx-auto max-w-7xl px-5 md:px-8">
        <Eyebrow className="mb-4">{mr ? "खतं" : "Fertilizers"}</Eyebrow>
        <SectionHead tone="output">
          {mr ? "कोणतं खत, किती, आणि कधी" : "Which bag, how much, and when"}
        </SectionHead>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">
          {mr
            ? "दुकानात सात प्रकारची खतं मिळतात. तुमच्या मातीत जे आधीच पुरेसं आहे ते पुन्हा विकत घेण्याची गरज नाही."
            : "Seven bags on the shop shelf. You don't need to buy back what your soil already has."}
        </p>
      </header>

      <MarqueeRow
        className="mt-9"
        baseVelocity={-2.2}
        ariaLabel={mr ? "खतांचे प्रकार" : "Fertilizer types"}
      >
        {FERTILIZERS.map((f) => {
          const tag = biasLabel[f.bias];
          return (
            <MarqueeCard
              key={f.key}
              lead={mr ? f.mr : f.en}
              sub={`${f.npk[0]}-${f.npk[1]}-${f.npk[2]}`}
              tag={mr ? tag.mr : tag.en}
              tagClass={biasTint[f.bias]}
            >
              <PhotoPanel
                src={photo(f.img)}
                awaiting={f.img}
                alt={f.name}
                ratio="1 / 1"
                sizes="(max-width: 640px) 55vw, 256px"
              >
                <NpkBars npk={f.npk} />
              </PhotoPanel>
            </MarqueeCard>
          );
        })}
      </MarqueeRow>

      <p className="mx-auto mt-8 max-w-7xl px-5 text-ink-mute md:px-8">
        {mr
          ? "आकडे म्हणजे नत्र – स्फुरद – पालाश यांचं प्रमाण. युरियात फक्त नत्र असतो, डीएपीत स्फुरद जास्त."
          : "The numbers are nitrogen – phosphorus – potassium by weight. Urea is nitrogen only; DAP leans hard on phosphorus."}
      </p>
    </section>
  );
}

/**
 * The guaranteed analysis, drawn over the bottom of the card. Three bars
 * scaled against 46 — urea's nitrogen, the highest figure any of these carry —
 * so the bars are comparable across the whole row rather than each card
 * normalising to itself. That comparison is the one thing the sacks cannot do
 * for themselves: every bag prints its own grade, none of them prints how it
 * measures against the six beside it.
 *
 * Deliberately short. It was twice this height while these cards were on
 * placeholders and there was nothing underneath worth seeing; now there is a
 * real sack behind it with the grade printed on it, and an overlay that
 * covers the printed grade to redraw the printed grade is just the same fact
 * twice, with the photograph paying for it.
 */
function NpkBars({ npk }: { npk: [number, number, number] }) {
  const colors = [
    "var(--color-leaf-4)",
    "var(--color-haldi)",
    "var(--color-anar)",
  ];

  return (
    <div
      className="absolute inset-x-0 bottom-0 flex items-end gap-2 px-3 pt-4 pb-2.5"
      aria-hidden
      style={{
        // Holds near-full opacity across the whole panel and fades only at
        // the very top. A soft gradient left the numerals sitting at ~0.35
        // alpha, which is unreadable chalk-on-bright-green.
        background:
          "linear-gradient(to top, rgba(7,12,9,.88) 0%, rgba(7,12,9,.86) 62%, rgba(7,12,9,0) 100%)",
      }}
    >
      {npk.map((v, i) => (
        <div key={i} className="flex-1">
          <div className="mb-1 flex h-8 items-end">
            <div
              className="w-full rounded-xs"
              style={{
                height: `${Math.max(4, (v / 46) * 100)}%`,
                backgroundColor: colors[i],
              }}
            />
          </div>
          <p className="tnum text-center text-[12px] leading-none font-semibold text-chalk">
            {v}
          </p>
        </div>
      ))}
    </div>
  );
}
