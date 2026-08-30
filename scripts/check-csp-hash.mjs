/**
 * Does the CSP hash still match the script it is meant to allow?
 *
 * `THEME_INIT_SCRIPT` is inlined into <head> and runs before first paint, and
 * the CSP in `src/middleware.ts` permits it by SHA-256 rather than by nonce —
 * reading a per-request nonce in the root layout would make every page dynamic
 * and cost the static prerendering the whole site depends on.
 *
 * The failure this guards against is quiet and nasty: edit the script, forget
 * the hash, and nothing breaks in `npm run dev` (where the theme happens to be
 * light) or in `npm run build`. It breaks in production, only for the people
 * who chose dark, as the white flash the script exists to prevent.
 *
 *   npm run check:csp-hash
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const source = readFileSync("src/lib/themeScript.ts", "utf8");

const keyMatch = source.match(/THEME_STORAGE_KEY = "([^"]+)"/);
const scriptMatch = source.match(/THEME_INIT_SCRIPT = `([\s\S]*?)`;/);
const hashMatch = source.match(/THEME_INIT_SCRIPT_HASH =\s*"([^"]+)"/);

if (!keyMatch || !scriptMatch || !hashMatch) {
  console.error("check:csp-hash — could not find the constants in themeScript.ts");
  process.exit(1);
}

// The script is a template literal over the storage key, so the hash has to be
// taken of the interpolated result — the same bytes the browser receives.
const script = scriptMatch[1].replaceAll("${THEME_STORAGE_KEY}", keyMatch[1]);
const actual = "sha256-" + createHash("sha256").update(script, "utf8").digest("base64");

if (actual !== hashMatch[1]) {
  console.error("check:csp-hash — THEME_INIT_SCRIPT_HASH is stale.\n");
  console.error(`  expected  ${actual}`);
  console.error(`  found     ${hashMatch[1]}\n`);
  console.error("Update THEME_INIT_SCRIPT_HASH in src/lib/themeScript.ts.");
  process.exit(1);
}

console.log(`check:csp-hash — ok (${actual})`);
