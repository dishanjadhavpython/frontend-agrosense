/**
 * The 22 crops the recommendation model can return.
 *
 * `key` is the model's own label, and `img` is `crops/<key>.jpg`, so a
 * prediction maps straight to a card with no lookup table in between. Don't
 * rename a key without renaming the label it came from.
 *
 * Grouped by category rather than by season: the set spans the whole country
 * (apple, coffee and jute are not Maharashtra crops), so a Maharashtra sowing
 * season would be invented for a third of this list.
 *
 * Until a photograph is delivered and registered in `src/lib/assets.ts`, each
 * card falls back to the designed placeholder.
 */

export type CropCategory = "grain" | "pulse" | "fruit" | "cash";

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
];

export const categoryLabel: Record<CropCategory, { mr: string; en: string }> = {
  grain: { mr: "तृणधान्य", en: "Grain" },
  pulse: { mr: "कडधान्य", en: "Pulse" },
  fruit: { mr: "फळ", en: "Fruit" },
  cash: { mr: "नगदी", en: "Cash crop" },
};

/** Tints come from the palette already in globals.css — no new hues. */
export const categoryTint: Record<CropCategory, string> = {
  grain: "bg-haldi-wash text-haldi-ink",
  pulse: "bg-leaf-wash text-leaf-deep",
  fruit: "bg-anar-wash text-anar",
  cash: "bg-jal-wash text-jal-ink",
};
