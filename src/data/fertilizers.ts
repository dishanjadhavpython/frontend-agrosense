/**
 * The 9 fertilizers this site stocks. The engine doses four of them — Urea,
 * DAP, MOP, SSP — because those are the four the government's fertiliser
 * table prescribes. The five complex grades below them are catalogue entries
 * only; see `cropOntology.ts`.
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

export type NutrientBias = "n" | "p" | "k" | "np" | "pk" | "balanced";

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
  // ---- The four the engine actually doses ---------------------------------
  // The government's fertiliser table prescribes exactly these, and the dose
  // plan comes back in kg/ha of each. MOP and SSP were missing until the
  // engine was wired up — a recommendation of "88.67 kg/ha of MOP" had no
  // product to point at. Both now have bag photographs (see `assets.ts`).
  fert("urea", "Urea", "युरिया", "Urea", [46, 0, 0], "n"),
  fert("dap", "DAP", "डीएपी", "DAP", [18, 46, 0], "p"),
  fert("mop", "MOP", "एमओपी", "MOP", [0, 0, 60], "k"),
  fert("ssp", "SSP", "एसएसपी", "SSP", [0, 16, 0], "p"),

  // ---- Complex grades: catalogue only -------------------------------------
  // Real bags a farmer can buy, and they stay on the site for that reason.
  // But the engine will never name one, because the table it doses from does
  // not carry them — see `RECOMMENDABLE_FERTILIZER_KEYS` in `cropOntology.ts`.
  // Do not render these as engine output.
  fert("14-35-14", "14-35-14", "१४-३५-१४", "14-35-14", [14, 35, 14], "p"),
  fert("28-28", "28-28", "२८-२८", "28-28", [28, 28, 0], "np"),
  fert("17-17-17", "17-17-17", "१७-१७-१७", "17-17-17", [17, 17, 17], "balanced"),
  fert("20-20-20", "20-20-20", "२०-२०-२०", "20-20-20", [20, 20, 20], "balanced"),
  fert("10-26-26", "10-26-26", "१०-२६-२६", "10-26-26", [10, 26, 26], "pk"),
];

export const biasLabel: Record<NutrientBias, { mr: string; en: string }> = {
  n: { mr: "नत्र", en: "Nitrogen" },
  p: { mr: "स्फुरद", en: "Phosphorus" },
  k: { mr: "पालाश", en: "Potassium" },
  np: { mr: "नत्र + स्फुरद", en: "N + P" },
  pk: { mr: "स्फुरद + पालाश", en: "P + K" },
  balanced: { mr: "संतुलित", en: "Balanced" },
};

/** Nutrient colours already established by the soil card and the readings. */
export const biasTint: Record<NutrientBias, string> = {
  n: "bg-leaf-wash text-leaf-deep",
  p: "bg-haldi-wash text-haldi-ink",
  // Potassium's own colour, the same one `pk` leads with.
  k: "bg-anar-wash text-anar",
  np: "bg-leaf-wash text-leaf-deep",
  pk: "bg-anar-wash text-anar",
  balanced: "bg-jal-wash text-jal-ink",
};
