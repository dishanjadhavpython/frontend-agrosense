/**
 * Below this percentage a soil read is flagged as unsure, wherever it is shown.
 *
 * Not a guess. The classifier is temperature-calibrated, and its pooled
 * out-of-fold predictions (`ML/models/soil_v2/out_of_fold.json`) are right 43%
 * of the time below 0.50 against 97% above 0.95. Under fifty, the second guess
 * is nearly as likely as the first, so the card says so instead of letting the
 * number speak for itself.
 */
export const UNSURE_SOIL_READ = 50;

export const isUnsureSoilRead = (percent: number) => percent < UNSURE_SOIL_READ;

export const unsureSoilReadNote = {
  en: "Low confidence — at this level the photo reading is right less than half the time. Look at the ground yourself, or retake the photo.",
  mr: "खात्री कमी — इतक्या खात्रीवर फोटोवरून ओळख निम्म्याहून कमी वेळा बरोबर असते. जमीन स्वतः बघा, किंवा फोटो पुन्हा काढा.",
} as const;
