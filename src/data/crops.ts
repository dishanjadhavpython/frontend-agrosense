/**
 * The 34 crops this site can name, 19 of which the engine recommends.
 *
 * `key` is the model's own label, and `img` is `crops/<key>.jpg`, so a
 * prediction maps straight to a card with no lookup table in between. Don't
 * rename a key without renaming the label it came from.
 *
 * Grouped by category rather than by season: the set spans the whole country
 * (apple, coffee and jute are not Maharashtra crops), so a Maharashtra sowing
 * season would be invented for a third of this list.
 *
 * Two populations live here now, and `cropOntology.ts` is what tells them
 * apart. The 19 in `RECOMMENDABLE_CROP_KEYS` are what the engine ranks and
 * doses. The other 15 — mango, banana, apple, coffee — keep their photographs,
 * calendars and detail pages, but the engine cannot return them, so they are
 * content rather than model output. Never present the second group as a
 * recommendation.
 *
 * Until a photograph is delivered and registered in `src/lib/assets.ts`, each
 * card falls back to the designed placeholder.
 */

export type CropCategory = "grain" | "pulse" | "oilseed" | "fruit" | "cash";

export type Crop = {
  key: string;
  mr: string;
  en: string;
  category: CropCategory;
  img: string;
};

const crop = (
  key: string,
  mr: string,
  en: string,
  category: CropCategory,
): Crop => ({ key, mr, en, category, img: `crops/${key}.jpg` });

export const CROPS: Crop[] = [
  // ---- Cereals & grains (2) ----------------------------------------------
  crop("rice", "भात", "Rice", "grain"),
  crop("maize", "मका", "Maize", "grain"),

  // ---- Pulses (7) --------------------------------------------------------
  crop("chickpea", "हरभरा", "Chickpea", "pulse"),
  crop("pigeonpeas", "तूर", "Pigeon peas", "pulse"),
  crop("mungbean", "मूग", "Mung bean", "pulse"),
  crop("blackgram", "उडीद", "Black gram", "pulse"),
  crop("lentil", "मसूर", "Lentil", "pulse"),
  crop("mothbeans", "मटकी", "Moth beans", "pulse"),
  crop("kidneybeans", "राजमा", "Kidney beans", "pulse"),

  // ---- Fruits (10) -------------------------------------------------------
  crop("banana", "केळी", "Banana", "fruit"),
  crop("mango", "आंबा", "Mango", "fruit"),
  crop("grapes", "द्राक्ष", "Grapes", "fruit"),
  crop("pomegranate", "डाळिंब", "Pomegranate", "fruit"),
  crop("orange", "संत्रं", "Orange", "fruit"),
  crop("papaya", "पपई", "Papaya", "fruit"),
  crop("coconut", "नारळ", "Coconut", "fruit"),
  crop("watermelon", "कलिंगड", "Watermelon", "fruit"),
  crop("muskmelon", "खरबूज", "Muskmelon", "fruit"),
  crop("apple", "सफरचंद", "Apple", "fruit"),

  // ---- Commercial & cash (3) ---------------------------------------------
  crop("cotton", "कापूस", "Cotton", "cash"),
  crop("jute", "ताग", "Jute", "cash"),
  crop("coffee", "कॉफी", "Coffee", "cash"),

  // ---- What Maharashtra actually grows (12) -------------------------------
  // Added with the recommendation engine. Every one of these is a crop the
  // engine ranks and none of them could be named here before — the list above
  // spans the whole country and omits the state's own staples. Wheat, jowar
  // and bajra are its three biggest cereals by area; soybean and sugarcane
  // dominate the cash side.
  //
  // Marathi names are written here, hand-checked, and are authoritative. The
  // engine also returns a `crop_marathi` off the government fertiliser table
  // and it cannot be used — it calls mung bean "मॉथ बीन", which is moth bean,
  // a different crop. See `cropOntology.ts`.
  //
  // All twelve have photographs (see `assets.ts`). The card reserves the
  // image space either way, so a replacement photograph changes pixels and
  // never layout.
  crop("sorghum", "ज्वारी", "Sorghum", "grain"),
  crop("pearlmillet", "बाजरी", "Pearl millet", "grain"),
  crop("wheat", "गहू", "Wheat", "grain"),
  crop("fingermillet", "नाचणी", "Finger millet", "grain"),
  crop("soybean", "सोयाबीन", "Soybean", "oilseed"),
  crop("groundnut", "भुईमूग", "Groundnut", "oilseed"),
  crop("safflower", "करडई", "Safflower", "oilseed"),
  crop("sunflower", "सूर्यफूल", "Sunflower", "oilseed"),
  crop("sesame", "तीळ", "Sesame", "oilseed"),
  crop("linseed", "जवस", "Linseed", "oilseed"),
  crop("mustard", "मोहरी", "Mustard", "oilseed"),
  crop("sugarcane", "ऊस", "Sugarcane", "cash"),
];

export const categoryLabel: Record<CropCategory, { mr: string; en: string }> = {
  grain: { mr: "तृणधान्य", en: "Grain" },
  pulse: { mr: "कडधान्य", en: "Pulse" },
  oilseed: { mr: "तेलबिया", en: "Oilseed" },
  fruit: { mr: "फळ", en: "Fruit" },
  cash: { mr: "नगदी", en: "Cash crop" },
};

/** Tints come from the palette already in globals.css — no new hues. */
export const categoryTint: Record<CropCategory, string> = {
  grain: "bg-haldi-wash text-haldi-ink",
  pulse: "bg-leaf-wash text-leaf-deep",
  // A deeper step on the green ramp rather than a new hue — `jal` is already
  // the cash-crop tint and the palette is closed. leaf-2 reads as distinctly
  // darker than pulse's leaf-wash at a glance, which is all a tint must do.
  oilseed: "bg-leaf-2 text-leaf-deep",
  fruit: "bg-anar-wash text-anar",
  cash: "bg-jal-wash text-jal-ink",
};
