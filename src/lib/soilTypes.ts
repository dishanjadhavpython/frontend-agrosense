import type { SoilGuess } from "./cardTypes";

/**
 * The photograph's answer, and what it is allowed to mean.
 *
 * ── Why this is a check and not an input ───────────────────────────────────
 *
 * The engine took no image when this was written, so the photograph's only
 * honest job was to *disagree* with the survey. That has changed: the engine
 * now fuses the two (`src/rules/soil_fusion.py`), taking the survey's area
 * shares as the prior and the classifier's measured confusion matrix as the
 * likelihood, and reports the outcome as `context.soil_fusion`.
 *
 * What has not changed is the limit. Depth, drainage and salinity are
 * established by digging a profile pit, not by looking at a surface, so fusion
 * never touches them — a photograph can move texture and available water, and
 * can never lift a safety veto. Treating a photo-derived class as though it
 * were surveyed depth would be inventing a measurement, which is the one thing
 * this codebase refuses everywhere else.
 *
 * The comparison below is still worth showing beside it. The taluka's mapped
 * soil type is an average over a handful of sample points across a whole
 * taluka; a farmer's own field can genuinely differ from it, and that is worth
 * saying out loud before they sow.
 *
 * Hence: `compareSoil` returns agreement, disagreement, or "the two
 * vocabularies do not meet here" — and never resolves a disagreement.
 */

export type SoilReadResult = {
  /** The classifier's top class. */
  key: string;
  /** Percent, temperature-scaled. */
  confidence: number;
  alternatives: SoilGuess[];
  note: string;
  /**
   * Every class with its calibrated probability, summing to 1.
   *
   * `key`/`alternatives` are what a person reads; this is what the engine
   * consumes. It weighs the whole distribution against the taluka's soil
   * survey, and a 0.45/0.44 split means something very different from a
   * 0.45/0.05 one — a distinction the ranked list cannot carry.
   *
   * Optional because an older backend does not send it; the engine then
   * leaves the survey standing and says so in `soil_fusion.reason`.
   */
  probabilities?: Record<string, number>;
  research?: { started: string[]; skipped: string[]; reason?: string };
};

export type SoilErrorKind =
  | "no-image"
  | "too-large"
  | "unreadable"
  | "unavailable"
  | "limit"
  | "offline"
  | "unknown";

export type SoilErrorBody = {
  error: SoilErrorKind;
  message: { mr: string; en: string };
};

/**
 * Classifier class -> the survey's `Soil_Type` vocabulary.
 *
 * The two were built for different purposes and only partly overlap:
 *
 *   classifier (8)   alluvial · black · clay · cinder · laterite · peat · red · yellow
 *   survey (6)       Alluvial · Black (Regur) · Laterite · Mountain / Forest
 *                    · Red & Yellow · Saline / Alkaline
 *
 * Five classifier classes map. `clay`, `cinder` and `peat` have no counterpart
 * — they are texture or material, not one of the survey's pedological units —
 * and the survey's `Mountain / Forest` and `Saline / Alkaline` are two the
 * classifier was never trained to produce. Those cases return "unmapped"
 * rather than being forced into the nearest neighbour.
 */
const CLASS_TO_SURVEY: Record<string, string[]> = {
  alluvial: ["Alluvial"],
  black: ["Black (Regur)"],
  laterite: ["Laterite"],
  red: ["Red & Yellow"],
  yellow: ["Red & Yellow"],
};

export type SoilAgreement =
  | { verdict: "agrees"; surveyType: string; matched: string }
  | { verdict: "differs"; surveyType: string; expected: string[] }
  | { verdict: "unmapped"; surveyType: string | null };

/**
 * Does the photograph agree with what the survey says is under this taluka?
 *
 * `secondary` counts as agreement. The survey records a dominant type and a
 * runner-up, and a taluka is 66–78% its dominant soil — a farmer whose field
 * sits on the minority soil is not wrong, and the survey already says so.
 */
export function compareSoil(
  photoKey: string,
  surveyType: string | null | undefined,
  surveySecondary?: string | null,
): SoilAgreement {
  const expected = CLASS_TO_SURVEY[photoKey];
  if (!expected || !surveyType) {
    return { verdict: "unmapped", surveyType: surveyType ?? null };
  }
  const candidates = [surveyType, surveySecondary].filter(Boolean) as string[];
  const matched = candidates.find((c) => expected.includes(c));
  return matched
    ? { verdict: "agrees", surveyType, matched }
    : { verdict: "differs", surveyType, expected };
}
