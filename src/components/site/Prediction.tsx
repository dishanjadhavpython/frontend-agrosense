"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Layers, Sprout } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/assets";
import { cn } from "@/lib/cn";
import { CROPS, categoryLabel, categoryTint } from "@/data/crops";
import { SOILS, retentionLabel, retentionTint } from "@/data/soils";
import { FERTILIZERS } from "@/data/fertilizers";
import {
  PREDICTED_CROPS,
  PREDICTED_FERTILIZERS,
  PREDICTED_SOIL,
  findFertPrediction,
  applyCount,
  verdictLabel,
  verdictTint,
  type FertVerdict,
} from "@/data/prediction";
import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import { Deck } from "@/components/ui/Deck";
import { useCard } from "@/lib/cardState";
import { fromApi } from "@/data/predictionFromApi";

/**
 * The three models, on one board.
 *
 * Everything above this section on the page describes what the product can do.
 * This is the first thing that shows a result: the classifier's answer for the
 * ground, the recommender's ranked crops for it, and the bags to feed them —
 * including the two bags the honest answer is to not buy.
 *
 * Crops and fertilizers each get their own deck rather than sharing one,
 * because they are different questions with different cardinalities. The link
 * between them survives on the pallets themselves — every fertilizer names the
 * crops it was matched to.
 */

export function Prediction() {
  const { lang } = useLang();
  const mr = lang === "mr";
  const { prediction } = useCard();

  // A real prediction replaces the worked example outright. Where the models
  // returned something the site has no card for, the row is simply shorter —
  // never padded from the fixture, because a mix of measured and invented
  // results with nothing to tell them apart is the failure this whole page is
  // built to avoid.
  const live = prediction ? fromApi(prediction) : null;

  const soil = live?.soil ?? (live ? null : PREDICTED_SOIL);
  const crops = live ? live.crops : PREDICTED_CROPS;
  const fertilizers = live ? live.fertilizers : PREDICTED_FERTILIZERS;
  const buys = live
    ? fertilizers.filter((f) => f.verdict === "apply").length
    : applyCount();

  return (
    <Section
      id="prediction"
      eyebrow={mr ? "अंदाज" : "The prediction"}
      heading={mr ? "काय लावायचं, आणि काय द्यायचं" : "What we'd plant, and what to feed it"}
      // Green: this is model output, which is the one thing allowed to take it.
      headingClassName="text-leaf"
      lede={
        mr
          ? "तुमच्या मातीचा प्रकार ओळखला, त्यावर कोणती पिकं चांगली येतील ते क्रमाने लावलं, आणि प्रत्येकाला काय द्यायचं ते ठरवलं — त्यात कोणतं खत घ्यायचं नाही हेही आलं."
          : "The soil named, the crops that suit it ranked, and what to feed each one — including which bags to walk past."
      }
    >
      {/* The standing notice, promoted rather than deleted: it now states
          where the result came from instead of warning that it came from
          nowhere. A farmer must never mistake a demonstration for their own
          result and buy fertilizer against it. */}
      <Reveal className="mt-8">
        <p
          role="status"
          className={cn(
            "rounded-[var(--radius-card)] border px-4 py-3 text-[14px] leading-relaxed",
            live
              ? "border-leaf/40 bg-leaf-wash text-leaf-deep"
              : "border-haldi/50 bg-haldi-wash text-haldi-ink",
          )}
        >
          {live ? (
            <>
              <strong className="font-semibold">
                {mr ? "तुमच्या पत्रिकेवरून. " : "From your card. "}
              </strong>
              {live.soilApplied
                ? mr
                  ? "मातीचा फोटो आणि पत्रिकेवरचे आकडे — दोन्ही वापरले आहेत."
                  : "Your soil photo and your card's readings, both used."
                : mr
                  ? "पत्रिकेवरच्या आकड्यांवरून. मातीचा फोटो दिला नव्हता, त्यामुळे मातीचा प्रकार ओळखलेला नाही."
                  : "From the card's readings alone — no soil photo was sent, so the soil type has not been identified."}
              {live.needsReview
                ? mr
                  ? " आकडे फोटोतून वाचले असल्याने ते आधी तपासून घ्या."
                  : " The readings came from a photo, so check them before acting on this."
                : ""}
            </>
          ) : (
            <>
              <strong className="font-semibold">
                {mr ? "नमुना अंदाज. " : "Sample prediction. "}
              </strong>
              {mr
                ? "वर तुमची पत्रिका दिलीत की इथले निकाल तुमच्या शेताचे होतील. तोपर्यंत हा नमुना आहे."
                : "Add your card above and these become your field's. Until then this is a worked example."}
            </>
          )}
        </p>
      </Reveal>

      {/* Soil, then crops, then fertilizer — the order the product works in,
          and now three decks in one visual language rather than a panel
          followed by two carousels. */}
      {soil ? (
        <DeckBlock
          icon={<Layers className="size-[18px]" strokeWidth={1.9} aria-hidden />}
          title={mr ? "ओळखलेली माती" : "Soil, classified"}
          note={mr ? `${soil.score}% खात्री` : `${soil.score}% confidence`}
        >
          {/* One card, so no `<Deck>`: a carousel with a single slide and one
              pagination dot is a control that cannot be operated.

              The width, the centring and the vertical padding are copied from
              the deck's scroller (`px-[calc(50%-8.75rem)] py-8`) rather than
              chosen, because this card sits directly above two decks and any
              difference reads as a mistake rather than as a distinction. */}
          <div className="relative isolate flex justify-center py-8">
            {/* The bloom. Two decks below this one glow — the crop deck green,
                the fertilizer deck gold — and without it the soil card was the
                one piece of model output sitting on flat paper.

                Drawn as light behind the card rather than as a shadow under
                it: a single centred card has nothing to cast onto, and the
                subject is soil lit from above. Green, because green is what
                this site reserves for model output.

                `-z-10` with `isolate` on the parent keeps it behind the card
                and out of the section's stacking context, so it cannot bleed
                over the deck heading above. */}
            <div
              className="pointer-events-none absolute inset-0 -z-10"
              aria-hidden
            >
              {/* The hue has to change with the theme, and not for taste.
                  `leaf` is a deep standing-crop green on paper — blurred over
                  a near-white page it produces grey haze, which reads as dirt
                  on the screen rather than as light. So paper takes the paler
                  `leaf-3`, which blooms, and the dark theme takes `leaf`,
                  which there is a bright lime. */}
              <div
                className="absolute top-1/2 left-1/2 h-[24rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 opacity-70 blur-[56px] [--glow:var(--color-leaf-3)] dark:opacity-75 dark:[--glow:var(--color-leaf)]"
                style={{
                  background:
                    "radial-gradient(closest-side, var(--glow) 0%, color-mix(in oklab, var(--glow) 55%, transparent) 48%, transparent 100%)",
                }}
              />
            </div>

            <div className="w-[17.5rem] sm:w-[22rem]">
              <SoilPallet pick={soil} />
            </div>
          </div>
        </DeckBlock>
      ) : null}

      <DeckBlock
        icon={<Sprout className="size-[18px]" strokeWidth={1.9} aria-hidden />}
        title={mr ? "शिफारस केलेली पिकं" : "Crops we'd plant"}
        note={
          mr
            ? `${crops.length} पिकं, जुळणीच्या क्रमाने`
            : `${crops.length} crops, best match first`
        }
      >
        <Deck label={mr ? "शिफारस केलेली पिकं" : "Recommended crops"} glow="leaf">
          {crops.map((p) => (
            <CropPallet key={p.key} pick={p} />
          ))}
        </Deck>
      </DeckBlock>

      <DeckBlock
        icon={<Layers className="size-[18px]" strokeWidth={1.9} aria-hidden />}
        title={mr ? "खतांचा सल्ला" : "Fertilizer plan"}
        note={
          mr
            ? `${fertilizers.length} पैकी ${buys} घ्यायची`
            : `${buys} of ${fertilizers.length} worth buying`
        }
      >
        {/* Gold, not green — the fertilizer deck blooms in turmeric so the two
            decks read as two different answers at a glance in the dark. */}
        <Deck label={mr ? "खतांचा सल्ला" : "Fertilizer plan"} glow="haldi">
          {fertilizers.map((p) => (
            <FertPallet key={p.key} pick={p} />
          ))}
        </Deck>
      </DeckBlock>
    </Section>
  );
}

function DeckBlock({
  icon,
  title,
  note,
  children,
}: {
  icon: ReactNode;
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-12">
      <Reveal>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h3 className="flex items-center gap-2.5 text-[17px] font-semibold text-ink">
            <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-leaf-wash text-leaf">
              {icon}
            </span>
            {title}
          </h3>
          <p className="text-[14px] text-ink-mute">{note}</p>
        </div>
      </Reveal>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/* ---- The soil ----------------------------------------------------------- */

/**
 * The soil, as one card.
 *
 * This used to be a full-width panel — an arc gauge, retention and pH chips, a
 * three-row bar chart of what the classifier also considered, and a large
 * photographic strip below a hairline. Several screens of weight for a single
 * word of output, sitting directly above two compact carousels that say more
 * with less. Beside them it read as a different product.
 *
 * So it is now a pallet in the same language as `CropPallet`: the photograph,
 * the name, the calibrated confidence. The gauge and the full distribution
 * moved to `/prediction/soil/[key]`, which is where somebody who wants that
 * detail is already heading, and the runner-up stays here because "laterite,
 * but it could be red" is a materially different answer from "laterite" and
 * belongs next to the claim, not one click away.
 */
function SoilPallet({
  pick,
}: {
  pick: { key: string; score: number; alternatives: { key: string; score: number }[] };
}) {
  const { lang } = useLang();
  const mr = lang === "mr";
  const soil = SOILS.find((s) => s.key === pick.key);
  if (!soil) return null;

  const retention = retentionLabel[soil.retention];
  const runnerUp = pick.alternatives[0];
  const runnerUpSoil = runnerUp ? SOILS.find((s) => s.key === runnerUp.key) : undefined;

  return (
    <Pallet
      href={`/prediction/soil/${soil.key}`}
      src={photo(soil.img)}
      alt={mr ? soil.mr : soil.en}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="tnum rounded-full bg-chalk/15 px-2.5 py-1 text-[13px] font-semibold text-chalk ring-1 ring-chalk/25 backdrop-blur-sm">
          {pick.score}% {mr ? "खात्री" : "sure"}
        </span>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[12px] font-semibold",
            retentionTint[soil.retention],
          )}
        >
          {mr ? retention.mr : retention.en}
        </span>
      </div>

      <PalletFoot lead={mr ? soil.mr : soil.en} sub={mr ? soil.en : soil.mr} />

      {/* The second guess, kept on the card. A classifier trained on 28 real
          photographs of some of these soils is not entitled to state one
          answer and stop talking. */}
      {runnerUpSoil ? (
        <p className="mt-1.5 text-[12px] text-mist">
          {mr ? "किंवा " : "or "}
          {mr ? runnerUpSoil.mr : runnerUpSoil.en}
          <span className="tnum"> {runnerUp.score}%</span>
        </p>
      ) : null}
    </Pallet>
  );
}

/* ---- The pallets --------------------------------------------------------
   A photograph filling the card, the scrim at its foot, and the whole thing is
   one link. The arrow is drawn inside that link rather than being a second
   target — two hit areas doing the same job is how a card starts fighting
   itself on a touchscreen. */

function Pallet({
  href,
  src,
  alt,
  children,
}: {
  href: string;
  src?: string;
  alt: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group/pallet relative block aspect-[3/4] overflow-hidden rounded-[26px] border border-ink/10 bg-night"
      style={{ boxShadow: "var(--shadow-panel)" }}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 640px) 280px, 352px"
          className="object-cover transition-transform duration-[1.1s] ease-[var(--ease-regur)] group-hover/pallet:scale-105"
        />
      ) : (
        <div
          className="field-rows absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(160deg, var(--color-leaf-4) 0%, var(--color-leaf-5) 60%, var(--color-night-rise) 100%)",
          }}
          aria-hidden
        />
      )}

      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(7,12,9,.55) 0%, rgba(7,12,9,.12) 34%, rgba(7,12,9,.82) 78%, rgba(7,12,9,.92) 100%)",
        }}
        aria-hidden
      />

      <div className="relative flex h-full flex-col justify-between p-5">
        {children}
      </div>
    </Link>
  );
}

function PalletFoot({
  lead,
  sub,
  meta,
}: {
  lead: string;
  sub: string;
  meta?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-[1.35rem] leading-tight font-semibold text-chalk">
          {lead}
        </p>
        <p className="mt-0.5 truncate text-[14px] text-mist">{sub}</p>
        {meta}
      </div>
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-chalk text-on-light transition-transform duration-300 group-hover/pallet:translate-x-0.5">
        <ArrowRight className="size-5" strokeWidth={2} aria-hidden />
      </span>
    </div>
  );
}

function CropPallet({ pick }: { pick: { key: string; score: number } }) {
  const { lang } = useLang();
  const mr = lang === "mr";
  const crop = CROPS.find((c) => c.key === pick.key);
  if (!crop) return null;

  const category = categoryLabel[crop.category];

  return (
    <Pallet
      href={`/prediction/crop/${crop.key}`}
      src={photo(crop.img)}
      alt={mr ? crop.mr : crop.en}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="tnum rounded-full bg-chalk/15 px-2.5 py-1 text-[13px] font-semibold text-chalk ring-1 ring-chalk/25 backdrop-blur-sm">
          {pick.score}% {mr ? "जुळतं" : "match"}
        </span>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[12px] font-semibold",
            categoryTint[crop.category],
          )}
        >
          {mr ? category.mr : category.en}
        </span>
      </div>

      <PalletFoot
        lead={mr ? crop.mr : crop.en}
        sub={mr ? crop.en : crop.mr}
      />
    </Pallet>
  );
}

/**
 * `pick` carries only what a model can produce — a key, a score and a verdict.
 * The dose and the crop list are editorial, written by hand in
 * `prediction.ts`, and are looked up rather than required: a live prediction
 * for a bag nobody has written copy for should still render as a card, just
 * without the sentence underneath.
 */
function FertPallet({
  pick,
}: {
  pick: { key: string; score: number; verdict: FertVerdict };
}) {
  const { lang } = useLang();
  const mr = lang === "mr";
  const fert = FERTILIZERS.find((f) => f.key === pick.key);
  if (!fert) return null;

  const editorial = findFertPrediction(pick.key);
  const verdict = verdictLabel[pick.verdict];
  // Which of your crops this bag is for — the crop→fertilizer link, kept
  // visible now that the two decks scroll independently of each other.
  const forCrops = (editorial?.crops ?? [])
    .map((k) => CROPS.find((c) => c.key === k))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => (mr ? c.mr : c.en))
    .join(", ");

  return (
    <Pallet
      href={`/prediction/fertilizer/${fert.key}`}
      src={photo(fert.img)}
      alt={fert.name}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="tnum rounded-full bg-chalk/15 px-2.5 py-1 text-[13px] font-semibold text-chalk ring-1 ring-chalk/25 backdrop-blur-sm">
          {fert.npk[0]}-{fert.npk[1]}-{fert.npk[2]}
        </span>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[12px] font-semibold",
            verdictTint[pick.verdict],
          )}
        >
          {mr ? verdict.mr : verdict.en}
        </span>
      </div>

      <PalletFoot
        lead={mr ? fert.mr : fert.en}
        sub={editorial ? (mr ? editorial.dose.mr : editorial.dose.en) : fert.name}
        meta={
          forCrops ? (
            <p className="mt-2 truncate text-[13px] text-mist/85">
              {mr ? "यासाठी: " : "For: "}
              {forCrops}
            </p>
          ) : null
        }
      />
    </Pallet>
  );
}
