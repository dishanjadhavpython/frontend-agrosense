"use client";

import Image from "next/image";
import { photo } from "@/lib/assets";
import { cn } from "@/lib/cn";
import { cleanEngineMarathi, cropFromEngine } from "@/data/cropOntology";
import { categoryTint, categoryLabel } from "@/data/crops";
import type { CropAdvice } from "@/lib/recommendTypes";

/**
 * One crop the engine ranked, as a card.
 *
 * ── The image slot ─────────────────────────────────────────────────────────
 *
 * Every recommendable crop draws its frame whether or not the photograph
 * exists. Twelve of the nineteen have no file yet, and a card that collapsed
 * to a text row while its neighbours carried photographs would read as a
 * lesser recommendation — it isn't one, the engine ranked it the same way.
 *
 * So the aspect ratio is fixed and the placeholder is the designed furrow
 * gradient, exactly as `Pallet` in `Prediction.tsx` already does it. Dropping
 * `public/img/crops/<key>.jpg` in and registering it in `assets.ts` changes
 * pixels and never layout.
 *
 * ── The name ───────────────────────────────────────────────────────────────
 *
 * Comes from `CROPS`, not from the engine. `crop_marathi` is the government
 * table's `Crop_Local_Name` and calls mung bean "मॉथ बीन", which is moth bean
 * — a different crop. See `cropOntology.ts`. The engine's own string is only
 * ever a fallback for something `CROPS` has never heard of, and even then it
 * goes through `cleanEngineMarathi`.
 */

const CLASS_LABEL: Record<string, { mr: string; en: string; tint: string }> = {
  S1: { mr: "अतिशय योग्य", en: "Highly suitable", tint: "bg-leaf-wash text-leaf-deep" },
  S2: { mr: "योग्य", en: "Suitable", tint: "bg-leaf-wash text-leaf-deep" },
  S3: { mr: "बेताचं", en: "Marginal", tint: "bg-haldi-wash text-haldi-ink" },
  N: { mr: "अयोग्य", en: "Not suitable", tint: "bg-anar-wash text-anar" },
  "?": { mr: "ठरवता आलं नाही", en: "Not assessed", tint: "bg-surface text-ink-mute" },
};

const DECIDED_BY: Record<string, { mr: string; en: string }> = {
  model: { mr: "मॉडेलनुसार", en: "by the model" },
  rules: { mr: "नियमांनुसार", en: "by the rules" },
  blend: { mr: "दोन्हींनुसार", en: "by model + rules" },
  "rules (out of distribution)": {
    mr: "नियमांनुसार (हा तालुका वेगळा आहे)",
    en: "by rules — this taluka is unlike the training set",
  },
};

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

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group/card relative flex h-full flex-col overflow-hidden rounded-[var(--radius-photo)] border text-left transition-colors",
        selected
          ? "border-leaf ring-2 ring-leaf/40"
          : "border-ink/10 hover:border-leaf/50",
      )}
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      {/* The slot. Fixed aspect, filled either way. */}
      <div className="relative aspect-[4/3] overflow-hidden bg-night">
        {src ? (
          <Image
            src={src}
            alt={crop ? (mr ? crop.mr : crop.en) : advice.crop}
            fill
            sizes="(max-width: 640px) 45vw, 240px"
            className="object-cover transition-transform duration-[1.1s] ease-[var(--ease-regur)] group-hover/card:scale-105"
          />
        ) : (
          /* `night` and `night-rise` rather than the green ramp, and that is
             the one place this card departs from `Pallet` in
             `Prediction.tsx`. The leaf tokens invert with the theme — in the
             dark `leaf-5` is #b7e04b — so that gradient turns a photo-less
             card into a glowing lime panel sitting next to real photographs.
             The night pair barely moves between themes, which is what a
             stand-in for a photograph needs to do. */
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
              "linear-gradient(180deg, rgba(7,12,9,.50) 0%, rgba(7,12,9,.10) 40%, rgba(7,12,9,.86) 100%)",
          }}
          aria-hidden
        />
        <span className="tnum absolute top-2.5 left-2.5 grid size-7 place-items-center rounded-full bg-chalk/95 text-[13px] font-bold text-on-light">
          {advice.rank}
        </span>
        <div className="absolute right-3 bottom-2.5 left-3">
          <p className="truncate text-[1.05rem] leading-tight font-semibold text-chalk font-[family-name:var(--font-display)]">
            {name}
          </p>
          {sub ? <p className="truncate text-[11.5px] text-mist">{sub}</p> : null}
        </div>
      </div>

      {/* `flex-1` so five cards in a row end level regardless of how many
          chips wrap — the rank badge is a comparison and a ragged bottom
          edge reads as one card mattering more than another. */}
      <div className="flex flex-1 flex-col bg-surface px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn("rounded-full px-2 py-0.5 text-[11.5px] font-medium", klass.tint)}>
            {mr ? klass.mr : klass.en}
          </span>
          {crop ? (
            <span className={cn("rounded-full px-2 py-0.5 text-[11.5px] font-medium", categoryTint[crop.category])}>
              {mr ? categoryLabel[crop.category].mr : categoryLabel[crop.category].en}
            </span>
          ) : null}
          {advice.requires_irrigation ? (
            <span className="rounded-full bg-jal-wash px-2 py-0.5 text-[11.5px] font-medium text-jal-ink">
              {mr ? "पाणी लागेल" : "Needs water"}
            </span>
          ) : null}
        </div>
        <p className="mt-auto pt-2 text-[12px] text-ink-mute">
          {mr ? "ठरवलं " : "Decided "}
          {(DECIDED_BY[advice.decided_by] ?? { mr: advice.decided_by, en: advice.decided_by })[
            mr ? "mr" : "en"
          ]}
        </p>
      </div>
    </button>
  );
}
