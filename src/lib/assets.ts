/**
 * Photograph registry.
 *
 * The real crop, field and Soil Health Card photographs aren't in the repo
 * yet. Rather than ship `<img>` tags pointing at 404s, every photographic
 * surface asks here first and falls back to a designed placeholder when the
 * file hasn't landed.
 *
 * When a photograph arrives:
 *   1. drop it at `public/img/<path>`
 *   2. add that same `<path>` to DELIVERED below
 *
 * Nothing else changes — layout, sizing and art direction are already set.
 */

const DELIVERED = new Set<string>([
  // ---- Crops: all 22. ---------------------------------------------------
  "crops/apple.jpg",
  "crops/banana.jpg",
  "crops/blackgram.jpg",
  "crops/chickpea.jpg",
  "crops/coconut.jpg",
  "crops/coffee.jpg",
  "crops/cotton.jpg",
  "crops/grapes.jpg",
  "crops/jute.jpg",
  "crops/kidneybeans.jpg",
  "crops/lentil.jpg",
  "crops/maize.jpg",
  "crops/mango.jpg",
  "crops/mothbeans.jpg",
  "crops/mungbean.jpg",
  "crops/muskmelon.jpg",
  "crops/orange.jpg",
  "crops/papaya.jpg",
  "crops/pigeonpeas.jpg",
  "crops/pomegranate.jpg",
  "crops/rice.jpg",
  "crops/watermelon.jpg",

  // ---- Soils: all 9. ----------------------------------------------------
  // Pulled from the classifier's own training sets, except `sandy`, which was
  // supplied separately and is a clean landscape texture — centre-cropped
  // square, which is safe here because a texture has no subject to lose.
  // black, cinder, laterite and peat came from scraped thumbnails and are
  // under 384px — visibly soft on a 2x screen. Worth reshooting.
  "soils/alluvial.jpg",
  "soils/black.jpg",
  "soils/cinder.jpg",
  "soils/clay.jpg",
  "soils/laterite.jpg",
  "soils/peat.jpg",
  "soils/red.jpg",
  "soils/sandy.jpg",
  "soils/yellow.jpg",

  // ---- Fertilizers: all 7. ----------------------------------------------
  // Real bag photographs. Cropped square with an upward bias rather than
  // centred, so the grade printed on the sack stays clear of the NPK bars
  // drawn across the bottom of the card.
  "fertilizers/10-26-26.jpg",
  "fertilizers/14-35-14.jpg",
  "fertilizers/17-17-17.jpg",
  "fertilizers/20-20-20.jpg",
  "fertilizers/28-28.jpg",
  "fertilizers/dap.jpg",
  "fertilizers/urea.jpg",

  // ---- Everything else --------------------------------------------------
  // Golden-hour wheat, already bokeh-soft in camera — it sits behind the
  // upload zone and is meant to be atmosphere, never something you look at.
  "upload/wheat.jpg",
  "close/dawn-field.jpg",
  "people/farmer-portrait.jpg",
  // Rain caught on grass blades, shot close. It sits behind the weather
  // header under a heavy scrim — bright green with specular highlights, so
  // the scrim there is measured rather than guessed.
  "weather/monsoon-sky.jpg",
  // A splash, close. It runs under the water-balance card's green wash as
  // texture only — the photograph is emphatically blue and this product has
  // no blue, so it contributes structure and the card keeps the hue.
  "weather/water.jpg",
  // A seedling breaking tilled soil. Behind the soil upload zone, and it
  // happens to be the logo's own drawing as a photograph.
  "upload/soil.jpg",
  // Rain on glass over a wet forest. Runs behind the reading chart under a
  // `surface` veil — it is a texture below twelve rows of data, never a
  // photograph you are meant to look at. Dark and busy, which suits the job
  // far better than the pale ear it replaced.
  "reading/rain-glass.jpg",
  // Superseded by rain-glass, kept registered because the file is still in
  // public/ and the swap is one line if the old crop is wanted back.
  "reading/rice-field.jpg",
  // "card/soil-health-card.jpg",  ← still the highest-priority missing shot
]);

/** Returns the public URL if the photo has been delivered, else undefined. */
export function photo(path: string): string | undefined {
  return DELIVERED.has(path) ? `/img/${path}` : undefined;
}

export function hasPhoto(path: string): boolean {
  return DELIVERED.has(path);
}
