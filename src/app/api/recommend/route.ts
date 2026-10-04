import { NextResponse } from "next/server";
import { recommend, RecommendError } from "@/lib/recommendApi";
import type { Recommendation, RecommendRequest, Season, SoilTestIn } from "@/lib/recommendTypes";

/**
 * Crop and fertiliser recommendation for one taluka and season.
 *
 * Same three-layer shape as `/api/predict`: the browser posts here, this
 * posts to the Python recommend service, and every failure becomes a
 * sentence in the farmer's own language in one place.
 *
 * District, taluka and season are never defaulted or guessed — the engine is
 * taluka-scoped by design, and a silently-picked location would be a wrong
 * answer wearing the shape of a right one. `soil_test` is optional and
 * carries exactly what the farmer confirmed, field by field; a field left
 * out here is a field the engine falls back to the taluka average for, and
 * says so in the response `context`.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Message = { mr: string; en: string };

const MESSAGES: Record<string, Message> = {
  "no-location": {
    mr: "जिल्हा, तालुका आणि हंगाम निवडा — यांशिवाय शिफारस काढता येत नाही.",
    en: "Choose a district, taluka and season — there is nothing to recommend from without them.",
  },
  "bad-season": {
    mr: "हंगाम खरीप, रब्बी, उन्हाळी किंवा बारमाही यांपैकी एक असावा.",
    en: "Season must be Kharif, Rabi, Summer or Whole Year.",
  },
  "unsupported-taluka": {
    mr: "हा तालुका सध्या समाविष्ट नाही. सध्या ही सेवा फक्त महाराष्ट्रातील ३५१ तालुक्यांसाठी उपलब्ध आहे.",
    en: "That taluka is not covered yet — this service currently serves only Maharashtra's 351 Soil Health Card talukas.",
  },
  "bad-figure": {
    mr: "मातीच्या आकड्यांतला एखादा आकडा तपासा — दशांश चिन्ह चुकलं असावं.",
    en: "One of the soil figures looks wrong — check for a misplaced decimal point.",
  },
  offline: {
    mr: "शिफारस देणारी सेवा सध्या बंद आहे. थोड्या वेळाने पुन्हा प्रयत्न करा.",
    en: "The recommendation service is down right now. Try again shortly.",
  },
  unknown: {
    mr: "शिफारस काढताना अडचण आली. पुन्हा प्रयत्न करा.",
    en: "Something went wrong making the recommendation. Please try again.",
  },
};

const STATUS: Record<string, number> = {
  "no-location": 400,
  "bad-season": 400,
  "unsupported-taluka": 404,
  "bad-figure": 400,
  offline: 503,
  unknown: 500,
};

function fail(kind: keyof typeof MESSAGES, detail?: string) {
  return NextResponse.json(
    { error: kind, message: MESSAGES[kind], ...(detail ? { detail } : {}) },
    { status: STATUS[kind] ?? 500 },
  );
}

const SEASONS: Season[] = ["Kharif", "Rabi", "Summer", "Whole Year"];

/** Plausibility bounds — catch a misplaced decimal, never nudge toward an
 *  expected value. Mirrors `REQUIRED` in `api/predict/route.ts`. */
const NUMERIC_BOUNDS: Record<"n_kg_ha" | "p_kg_ha" | "k_kg_ha" | "oc_pct" | "ph", [number, number]> = {
  n_kg_ha: [0, 2000],
  p_kg_ha: [0, 500],
  k_kg_ha: [0, 2000],
  oc_pct: [0, 20],
  ph: [2, 12],
};
const STATUS_FIELDS = [
  "ec_status", "sulphur_status", "zinc_status", "iron_status",
  "copper_status", "boron_status", "manganese_status",
] as const;

function parseSoilTest(raw: unknown): SoilTestIn | undefined {
  if (raw == null || typeof raw !== "object") return undefined;
  const input = raw as Record<string, unknown>;
  const out: SoilTestIn = {};

  for (const [field, [min, max]] of Object.entries(NUMERIC_BOUNDS) as [
    keyof typeof NUMERIC_BOUNDS, [number, number],
  ][]) {
    const value = input[field];
    if (value === undefined || value === null || value === "") continue;
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max) throw new RangeError(field);
    out[field] = n;
  }
  for (const field of STATUS_FIELDS) {
    const value = input[field];
    if (value === undefined || value === null || value === "") continue;
    if (value !== "low" && value !== "normal" && value !== "high") throw new RangeError(field);
    out[field] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * The soil classifier's probability vector, validated.
 *
 * A malformed photograph must not cost the farmer their recommendation — the
 * whole request would fail over what is an optional enrichment. It is dropped
 * instead, and because the engine then reports `soil_fusion.reason` as the
 * survey standing on its own, the omission is visible in the answer rather
 * than silent.
 *
 * The values have to be a distribution, not a handful of independent scores:
 * fusion reads them as `P(photo says c | the soil is s)` and a vector summing
 * to three would weigh one photograph three times.
 */
function parseSoilPhoto(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > 1) {
      return undefined;
    }
    out[key] = raw;
  }
  if (!Object.keys(out).length) return undefined;

  const total = Object.values(out).reduce((sum, p) => sum + p, 0);
  return Math.abs(total - 1) <= 0.05 ? out : undefined;   // tolerate rounding
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail("no-location");
  }

  const district = body.district;
  const taluka = body.taluka;
  const season = body.season;
  if (typeof district !== "string" || !district.trim()
    || typeof taluka !== "string" || !taluka.trim()) {
    return fail("no-location");
  }
  if (typeof season !== "string" || !SEASONS.includes(season as Season)) {
    return fail("bad-season");
  }

  let soilTest: SoilTestIn | undefined;
  try {
    soilTest = parseSoilTest(body.soil_test);
  } catch (e) {
    return fail("bad-figure", e instanceof Error ? e.message : undefined);
  }

  const soilPhoto = parseSoilPhoto(body.soil_photo);

  const payload: RecommendRequest = {
    district: district.trim(),
    taluka: taluka.trim(),
    season: season as Season,
    irrigated: body.irrigated === true,
    top_k: typeof body.top_k === "number" && Number.isFinite(body.top_k) ? body.top_k : 5,
    ...(soilTest ? { soil_test: soilTest } : {}),
    ...(soilPhoto
      ? {
          soil_photo: soilPhoto,
          // Only the classifier can tell soil from a photograph of a leaf, so
          // the caller says; absent, the photograph is taken at face value.
          photo_in_distribution: body.photo_in_distribution !== false,
        }
      : {}),
  };

  try {
    const result = await recommend(payload);
    return NextResponse.json<Recommendation>(result);
  } catch (e) {
    if (e instanceof RecommendError) return fail(e.kind);
    return fail("unknown");
  }
}
