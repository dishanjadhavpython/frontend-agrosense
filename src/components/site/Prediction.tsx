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
  applyCount,
  verdictLabel,
  verdictTint,
  type CropPrediction,
  type FertPrediction,
} from "@/data/prediction";
import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import { Deck } from "@/components/ui/Deck";
import { ArcGauge } from "@/components/ui/ArcGauge";
import { Logo } from "./Logo";

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
  const buys = applyCount();

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
      {/* Not negotiable while this is a fixture: a farmer must never mistake a
          demonstration for their own result and buy fertilizer against it. */}
      <Reveal className="mt-8">
        <p
          role="status"
          className="rounded-[var(--radius-card)] border border-haldi/50 bg-haldi-wash px-4 py-3 text-[14px] leading-relaxed text-haldi-ink"
        >
          <strong className="font-semibold">
            {mr ? "नमुना अंदाज. " : "Sample prediction. "}
          </strong>
          {mr
            ? "तिन्ही मॉडेल अजून जोडलेली नाहीत — खालचा निकाल नमुन्याचा आहे, तुमच्या शेताचा नाही."
            : "None of the three models is wired up yet — what follows is a worked example, not a reading of your field."}
        </p>
      </Reveal>

      <Reveal className="mt-6">
        <SoilWidget />
      </Reveal>

      <DeckBlock
        icon={<Sprout className="size-[18px]" strokeWidth={1.9} aria-hidden />}
        title={mr ? "शिफारस केलेली पिकं" : "Crops we'd plant"}
        note={
          mr
            ? `${PREDICTED_CROPS.length} पिकं, जुळणीच्या क्रमाने`
            : `${PREDICTED_CROPS.length} crops, best match first`
        }
      >
        <Deck label={mr ? "शिफारस केलेली पिकं" : "Recommended crops"} glow="leaf">
          {PREDICTED_CROPS.map((p) => (
            <CropPallet key={p.key} pick={p} />
          ))}
        </Deck>
      </DeckBlock>

      <DeckBlock
        icon={<Layers className="size-[18px]" strokeWidth={1.9} aria-hidden />}
        title={mr ? "खतांचा सल्ला" : "Fertilizer plan"}
        note={
          mr
            ? `${PREDICTED_FERTILIZERS.length} पैकी ${buys} घ्यायची`
            : `${buys} of ${PREDICTED_FERTILIZERS.length} worth buying`
        }
      >
        {/* Gold, not green — the fertilizer deck blooms in turmeric so the two
            decks read as two different answers at a glance in the dark. */}
        <Deck label={mr ? "खतांचा सल्ला" : "Fertilizer plan"} glow="haldi">
          {PREDICTED_FERTILIZERS.map((p) => (
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
 * A cut through the ground.
 *
 * This was a two-column banner — photograph left, text right — and it was the
 * flattest thing on a board of 3D pallets, with a strip of dead space down the
 * middle. Worse, it was shaped like every other card on the internet and said
 * nothing about its subject.
 *
 * So the card is drawn as the thing it describes: paper above the line is the
 * air, a surface rule crosses it with the logo's shoot breaking through, and
 * the photograph runs full-bleed underneath as the earth. Soil belongs at the
 * bottom of the frame, and putting it there is most of the idea.
 *
 * The confidence takes `<ArcGauge>` — the dot-matrix semicircle PLAN.md §7
 * held in reserve precisely because "it reads as an instrument rather than a
 * chart". This is the first place on the public site that has earned it.
 *
 * And the runners-up become a distribution rather than a sentence. A softmax
 * has a shape, that shape is how you tell a confident call from a coin flip,
 * and "also considered: red soil 6%" throws it away.
 */
function SoilWidget() {
  const { lang } = useLang();
  const mr = lang === "mr";
  const p = PREDICTED_SOIL;
  const soil = SOILS.find((s) => s.key === p.key);
  if (!soil) return null;

  const src = photo(soil.img);
  const retention = retentionLabel[soil.retention];

  const spread = [{ key: p.key, score: p.score }, ...p.alternatives];

  return (
    <Link
      href={`/prediction/soil/${soil.key}`}
      className="group block overflow-hidden rounded-[var(--radius-photo)] border border-line bg-surface transition-colors hover:border-leaf/45"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      {/* ---- Above the line. ------------------------------------------- */}
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-6 p-6 sm:p-7">
        <div className="min-w-0">
          <p className="eyebrow text-ink-mute">
            {mr ? "ओळखलेली माती" : "Soil, classified"}
          </p>

          <h3 className="section-head mt-3 text-[1.75rem] text-ink sm:text-[2.1rem]">
            {mr ? soil.mr : soil.en}
          </h3>
          <p className="mt-1 text-[15px] text-ink-mute">
            {mr ? soil.en : soil.mr}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[13px] font-semibold",
                retentionTint[soil.retention],
              )}
            >
              {mr ? retention.mr : retention.en}
            </span>
            <span className="tnum rounded-full bg-surface px-2.5 py-1 text-[13px] font-semibold text-ink-mute ring-1 ring-line">
              {mr ? "सामू ४.५–६.०" : "pH 4.5–6.0"}
            </span>
          </div>
        </div>

        {/* The instrument. */}
        <ArcGauge
          value={p.score}
          display={`${p.score}%`}
          label={mr ? "खात्री" : "confidence"}
          className="w-[8.5rem] shrink-0 sm:w-[10rem]"
        />
      </div>

      {/* ---- The distribution. What the classifier actually returned. --- */}
      <div className="px-6 pb-7 sm:px-7">
        <p className="eyebrow text-ink-mute">
          {mr ? "मॉडेलने काय काय तपासलं" : "What the model weighed"}
        </p>
        <ul className="mt-3 space-y-2">
          {spread.map((row, i) => {
            const other = SOILS.find((s) => s.key === row.key);
            const winner = i === 0;
            return (
              <li key={row.key} className="flex items-center gap-3">
                <span
                  className={cn(
                    "w-[7.5rem] shrink-0 truncate text-[14px] sm:w-[9rem]",
                    winner ? "font-semibold text-ink" : "text-ink-mute",
                  )}
                >
                  {other ? (mr ? other.mr : other.en) : row.key}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-leaf-1">
                  <span
                    className={cn(
                      "block h-full rounded-full",
                      winner ? "bg-leaf" : "bg-leaf-3",
                    )}
                    style={{ width: `${row.score}%` }}
                  />
                </span>
                <span
                  className={cn(
                    "tnum w-10 shrink-0 text-right text-[13px]",
                    winner ? "font-semibold text-ink" : "text-ink-mute",
                  )}
                >
                  {row.score}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* ---- The surface, with the shoot through it. -------------------
              `z-10` is load-bearing: the chip hangs half below the line, and
              the ground below it comes later in the DOM — without a stacking
              order the photograph paints over the bottom half of the shoot and
              slices it in two. */}
      <div className="relative z-10 h-px bg-ink/15">
        <span className="absolute -top-[18px] left-6 grid size-9 place-items-center rounded-full border border-line bg-surface text-leaf sm:left-7">
          <Logo className="size-5" />
        </span>
      </div>

      {/* ---- Below the line: the ground itself. ------------------------ */}
      <div className="relative h-36 overflow-hidden bg-leaf-wash sm:h-44">
        {src ? (
          <Image
            src={src}
            alt={mr ? soil.mr : soil.en}
            fill
            sizes="(max-width: 1280px) 100vw, 1216px"
            className="object-cover transition-transform duration-[1.2s] ease-[var(--ease-regur)] group-hover:scale-105"
          />
        ) : null}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(7,12,9,.30) 0%, rgba(7,12,9,.52) 62%, rgba(7,12,9,.74) 100%)",
          }}
          aria-hidden
        />
        <p className="absolute bottom-5 left-6 inline-flex items-center gap-1.5 text-[15px] font-semibold text-chalk sm:left-7">
          {mr ? "सविस्तर पहा" : "See the detail"}
          <ArrowRight
            className="size-4 transition-transform duration-300 group-hover:translate-x-1"
            strokeWidth={2}
            aria-hidden
          />
        </p>
      </div>
    </Link>
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

function CropPallet({ pick }: { pick: CropPrediction }) {
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

function FertPallet({ pick }: { pick: FertPrediction }) {
  const { lang } = useLang();
  const mr = lang === "mr";
  const fert = FERTILIZERS.find((f) => f.key === pick.key);
  if (!fert) return null;

  const verdict = verdictLabel[pick.verdict];
  // Which of your crops this bag is for — the crop→fertilizer link, kept
  // visible now that the two decks scroll independently of each other.
  const forCrops = pick.crops
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
        sub={mr ? pick.dose.mr : pick.dose.en}
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
