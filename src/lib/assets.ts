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

  // ---- Crops: the 12 the engine recommends. All delivered. --------------
  // Every one of these is a crop the recommendation engine ranks and doses,
  // and the card reserves its image box whether or not the file exists — the
  // placeholder fills it, so a delivered photograph changes pixels and never
  // layout.
  //
  // To add one: save it as `public/img/crops/<key>.jpg` and uncomment its
  // line. That is the whole procedure.
  //
  // Square, subject centred, shot in the field rather than on a studio white —
  // the 22 above set that direction and these have to sit beside them.
  //
  // Delivered 4 Oct 2026, squared on the subject and saved at 900 px where the
  // source allowed. Six came as small screenshots and are kept at their own
  // size rather than upscaled — linseed 235, sorghum 251, finger millet 316,
  // sesame 333, pearl millet 361, safflower 368 px — so they are visibly soft
  // on a 2x screen, and sesame and safflower are seed on a studio white rather
  // than field shots. Worth reshooting. Three carried a Google Lens button
  // from the screenshot, removed: painted out on the white two, covered with
  // matching slate on pearl millet.
  "crops/sorghum.jpg",       // Jowar · ज्वारी (grain, with a wooden spoon)
  "crops/pearlmillet.jpg",   // Bajra · बाजरी
  "crops/fingermillet.jpg",  // Ragi · नाचणी (the brick-red grain, in a bowl)
  "crops/wheat.jpg",         // Wheat · गहू   (NOT upload/wheat.jpg below —
  //                            that one is deliberately bokeh-soft atmosphere
  //                            for the upload zone, not a crop portrait.)
  "crops/soybean.jpg",       // Soyabean · सोयाबीन
  "crops/groundnut.jpg",     // Groundnut · भुईमूग (pods in the shell)
  "crops/safflower.jpg",     // Safflower · करडई
  "crops/sunflower.jpg",     // Sunflower · सूर्यफूल
  "crops/sesame.jpg",        // Sesamum · तीळ (black sesame)
  "crops/linseed.jpg",       // Linseed · जवस
  "crops/mustard.jpg",       // Rapeseed & Mustard · मोहरी (the flower)
  "crops/sugarcane.jpg",     // Sugarcane · ऊस
  // (The first photograph supplied as finger millet showed round yellow grain
  // — proso or foxtail millet — and was not used; a farmer would see at once
  // that it is not ragi.)

  // ---- Fertilizers: all 9. ----------------------------------------------
  // Real bag photographs. Cropped square with an upward bias rather than
  // centred, so the grade printed on the sack stays clear of the NPK bars
  // drawn across the bottom of the card. MOP (263 px) and SSP (642 px) came
  // smaller than the 900 px of the first seven and are kept at their size.
  "fertilizers/10-26-26.jpg",
  "fertilizers/14-35-14.jpg",
  "fertilizers/17-17-17.jpg",
  "fertilizers/20-20-20.jpg",
  "fertilizers/28-28.jpg",
  "fertilizers/dap.jpg",
  "fertilizers/urea.jpg",
  "fertilizers/mop.jpg",   // MOP · एमओपी  · 0-0-60 (Bharat MOP, Indian Potash)
  "fertilizers/ssp.jpg",   // SSP · एसएसपी · 0-16-0 (Mahadhan, 16 % P₂O₅)

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
