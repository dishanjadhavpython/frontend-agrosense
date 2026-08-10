import { CROPS } from "./crops";
import { FERTILIZERS } from "./fertilizers";
import { SOILS } from "./soils";
import type {
  PredictedCrop,
  PredictedFertilizer,
  PredictedSoil,
  PredictionResult,
} from "@/lib/cardTypes";
import type { FertVerdict } from "./prediction";

/**
 * The models' output, in the shapes the cards already draw.
 *
 * `prediction.ts` holds a hand-written worked example — every crop with its
 * reasoning, facts and notes, every bag with a dose and a timing. The models
 * produce none of that: they produce a name and a probability. So this maps
 * what they *do* produce onto the card-level shape, and the editorial detail
 * behind each card stays where it is, on the detail pages.
 *
 * A predicted item with no card in `CROPS` / `SOILS` / `FERTILIZERS` is
 * dropped rather than rendered as a placeholder. The model can return a crop
 * the site has no photograph or Marathi name for, and an unlabelled grey tile
 * in a row of real ones is worse than a shorter row.
 */

export type SoilCard = {
  key: string;
  score: number;
  alternatives: { key: string; score: number }[];
};

export type CropCard = {
  key: string;
  score: number;
  soilFit: PredictedCrop["soil_fit"];
};

export type FertCard = {
  key: string;
  score: number;
  verdict: FertVerdict;
};

const has = <T extends { key: string }>(list: T[], key: string) =>
  list.some((item) => item.key === key);

/** Model label → the key used across `src/data`. */
function fertilizerKey(name: string): string | null {
  const normalized = name.trim().toLowerCase();
  // The dataset writes this one as "20-20"; the site's card is the three-part
  // grade. Same product in this catalogue, different printed convention.
  const key = normalized === "20-20" ? "20-20-20" : normalized;
  return has(FERTILIZERS, key) ? key : null;
}

export function soilCardFrom(soil: PredictedSoil | null): SoilCard | null {
  if (!soil || !has(SOILS, soil.key)) return null;
  return {
    key: soil.key,
    score: Math.round(soil.confidence),
    alternatives: soil.alternatives
      .filter((alternative) => has(SOILS, alternative.key))
      .map((alternative) => ({
        key: alternative.key,
        score: Math.round(alternative.confidence),
      })),
  };
}

export function cropCardsFrom(crops: PredictedCrop[]): CropCard[] {
  return crops
    .map((crop) => ({
      key: crop.name.trim().toLowerCase(),
      score: Math.round(crop.confidence),
      soilFit: crop.soil_fit,
    }))
    .filter((crop) => has(CROPS, crop.key));
}

export function fertCardsFrom(fertilizers: PredictedFertilizer[]): FertCard[] {
  return fertilizers
    .map((fertilizer) => {
      const key = fertilizerKey(fertilizer.name);
      return key
        ? {
            key,
            score: Math.round(fertilizer.confidence),
            verdict: fertilizer.verdict as FertVerdict,
          }
        : null;
    })
    .filter((item): item is FertCard => item !== null);
}

export type LivePrediction = {
  soil: SoilCard | null;
  crops: CropCard[];
  fertilizers: FertCard[];
  /** False when no soil photograph reached the models. */
  soilApplied: boolean;
  /** True when the card's readings themselves came from OCR. */
  needsReview: boolean;
};

export function fromApi(result: PredictionResult): LivePrediction {
  return {
    soil: soilCardFrom(result.soil),
    crops: cropCardsFrom(result.crops),
    fertilizers: fertCardsFrom(result.fertilizers),
    soilApplied: result.soil_applied,
    needsReview: result.needs_review,
  };
}
