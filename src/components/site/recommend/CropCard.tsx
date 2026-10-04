"use client";

import Image from "next/image";
import { ChevronDown, Droplets } from "lucide-react";
import { photo } from "@/lib/assets";
import { cn } from "@/lib/cn";
import { cleanEngineMarathi, cropFromEngine } from "@/data/cropOntology";
import { categoryTint, categoryLabel } from "@/data/crops";
import type { CropAdvice } from "@/lib/recommendTypes";
import { factorLabel } from "./FactorBreakdown";

/**
 * One crop the engine ranked, as a pallet in the recommendation deck.
 *
 * The same object the worked example's crops are drawn as (`Pallet` in
 * `Prediction.tsx`): the photograph filling a tall rounded card, a scrim at its
 * foot, the type on the photograph. The board used to lay these out as a grid
 * of short buttons, and a `<button>` shrinks to its content rather than filling
 * its cell — so every card came out a different width with the gaps between
 * them wherever the text happened to end. In a deck every pallet has one fixed
 * width and the row scrolls, so they cannot drift.
 *
 * A button, not a link: tapping a crop opens what the engine worked out about
 * it directly under the deck, which is the thing a farmer is deciding on. The
 * crop's own page — general information and the agents' latest — is one tap
 * further, from the panel the card opens.
 *
 * ── The image slot ─────────────────────────────────────────────────────────
 *
 * Every recommendable crop draws its frame whether or not the photograph
 * exists, so a crop without one never reads as a lesser recommendation.
 *
 * ── The name ───────────────────────────────────────────────────────────────
 *
 * From `CROPS`, not the engine: `crop_marathi` is the government table's
 * `Crop_Local_Name`, which calls mung bean "मॉथ बीन" (moth bean, a different
 * crop). See `cropOntology.ts`.
 */

export const CLASS_LABEL: Record<string, { mr: string; en: string; tint: string }> = {
  S1: { mr: "अतिशय योग्य", en: "Highly suitable", tint: "bg-leaf-wash text-leaf-deep" },
  S2: { mr: "योग्य", en: "Suitable", tint: "bg-leaf-wash text-leaf-deep" },
  S3: { mr: "बेताचं", en: "Marginal", tint: "bg-haldi-wash text-haldi-ink" },
  N: { mr: "अयोग्य", en: "Not suitable", tint: "bg-anar-wash text-anar" },
  "?": { mr: "ठरवता आलं नाही", en: "Not assessed", tint: "bg-surface text-ink-mute" },
};

const ACRES_PER_HA = 2.471;

export function CropCard({
  advice,
  selected,
  onSelect,
  mr,
}: {
  advice: CropAdvice;
  selected: boolean;
  onSelect: () => void;
  mr: boolean;
}) {
  const crop = cropFromEngine(advice.crop);
  const name = crop
    ? (mr ? crop.mr : crop.en)
    : (mr ? cleanEngineMarathi(advice.crop_marathi) ?? advice.crop : advice.crop);
  const sub = crop ? (mr ? crop.en : crop.mr) : null;
  const src = crop ? photo(crop.img) : undefined;
  const klass = CLASS_LABEL[advice.suitability_class] ?? CLASS_LABEL["?"];

  // The one number a farmer compares crops on, in the unit they sell in.
  const yieldQAcre =
    !advice.yield_abstained && advice.yield_p50_t_ha != null
      ? (advice.yield_p50_t_ha * 10) / ACRES_PER_HA
      : null;
  const weakest = advice.factors[advice.limiting_factor as keyof typeof advice.factors];
  const heldBack = typeof weakest === "number" && weakest < 0.75;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group/pallet relative block aspect-[3/4] w-full overflow-hidden rounded-[26px] border bg-night text-left",
        "transition-[border-color,box-shadow] duration-300",
        selected ? "border-leaf ring-[3px] ring-leaf/45" : "border-ink/10 hover:border-leaf/50",
      )}
      style={{ boxShadow: "var(--shadow-panel)" }}
    >
      {src ? (
        <Image
          src={src}
          alt={crop ? (mr ? crop.mr : crop.en) : advice.crop}
          fill
          sizes="(max-width: 640px) 280px, 352px"
          className="object-cover transition-transform duration-[1.1s] ease-[var(--ease-regur)] group-hover/pallet:scale-105"
        />
      ) : (
        /* `night` and `night-rise` rather than the green ramp: the leaf tokens
           invert with the theme, and a photo-less card turned into a glowing
           lime panel next to real photographs. */
        <div
          className="field-rows absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(160deg, var(--color-night-rise) 0%, var(--color-night) 100%)",
          }}
          aria-hidden
        />
      )}

      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(7,12,9,.58) 0%, rgba(7,12,9,.08) 30%, rgba(7,12,9,.70) 62%, rgba(7,12,9,.94) 100%)",
        }}
        aria-hidden
      />

      <div className="relative flex h-full flex-col justify-between p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="tnum grid size-10 shrink-0 place-items-center rounded-full bg-chalk text-[16px] font-bold text-on-light">
            {advice.rank}
          </span>
          <span className={cn("rounded-full px-2.5 py-1 text-[12.5px] font-semibold", klass.tint)}>
            {mr ? klass.mr : klass.en}
          </span>
        </div>

        <div>
          <p className="truncate text-[1.6rem] leading-tight font-semibold text-chalk font-[family-name:var(--font-display)]">
            {name}
          </p>
          {sub ? <p className="mt-0.5 truncate text-[14px] text-mist">{sub}</p> : null}

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {crop ? (
              <span className={cn("rounded-full px-2 py-0.5 text-[11.5px] font-semibold", categoryTint[crop.category])}>
                {mr ? categoryLabel[crop.category].mr : categoryLabel[crop.category].en}
              </span>
            ) : null}
            {advice.requires_irrigation ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-jal-wash px-2 py-0.5 text-[11.5px] font-semibold text-jal-ink">
                <Droplets className="size-3" strokeWidth={2.2} aria-hidden />
                {mr ? "पाणी लागेल" : "Needs water"}
              </span>
            ) : null}
          </div>

          {/* Two facts a farmer compares crops on: what it should yield, and
              the one thing in its way. */}
          <dl className="mt-3.5 grid grid-cols-2 gap-3 border-t border-chalk/15 pt-3.5">
            <div className="min-w-0">
              <dt className="text-[11.5px] text-mist/85">{mr ? "अपेक्षित उत्पन्न" : "Expected yield"}</dt>
              <dd className="tnum mt-0.5 truncate text-[15px] font-semibold text-chalk">
                {yieldQAcre != null
                  ? mr
                    ? `${yieldQAcre.toFixed(1)} क्विं./एकर`
                    : `${yieldQAcre.toFixed(1)} q/acre`
                  : "—"}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11.5px] text-mist/85">{mr ? "अडथळा" : "Held back by"}</dt>
              <dd className="mt-0.5 truncate text-[15px] font-semibold text-chalk">
                {heldBack ? factorLabel(advice.limiting_factor, mr) : mr ? "काही नाही" : "Nothing serious"}
              </dd>
            </div>
          </dl>

          <p
            className={cn(
              "mt-3.5 flex items-center gap-1.5 text-[13px] font-semibold",
              selected ? "text-leaf-3 dark:text-leaf" : "text-chalk/80",
            )}
          >
            {selected
              ? mr ? "माहिती खाली उघडली आहे" : "Details open below"
              : mr ? "माहितीसाठी दाबा" : "Tap for details"}
            <ChevronDown
              className={cn("size-4 transition-transform", selected ? "" : "-rotate-90")}
              strokeWidth={2.2}
              aria-hidden
            />
          </p>
        </div>
      </div>
    </button>
  );
}
