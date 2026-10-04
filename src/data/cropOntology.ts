import { CROPS } from "./crops";
import { FERTILIZERS } from "./fertilizers";

/**
 * The bridge between what the recommendation engine says and what this site
 * can name, photograph and link to.
 *
 * The engine returns crops under their Agricultural Production Yearbook
 * spellings — `Arhar/Tur`, `Moong(Green Gram)`, `Cotton(lint)`, `Rapeseed
 * &Mustard`. Those are join keys from a government table, not labels: they
 * carry punctuation, inconsistent spacing and regional synonyms. This maps
 * each one onto the site's own key, which is what routes, photographs and
 * cultivation calendars are all filed under.
 *
 * ── Why the engine's own Marathi is not used ────────────────────────────────
 *
 * Every `CropAdvice` carries a `crop_marathi`, taken from the fertiliser
 * table's `Crop_Local_Name` column. It cannot be shown to a farmer:
 *
 *   Mungbean       -> "मॉथ बीन"              wrong crop entirely; मॉथ बीन is
 *                                            moth bean (मटकी), not mung (मूग)
 *   Rice           -> "तांदूळ/धान/भात/साळ"    four synonyms, slash-separated
 *   Ragi           -> "रागी/नाचणी/नागली"      three synonyms
 *   Pigeon Pea     -> "Pigeon Pea"           no Marathi at all
 *   Cotton(lint)   -> "टेट्राप्लॉइड कापूस"      a botanical variety, not कापूस
 *   Indian Mustard -> "भारतीय मोहरी"          stilted
 *
 * So the engine's crop string is treated as an identifier and nothing else.
 * Display names come from `CROPS`, which are hand-checked and already the
 * names used everywhere else on the site. `crop_marathi` is a last-resort
 * fallback only, and `cleanEngineMarathi` below takes the first synonym.
 */

/** Engine crop string (APY spelling) -> `CROPS[].key`. All 19 the engine
 *  can rank. Nothing else is recommendable; anything absent here the engine
 *  either vetoes or reports as not assessable. */
export const ENGINE_TO_CROP_KEY: Record<string, string> = {
  // ---- Already on the site (7) -------------------------------------------
  Rice: "rice",
  Maize: "maize",
  Gram: "chickpea",
  "Arhar/Tur": "pigeonpeas",
  "Moong(Green Gram)": "mungbean",
  Urad: "blackgram",
  "Cotton(lint)": "cotton",

  // ---- Added for the engine (12) -----------------------------------------
  // Maharashtra's actual staples, none of which the site could name before.
  Jowar: "sorghum",
  Bajra: "pearlmillet",
  Wheat: "wheat",
  Soyabean: "soybean",
  Sugarcane: "sugarcane",
  Groundnut: "groundnut",
  Safflower: "safflower",
  Sunflower: "sunflower",
  Sesamum: "sesame",
  Linseed: "linseed",
  Ragi: "fingermillet",
  "Rapeseed &Mustard": "mustard",
};

/** The engine's fertiliser products -> `FERTILIZERS[].key`.
 *
 *  The government table prescribes exactly four straight fertilisers. The five
 *  complex grades this site also stocks (14-35-14, 28-28, 17-17-17, 20-20-20,
 *  10-26-26) are catalogue entries — real bags a farmer can buy — but the
 *  engine will never name one, because the table it doses from does not. */
export const ENGINE_TO_FERTILIZER_KEY: Record<string, string> = {
  Urea: "urea",
  DAP: "dap",
  MOP: "mop",
  SSP: "ssp",
};

/** Every site crop key the engine can actually return. Derived, never typed
 *  twice — this is what separates "the model recommended it" from "the site
 *  has a page about it". */
export const RECOMMENDABLE_CROP_KEYS: ReadonlySet<string> = new Set(
  Object.values(ENGINE_TO_CROP_KEY),
);

export const RECOMMENDABLE_FERTILIZER_KEYS: ReadonlySet<string> = new Set(
  Object.values(ENGINE_TO_FERTILIZER_KEY),
);

/** `CROPS[].key` -> the engine's spelling, for the rare reverse lookup. */
export const CROP_KEY_TO_ENGINE: Record<string, string> = Object.fromEntries(
  Object.entries(ENGINE_TO_CROP_KEY).map(([engine, key]) => [key, engine]),
);

/**
 * The site's own record for an engine crop string, or `undefined`.
 *
 * `undefined` means the engine named something this site has never heard of —
 * which after the ontology test below can only happen if the engine's crop
 * vocabulary grows. The caller shows the raw name rather than dropping the
 * recommendation, because a crop the model ranked is a crop the farmer should
 * see, photograph or no photograph.
 */
export function cropFromEngine(engineCrop: string) {
  const key = ENGINE_TO_CROP_KEY[engineCrop];
  return key ? CROPS.find((c) => c.key === key) : undefined;
}

export function fertilizerFromEngine(product: string) {
  const key = ENGINE_TO_FERTILIZER_KEY[product];
  return key ? FERTILIZERS.find((f) => f.key === key) : undefined;
}

/**
 * The engine's `crop_marathi`, reduced to one name.
 *
 * Only for a crop with no `CROPS` entry — see the header. `तांदूळ/धान/भात/साळ`
 * becomes `तांदूळ`. Returns null when the column held English (Pigeon Pea) or
 * nothing, so the caller falls through to the English name rather than
 * printing a Latin string into Marathi copy.
 */
export function cleanEngineMarathi(value: string | null): string | null {
  if (!value) return null;
  const first = value.split("/")[0]!.trim();
  if (!first) return null;
  // Devanagari block. An entry that never entered it is untranslated.
  return /[ऀ-ॿ]/.test(first) ? first : null;
}
