import type { CardReadResult, ExtractedMetric, MetricKey, StatusCode } from "./cardTypes";
import type { ShcStatus, SoilTestIn } from "./recommendTypes";

/**
 * The bridge from a read card to the recommend engine's request shape.
 *
 * Deliberately outside `recommendApi.ts` (`server-only`): this runs in the
 * browser, to prefill the location step's "Soil Health Card values" panel
 * the same way `valuesFromCard` (`PredictionInputs.tsx`) prefills the old
 * form — off `useCard()`'s already-fetched result, not a new request.
 */

/** The card's own three-way verdict, unchanged — `StatusCode` (`cardTypes.ts`)
 *  and `ShcStatus` (`recommendTypes.ts`) are the same three strings on
 *  purpose, so this is a type-level bridge, not a translation. */
const asShcStatus = (status: StatusCode): ShcStatus => status;

/** metric key -> the `SoilTestIn` field it fills, and how. */
type Filler = (metric: ExtractedMetric, out: SoilTestIn) => void;
const FILLERS: Partial<Record<MetricKey, Filler>> = {
  available_nitrogen: (m, out) => { out.n_kg_ha = m.reading; },
  available_phosphorus: (m, out) => { out.p_kg_ha = m.reading; },
  available_potassium: (m, out) => { out.k_kg_ha = m.reading; },
  organic_carbon: (m, out) => { out.oc_pct = m.reading; },
  ph: (m, out) => { out.ph = m.reading; },
  ec: (m, out) => { out.ec_status = asShcStatus(m.status_code); },
  available_sulphur: (m, out) => { out.sulphur_status = asShcStatus(m.status_code); },
  available_zinc: (m, out) => { out.zinc_status = asShcStatus(m.status_code); },
  available_iron: (m, out) => { out.iron_status = asShcStatus(m.status_code); },
  available_copper: (m, out) => { out.copper_status = asShcStatus(m.status_code); },
  available_boron: (m, out) => { out.boron_status = asShcStatus(m.status_code); },
  available_manganese: (m, out) => { out.manganese_status = asShcStatus(m.status_code); },
};

/**
 * All twelve card readings, mapped onto the engine's `soil_test` shape.
 *
 * N/P/K/OC and pH go across as the farmer's own measured value — the same
 * numbers `PredictionInputs.tsx` already showed for confirmation. EC and the
 * six micronutrients go across as the card's own low/normal/high verdict,
 * because that is what the engine's correction layers consume, not a raw
 * ppm figure. A metric OCR could not find is left out entirely — never
 * defaulted, matching every other reading path in this codebase.
 */
export function soilTestFromCard(result: CardReadResult): SoilTestIn {
  const out: SoilTestIn = {};
  for (const metric of result.soil_metrics) {
    FILLERS[metric.key]?.(metric, out);
  }
  return out;
}
