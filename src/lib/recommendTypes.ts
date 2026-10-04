/**
 * The shape of a crop & fertiliser recommendation.
 *
 * Kept in step with `ml engine for Recommendation/src/pipeline.py`'s
 * `Recommendation`/`CropAdvice` dataclasses and `src/serve/api.py`'s
 * `RecommendIn`/`SoilTestIn` — this is the other half of that contract.
 *
 * Deliberately separate from `cardApi.ts`/`recommendApi.ts`, which are
 * `server-only`: these types are needed by client components (the location
 * picker, the result cards), and keeping them in their own module means a
 * client component can never reach the fetch code by following an import.
 */

export type Season = "Kharif" | "Rabi" | "Summer" | "Whole Year";

/** The card's own three-way verdict for a component, against its own printed
 *  range — matches `StatusCode` in `cardTypes.ts`, renamed here because the
 *  engine's field is literally called `..._status`. */
export type ShcStatus = "low" | "normal" | "high";

/**
 * All twelve Soil Health Card components, as the engine's `/recommend`
 * expects them. Every field is optional — send whichever the card confirmed;
 * a farmer's own reading overrides the taluka average for that one field and
 * nothing else. Built from `CardReadResult.soil_metrics` by
 * `soilTestFromCard` (`recommendApi.ts`).
 */
export type SoilTestIn = {
  n_kg_ha?: number;
  p_kg_ha?: number;
  k_kg_ha?: number;
  oc_pct?: number;
  ph?: number;
  ec_status?: ShcStatus;
  sulphur_status?: ShcStatus;
  zinc_status?: ShcStatus;
  iron_status?: ShcStatus;
  copper_status?: ShcStatus;
  boron_status?: ShcStatus;
  manganese_status?: ShcStatus;
};

export type RecommendRequest = {
  district: string;
  taluka: string;
  season: Season;
  irrigated: boolean;
  top_k: number;
  soil_test?: SoilTestIn;
  /**
   * The soil classifier's calibrated probabilities over its own classes, as
   * `/api/soil` returns them. The whole distribution, not the ranked few — the
   * engine weighs it against the taluka's soil survey, and a 0.45/0.44 split
   * means something very different from a 0.45/0.05 one.
   */
  soil_photo?: Record<string, number>;
  /** False when the classifier judged the image not to be soil at all. */
  photo_in_distribution?: boolean;
};

/* ---- what /talukas and /atlas return, for the location step ------------ */

export type TalukaRow = { District: string; Taluka: string };

export type TalukasResponse = {
  n: number;
  districts: string[];
  talukas: TalukaRow[];
};

export type SeasonsResponse = { seasons: Season[] };

/** One taluka's projected position and climate, for the atlas map. Field
 *  names are the engine's own short keys (`src/serve/api.py`'s `/atlas`) —
 *  kept as-is rather than expanded, since `TalukaMap.tsx` is the only reader. */
export type AtlasTaluka = {
  d: string;   // district
  t: string;   // taluka
  y: number;   // latitude
  x: number;   // longitude
  a: number;   // aridity index
  r: number;   // annual rainfall, mm
  w: number;   // root-zone available water, mm
  l: number;   // growing period, days
};

export type AtlasResponse = {
  bounds: { lat: [number, number]; lon: [number, number] };
  aridity_range: [number, number];
  talukas: AtlasTaluka[];
};

/* ---- what /recommend returns -------------------------------------------- */

/** The eight Liebig factor scores, 0-1 each — the gate's score is their
 *  minimum, which is why a client can show *which* stave is short. */
export type SuitabilityFactors = {
  rain: number;
  temp: number;
  pH: number;
  depth: number;
  drainage: number;
  salinity: number;
  LGP: number;
  texture: number;
};

export type MicronutrientCorrection = {
  component: "S" | "Fe" | "Zn" | "Cu" | "B" | "Mn";
  /** Which reading decided this: the farmer's own card, or the taluka's. */
  source: "farmer soil health card" | "taluka SHC distribution";
  /** Taluka-wide deficient sample share, %. `null` for a farmer-sourced entry
   *  — a single field is not a percentage, and none is invented. */
  deficient_pct: number | null;
  critical_limit: string;
  product: string;
  rate_kg_ha: number;
  note: string;
  priority: "high" | "moderate";
};

export type SulphurSwap = {
  swap: string;
  dap_kg_ha: number;
  ssp_kg_ha: number;
  sulphur_supplied_kg_ha: number;
  nitrogen_shortfall_kg_ha: number;
  note: string;
};

export type NitrogenSchedule = {
  leach_risk: number;
  leach_risk_band: "low" | "moderate" | "high";
  n_splits: number;
  schedule: { stage: string; n_kg_ha: number }[];
  phosphorus_potassium: string;
  rationale: string;
};

export type NutrientTarget = { N?: number; P2O5?: number; K2O?: number };

export type RecommendedMix = {
  feasible: boolean;
  products_kg_ha?: Record<string, number>;
  cost_inr_per_ha?: number;
  /** What that mix actually supplies, against what was asked for — the two
   *  differ whenever no combination of four products hits the target exactly. */
  nutrients_supplied?: NutrientTarget & { S?: number };
  target?: NutrientTarget;
};

/** The per-crop fertiliser plan — `null`/`available: false` when the table
 *  has no recipe at all for this crop anywhere (not even a state median). */
export type FertiliserPlan = {
  available: boolean;
  /** True when this is a state-wide median, not the district's own published
   *  recommendation — the table omits ~36% of (crop, district) cells. */
  estimated?: boolean;
  soil_class?: string;
  table_products_kg_ha?: Record<string, number>;
  table_target_kg_ha?: NutrientTarget;
  interpolated_target_kg_ha?: NutrientTarget;
  nitrogen_schedule?: NitrogenSchedule;
  sulphur_swap?: SulphurSwap | null;
  recommended_mix?: RecommendedMix;
  /** The LP's answer against the table's own cheapest option. Reported even
   *  when it saves nothing, which is the usual case: with only four straight
   *  fertilisers the government's Option 1 is already cost-optimal. */
  least_cost_vs_table?: {
    lp: RecommendedMix & { nutrients_supplied?: NutrientTarget; target?: NutrientTarget };
    table_costs?: Record<string, number>;
    cheapest_table_option?: number;
    cheapest_table_cost?: number;
    saving_inr_per_ha: number;
    saving_pct?: number;
  } | null;
  product_ranges_across_districts?: Record<string, [number, number]>;
  notes?: string[];
  note?: string;
};

export type CropAdvice = {
  crop: string;
  crop_marathi: string | null;
  rank: number;
  final_score: number;
  learned_score: number | null;
  rule_score: number | null;
  suitability_class: "S1" | "S2" | "S3" | "N" | "?";
  limiting_factor: string;
  decided_by: "model" | "rules" | "blend" | "rules (out of distribution)";
  reason: string;
  yield_p10_t_ha: number | null;
  yield_p50_t_ha: number | null;
  yield_p90_t_ha: number | null;
  yield_interval_note: string;
  yield_class: "below" | "typical" | "above" | null;
  yield_class_confidence: number | null;
  yield_regime: string | null;
  yield_abstained: boolean;
  factors: Partial<SuitabilityFactors>;
  requires_irrigation: boolean;
  evidence: Record<string, number | boolean>;
  fertiliser: FertiliserPlan | null;
};

export type VetoedCrop = {
  crop: string;
  limiting_factor: string;
  reason: string;
  score: number;
};

export type NotAssessableCrop = { crop: string; reason: string };

/** Per-field audit trail — echoes exactly what the engine used, and where it
 *  came from, so "your card" is never just a claim. Mirrors the "readings
 *  used" pattern already in `PredictionResult` (`cardTypes.ts`). */
export type RecommendContext = {
  annual_rainfall_mm: number;
  season_rainfall_mm: number | null;
  rootzone_awc_mm: number;
  soil_depth_mm: number;
  drainage_ord: number;
  aridity_index: number;
  lgp_days: number;
  leach_risk: number;
  soil_test: { N: number | null; P: number | null; K: number | null; OC: number | null };
  ph_source: "farmer soil health card" | "taluka SHC distribution";
  ph_used: number;
  ec_source: "farmer soil health card" | "taluka SHC distribution";
  ec_saline_pct_used: number;
  /**
   * The farmer's card reads EC above its own printed range. Not a veto — that
   * verdict cannot place the field in the survey's (much rarer) saline class —
   * so it is reported as a caution instead. Optional: absent from older engines.
   */
  ec_card_high?: boolean;
  /** Ranked crops the engine's requirement table rates least salt-tolerant. */
  ec_least_tolerant?: string[];
  shc_samples: number;
  /**
   * What the soil survey says is actually under this taluka.
   *
   * This was description only for as long as the engine took no image — the
   * gate consumed the numeric derivations (depth in mm, drainage as an
   * ordinal) and never the words, so a photograph had nothing to do but sit
   * beside them in the UI; see `compareSoil` in `soilTypes.ts`. The engine now
   * weighs a photograph against these, and `soil_fusion` below reports what it
   * was allowed to do. `null` for the handful of talukas the survey misses.
   */
  surveyed_soil: {
    soil_type: string | null;
    soil_type_secondary: string | null;
    /** How much of the taluka is the dominant type. Runs 55-80%. */
    share_pct: number | null;
    texture: string | null;
    depth: string | null;
    drainage: string | null;
    parent_material: string | null;
    points_sampled: number | null;
  } | null;

  /**
   * What the farmer's photograph did to the answer.
   *
   * The survey is the prior and the photograph the evidence. Fusion may pick
   * only between soil types the survey records for this taluka, and may move
   * only texture and available water — depth, drainage and salinity always
   * take the more cautious profile, so a photograph can add a constraint and
   * can never lift a safety veto. `applied: false` with a populated `reason`
   * is the normal case, not an error: an unconfident photo, a single-soil
   * taluka, or a soil the classifier has no class for (laterite) all leave the
   * survey standing, and `reason` says which.
   */
  soil_fusion: {
    soil_type: string | null;
    applied: boolean;
    reason: string;
    prior: Record<string, number>;
    posterior: Record<string, number>;
    awc_scale: number;
    photo: { label: string | null; confidence: number | null };
  } | null;
};

export type Recommendation = {
  district: string;
  taluka: string;
  season: Season;
  irrigated: boolean;
  soil_class: string;
  soil_test_source: "farmer soil health card" | "taluka SHC distribution";
  /** False when the taluka sits outside the training distribution — the
   *  learned ranker is suppressed and `abstention_reason` explains why. */
  confident: boolean;
  novelty: number | null;
  abstention_reason: string | null;
  /** Most of what's viable here needs irrigation supplied, not that nothing
   *  is viable — see `abstention_reason` for the OOD case instead. */
  water_limited: boolean;
  crops: CropAdvice[];
  vetoed: VetoedCrop[];
  not_assessable: NotAssessableCrop[];
  micronutrients: MicronutrientCorrection[];
  context: RecommendContext;
};

/** Why a `/api/recommend` call failed, in terms the location step can turn
 *  into advice — mirrors `CardErrorKind` in `cardTypes.ts`. */
export type RecommendErrorKind =
  | "no-location" // district/taluka/season not supplied
  | "unsupported-taluka" // not one of the 351 covered talukas
  | "bad-season"
  | "offline"
  | "unknown";

export type RecommendErrorBody = {
  error: RecommendErrorKind;
  message: { mr: string; en: string };
  detail?: string;
};
