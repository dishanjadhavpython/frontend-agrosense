import { CROPS } from "./crops";
import { FERTILIZERS } from "./fertilizers";
import { SOILS } from "./soils";

/**
 * Everything the three models can name — and therefore everything that needs
 * a page.
 *
 * This exists because of a bug that only showed up against a real prediction.
 * The detail routes built their `generateStaticParams` from `PREDICTED_CROPS`
 * in `prediction.ts`, which is the hand-written worked example: five crops,
 * four fertilizers, one soil. With `dynamicParams = false`, everything else
 * was a 404 — so a farmer whose card came back `mothbeans` clicked their own
 * top recommendation and got a not-found page. Verified live: of one real
 * prediction's `mothbeans / coffee / cotton / maize / orange` + `black` +
 * `28-28`, exactly one had a page.
 *
 * The fixture is a demonstration. The model's label set is the contract. These
 * lists are the second, and they mirror `backend/agents/topics.py`, which
 * decides what the research agents will gather — the two must not drift, or a
 * page exists with no report or a report exists with no page.
 */

/** All 22, straight from the crop model's label encoder. */
export const CROP_KEYS: string[] = CROPS.map((crop) => crop.key);

/**
 * The 8 the image classifier actually distinguishes — `ML/models/soil_classes.json`,
 * which is the file `backend/agents/topics.py` reads at import.
 *
 * Named here rather than derived from `SOILS`, which carries a ninth (`sandy`)
 * that the classifier cannot return: a page for a soil no prediction can
 * produce would have no research topic behind it and would sit permanently
 * empty. That artifact directory is gitignored, so this cannot be imported —
 * if the classifier is ever retrained on different classes, this list and
 * `soil_classes.json` have to be changed together.
 */
export const SOIL_KEYS: string[] = [
  "alluvial",
  "black",
  "cinder",
  "clay",
  "laterite",
  "peat",
  "red",
  "yellow",
];

/** All 7 blends the fertilizer model can return. */
export const FERTILIZER_KEYS: string[] = FERTILIZERS.map((f) => f.key);

/**
 * Site key -> research-topic slug.
 *
 * One blend is spelled differently on each side: the dataset writes `20-20`
 * and this catalogue writes the three-part grade `20-20-20`. `fertilizerKey()`
 * in `predictionFromApi.ts` already maps model label -> site key; this is the
 * same seam in the other direction, for asking the insights API about a page
 * the farmer is standing on.
 */
export const fertilizerTopicSlug = (key: string): string =>
  key === "20-20-20" ? "20-20" : key;

/** Guards for the route handlers, so an unknown key stays a real 404. */
export const isCropKey = (key: string) => CROP_KEYS.includes(key);
export const isSoilKey = (key: string) => SOIL_KEYS.includes(key);
export const isFertilizerKey = (key: string) => FERTILIZER_KEYS.includes(key);

/** Every soil that has a page, as the objects the cards draw from. */
export const PAGED_SOILS = SOILS.filter((s) => SOIL_KEYS.includes(s.key));
