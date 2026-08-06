/**
 * The 7 fertilizers the recommendation model can return: Urea, DAP, 14-35-14,
 * 28-28, 17-17-17, 20-20-20, 10-26-26.
 *
 * `npk` is the guaranteed analysis printed on the bag — the percentage of
 * nitrogen, phosphorus and potassium by weight. It is the whole reason a
 * farmer picks one bag over another, so the card leads with it.
 *
 * Every grade here is now sourced from a real bag photograph supplied for this
 * project (`data-sourse/fertilizers`), which corrected one of them: this list
 * previously carried **20-20** at [20, 20, 0]. Two independent bags in that
 * folder are 20-20-20 — a fully balanced water-soluble NPK, a different
 * product from 20-20-0 ammonium phosphate sulphate. If the trained model's
 * output vocabulary really does emit the string "20-20", the mapping between
 * its label and this entry has to be made explicit when the API is wired up;
 * they are no longer the same name.
 */

export type NutrientBias = "n" | "p" | "np" | "pk" | "balanced";

export type Fertilizer = {
  key: string;
  /** What's printed on the bag. Grades stay numeric in both languages. */
  name: string;
  mr: string;
  en: string;
  /** [N, P, K] as percentages by weight. */
  npk: [number, number, number];
  bias: NutrientBias;
  img: string;
};

const fert = (
  key: string,
  name: string,
  mr: string,
  en: string,
  npk: [number, number, number],
  bias: NutrientBias,
): Fertilizer => ({ key, name, mr, en, npk, bias, img: `fertilizers/${key}.jpg` });

export const FERTILIZERS: Fertilizer[] = [
  fert("urea", "Urea", "युरिया", "Urea", [46, 0, 0], "n"),
  fert("dap", "DAP", "डीएपी", "DAP", [18, 46, 0], "p"),
  fert("14-35-14", "14-35-14", "१४-३५-१४", "14-35-14", [14, 35, 14], "p"),
  fert("28-28", "28-28", "२८-२८", "28-28", [28, 28, 0], "np"),
  fert("17-17-17", "17-17-17", "१७-१७-१७", "17-17-17", [17, 17, 17], "balanced"),
  fert("20-20-20", "20-20-20", "२०-२०-२०", "20-20-20", [20, 20, 20], "balanced"),
  fert("10-26-26", "10-26-26", "१०-२६-२६", "10-26-26", [10, 26, 26], "pk"),
];

export const biasLabel: Record<NutrientBias, { mr: string; en: string }> = {
  n: { mr: "नत्र", en: "Nitrogen" },
  p: { mr: "स्फुरद", en: "Phosphorus" },
  np: { mr: "नत्र + स्फुरद", en: "N + P" },
  pk: { mr: "स्फुरद + पालाश", en: "P + K" },
  balanced: { mr: "संतुलित", en: "Balanced" },
};

/** Nutrient colours already established by the soil card and the readings. */
export const biasTint: Record<NutrientBias, string> = {
  n: "bg-leaf-wash text-leaf-deep",
  p: "bg-haldi-wash text-haldi-ink",
  np: "bg-leaf-wash text-leaf-deep",
  pk: "bg-anar-wash text-anar",
  balanced: "bg-jal-wash text-jal-ink",
};
