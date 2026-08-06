/**
 * The 9 soil types the classifier distinguishes.
 *
 * `key` is the model's own label lowercased, and `img` is `soils/<key>.jpg`,
 * so a prediction maps straight to a card.
 *
 * Sources: five classes come from the ResNet50 soil classifier
 * (`final_models/metadata.json` — black, cinder, laterite, peat, yellow), and
 * three more from the second image set (alluvial, clay, red). Sandy has no
 * image yet and falls back to the placeholder.
 *
 * `retention` is water-holding capacity — textbook soil physics, not a model
 * output. It reuses the same three-step language as the nutrient readings, so
 * "high / medium / low" means the same thing everywhere in the product.
 */

export type Retention = "high" | "medium" | "low";

export type Soil = {
  key: string;
  mr: string;
  en: string;
  retention: Retention;
  img: string;
};

const soil = (
  key: string,
  mr: string,
  en: string,
  retention: Retention,
): Soil => ({ key, mr, en, retention, img: `soils/${key}.jpg` });

export const SOILS: Soil[] = [
  soil("black", "काळी जमीन", "Black soil", "high"),
  soil("alluvial", "गाळाची जमीन", "Alluvial soil", "medium"),
  soil("red", "तांबडी जमीन", "Red soil", "low"),
  soil("laterite", "जांभी जमीन", "Laterite soil", "low"),
  soil("clay", "चिकणमाती", "Clay soil", "high"),
  soil("sandy", "वाळूची जमीन", "Sandy soil", "low"),
  soil("peat", "दलदलीची जमीन", "Peat soil", "high"),
  soil("yellow", "पिवळी जमीन", "Yellow soil", "medium"),
  // Volcanic scoria. Not a traditional Indian soil category, so the Marathi
  // stays transliterated rather than inventing a term farmers don't use.
  soil("cinder", "सिंडर माती", "Cinder soil", "low"),
];

export const retentionLabel: Record<Retention, { mr: string; en: string }> = {
  high: { mr: "पाणी धरते", en: "Holds water" },
  medium: { mr: "मध्यम", en: "Medium" },
  low: { mr: "पाणी झिरपते", en: "Drains fast" },
};

/** Same three-colour language as the nutrient readings. */
export const retentionTint: Record<Retention, string> = {
  high: "bg-jal-wash text-jal-ink",
  medium: "bg-leaf-wash text-leaf-deep",
  low: "bg-haldi-wash text-haldi-ink",
};
