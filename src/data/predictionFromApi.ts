import { CROPS } from "./crops";
import { FERTILIZERS } from "./fertilizers";
import { SOILS } from "./soils";
import type {
  PredictedCrop,
  PredictedFertilizer,
  PredictedSoil,
  PredictionResult,
  RangeWarning,
  StatusCode,
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

export function soilCardFrom(soil: PredictedSoil): SoilCard | null {
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

function cropKeyFrom(name: string | undefined): string | null {
  const key = name?.trim().toLowerCase();
  return key && has(CROPS, key) ? key : null;
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
  /**
   * The crop key the fertilizers were scored for, when the site has a card for
   * it. Every fertilizer in one prediction serves this one crop.
   */
  fertilizersFor: string | null;
  /** True when the card's readings themselves came from OCR. */
  needsReview: boolean;
  /**
   * Inputs sitting outside the range their model was trained on. Carried up to
   * the board because a recommendation extrapolated past its training data is
   * still a recommendation, and the farmer is the one who has to weigh it.
   */
  outOfRange: RangeWarning[];
  /**
   * Which macronutrients the card printed a range for. A `null` means no bag
   * could be ruled in or out on that nutrient — the fertilizer verdicts lean
   * on these, so where they are absent the board has to say so.
   */
  nutrientStatus: Record<"N" | "P" | "K", StatusCode | null>;
  /** How many topics the agents started researching for this prediction. */
  researchStarted: number;
};

export function fromApi(result: PredictionResult): LivePrediction {
  return {
    soil: soilCardFrom(result.soil),
    crops: cropCardsFrom(result.crops),
    fertilizers: fertCardsFrom(result.fertilizers),
    fertilizersFor: cropKeyFrom(result.fertilizers_for),
    needsReview: result.needs_review,
    outOfRange: result.out_of_range ?? [],
    nutrientStatus: result.nutrient_status ?? { N: null, P: null, K: null },
    researchStarted: result.research?.started.length ?? 0,
  };
}
