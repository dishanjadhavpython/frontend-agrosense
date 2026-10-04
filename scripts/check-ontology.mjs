/**
 * Can the site name everything the engine can recommend?
 *
 * The recommendation engine ranks crops under the Agricultural Production
 * Yearbook's own spellings — `Arhar/Tur`, `Cotton(lint)`, `Rapeseed
 * &Mustard`. `src/data/cropOntology.ts` maps each onto a `CROPS[].key`, which
 * is what photographs, detail routes and cultivation calendars are filed
 * under.
 *
 * The failure this guards against is silent and reaches the farmer: add a crop
 * to the engine, forget the mapping, and the recommendation arrives with no
 * name, no photograph and a detail link that 404s — because all three
 * `/prediction/*` routes set `dynamicParams = false`, so an unlisted key is a
 * hard 404 rather than a rendered page. Nothing in `tsc` catches it: the
 * mapping is `Record<string, string>` and every string typechecks.
 *
 * Checked here rather than in a test because this project has no TypeScript
 * test runner, and because `npm run build` is the moment it matters — the same
 * reasoning as `check-csp-hash.mjs`, which this follows.
 *
 *   npm run check:ontology
 */
import { readFileSync } from "node:fs";

const fail = (msg) => {
  console.error(`check:ontology — ${msg}`);
  process.exit(1);
};

/** Pull the `key` of every `crop("key", ...)` / `fert("key", ...)` call. */
function keysFrom(file, fn) {
  const source = readFileSync(file, "utf8");
  const keys = [...source.matchAll(new RegExp(`\\b${fn}\\("([^"]+)"`, "g"))].map(
    (m) => m[1],
  );
  if (!keys.length) fail(`found no ${fn}() entries in ${file} — did its shape change?`);
  return new Set(keys);
}

/** Pull the values of a `Record<string, string>` literal by name. */
function mapValuesFrom(file, constName) {
  const source = readFileSync(file, "utf8");
  const block = source.match(
    new RegExp(`${constName}: Record<string, string> = \\{([\\s\\S]*?)\\n\\};`),
  );
  if (!block) fail(`could not find ${constName} in ${file}`);
  // Entries look like  Rice: "rice",  or  "Arhar/Tur": "pigeonpeas",
  // Comment lines are skipped by requiring the value to be a quoted string.
  const pairs = [...block[1].matchAll(/^\s*(?:"([^"]+)"|([A-Za-z_$][\w$]*))\s*:\s*"([^"]+)"/gm)];
  if (!pairs.length) fail(`${constName} in ${file} parsed as empty`);
  return pairs.map(([, quoted, bare, value]) => [quoted ?? bare, value]);
}

/** Every crop key named inside a `key: "..."` or a favoured/discouraged list. */
function referencedCropKeys(file, patterns) {
  const source = readFileSync(file, "utf8");
  const out = new Set();
  for (const re of patterns) {
    for (const m of source.matchAll(re)) {
      for (const key of m[1].split(",")) {
        const trimmed = key.trim().replace(/^"|"$/g, "");
        if (trimmed) out.add(trimmed);
      }
    }
  }
  return out;
}

const cropKeys = keysFrom("src/data/crops.ts", "crop");
const fertKeys = keysFrom("src/data/fertilizers.ts", "fert");

const cropMap = mapValuesFrom("src/data/cropOntology.ts", "ENGINE_TO_CROP_KEY");
const fertMap = mapValuesFrom("src/data/cropOntology.ts", "ENGINE_TO_FERTILIZER_KEY");

const problems = [];

for (const [engine, key] of cropMap) {
  if (!cropKeys.has(key)) {
    problems.push(`crop "${engine}" maps to "${key}", which is not in CROPS`);
  }
}
for (const [engine, key] of fertMap) {
  if (!fertKeys.has(key)) {
    problems.push(`fertiliser "${engine}" maps to "${key}", which is not in FERTILIZERS`);
  }
}

// A recommendable crop with no sowing window loses the calendar band on its
// detail page — `CropVisuals` returns null rather than drawing an empty year,
// so the page renders and the omission is invisible.
const withCalendar = referencedCropKeys("src/data/cultivation.ts", [/key: "([a-z0-9-]+)"/g]);
for (const [engine, key] of cropMap) {
  if (!withCalendar.has(key)) {
    problems.push(`"${engine}" -> "${key}" has no entry in cultivation.ts`);
  }
}

// A crop named in the soil table that CROPS has never heard of renders as a
// dead chip on a soil page.
const inSuitability = referencedCropKeys("src/data/soilSuitability.ts", [
  /favoured: \[([^\]]*)\]/g,
  /discouraged: \[([^\]]*)\]/g,
]);
for (const key of inSuitability) {
  if (!cropKeys.has(key)) {
    problems.push(`soilSuitability.ts names "${key}", which is not in CROPS`);
  }
}

// Two engine crops mapping to one card would silently collapse a ranking.
const seen = new Map();
for (const [engine, key] of cropMap) {
  if (seen.has(key)) {
    problems.push(`"${engine}" and "${seen.get(key)}" both map to "${key}"`);
  }
  seen.set(key, engine);
}

if (problems.length) {
  console.error("check:ontology — the engine can recommend crops this site cannot name.\n");
  for (const p of problems) console.error(`  · ${p}`);
  console.error("\nAdd the missing entry to src/data/crops.ts (or fertilizers.ts),");
  console.error("then reserve its image slot in src/lib/assets.ts.");
  process.exit(1);
}

console.log(
  `check:ontology — ok (${cropMap.length} crops, ${fertMap.length} fertilisers` +
    ` resolve into ${cropKeys.size} cards; all have calendars;` +
    ` ${inSuitability.size} crops named across the soil table)`,
);
