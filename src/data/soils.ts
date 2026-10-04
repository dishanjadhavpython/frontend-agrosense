/**
 * The soil types the product has a card for.
 *
 * `key` is the classifier's own label, and `img` is `soils/<key>.jpg`, so a
 * prediction maps straight to a card.
 *
 * Eight of the nine are the classes the photo classifier returns
 * (`ML/models/soil_classes.json`: alluvial, black, cinder, clay, laterite,
 * peat, red, yellow). Sandy is not one of them — it has a card for the detail
 * pages but no class, and no image yet, so it falls back to the placeholder.
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
