"use client";

import { useCard } from "./cardState";
import { fromApi } from "@/data/predictionFromApi";
import type { StatusCode } from "./cardTypes";

/**
 * The farmer's own result, on a detail page.
 *
 * `CardProvider` is mounted in `src/app/(site)/layout.tsx`, above both the
 * prediction board and these pages. A client-side navigation from the board to
 * `/prediction/crop/mothbeans` therefore keeps the prediction in context —
 * which means the page a farmer opens by tapping their own top crop can show
 * their confidence, their soil's verdict on it, their card's nutrient status,
 * rather than the worked example's numbers.
 *
 * Opened cold — a bookmark, a refresh, a shared link — there is no prediction
 * and every hook here returns `null`. The band simply does not render. It is
 * never backfilled from the fixture: a page that shows someone else's 94%
 * beside their crop is the exact confusion the sample-figures notice exists to
 * prevent, and a missing band is a smaller loss than a wrong one.
 */

export type LiveCrop = {
  confidence: number;
  rank: number;
  soilFit?: "favoured" | "neutral" | "discouraged" | "unknown";
  /** The soil the ranking was made against, so the band can name it. */
  soilKey: string | null;
};

export type LiveSoil = {
  confidence: number;
  alternatives: { key: string; score: number }[];
};

export type LiveFert = {
  confidence: number;
  verdict: "apply" | "hold";
  /** Which macronutrients the card gave a printed range to judge against. */
  nutrientStatus: Record<"N" | "P" | "K", StatusCode | null>;
};

/** True when this page was reached from a real prediction this session. */
export function useHasPrediction(): boolean {
  return useCard().prediction !== null;
}

export function useLiveCrop(key: string): LiveCrop | null {
  const { prediction } = useCard();
  if (!prediction) return null;

  const live = fromApi(prediction);
  const index = live.crops.findIndex((crop) => crop.key === key);
  if (index === -1) return null;

  return {
    confidence: live.crops[index].score,
    rank: index + 1,
    soilFit: live.crops[index].soilFit,
    soilKey: live.soil?.key ?? null,
  };
}

export function useLiveSoil(key: string): LiveSoil | null {
  const { prediction } = useCard();
  if (!prediction) return null;

  const live = fromApi(prediction);
  if (!live.soil || live.soil.key !== key) return null;

  return { confidence: live.soil.score, alternatives: live.soil.alternatives };
}

export function useLiveFert(key: string): LiveFert | null {
  const { prediction } = useCard();
  if (!prediction) return null;

  const live = fromApi(prediction);
  const match = live.fertilizers.find((f) => f.key === key);
  if (!match) return null;

  return {
    confidence: match.score,
    verdict: match.verdict,
    nutrientStatus: live.nutrientStatus,
  };
}
