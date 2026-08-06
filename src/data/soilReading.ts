import type { DictKey } from "@/lib/i18n";
import type { ExtractedMetric, MetricKey } from "@/lib/cardTypes";

/**
 * The twelve properties a Maharashtra Soil Health Card actually prints — and
 * therefore the twelve this product reads, in the order the card lists them.
 *
 * One file, because two things need exactly the same numbers: the sample card
 * in the hero (which is a picture of the artifact) and the reading chart
 * (which is a picture of what we did with it). When those drifted apart they
 * were quietly telling the visitor two different stories about one card.
 *
 * `band` is the desirable window, from the ICAR / Soil Health Card critical
 * limits used across Maharashtra. For the six micronutrients there is only a
 * lower critical limit — above it is simply sufficient — so their band runs
 * to the top of the axis and "above the band" never happens.
 *
 * `axis` is what the bar is drawn against, and is not always zero-based: a pH
 * bar starting at 0 would spend half its length in a range no soil occupies.
 */

export type Tone = "low" | "ok" | "high";

export type Reading = {
  /** Dictionary key — the Marathi name printed on the card. */
  key: DictKey;
  /** What the reading service calls this property. Joins a real extraction to
   *  the presentation facts below. Matches `METRIC_KEYS` in soil_report.py. */
  metricKey: MetricKey;
  /** As printed in the analysis column. */
  symbol: string;
  unit: string;
  value: number;
  /** [lower critical limit, upper limit of the desirable range] */
  band: [number, number];
  /** [axis start, axis end] for the bar. */
  axis: [number, number];
  /** How many decimals this figure is reported to. */
  dp: 0 | 1 | 2;
  /** Which vocabulary the rating uses. */
  scale: "ph" | "salt" | "lmh" | "critical";
  /**
   * Set only on a real reading. `unconfirmed` means the number came from OCR
   * of a photograph rather than a PDF's text layer, and the row has to say so
   * — Tesseract misreads a digit often enough that a confident-looking OCR
   * figure is the most dangerous thing this chart can draw.
   */
  confidence?: "high" | "unconfirmed";
  /** True when the band shown came off the farmer's own card rather than the
   *  ICAR default below. */
  bandFromCard?: boolean;
};

/**
 * A realistic Deccan black-soil profile: alkaline, low organic carbon, low
 * nitrogen, adequate phosphorus and potassium, and short on sulphur, zinc and
 * boron — which is the most common micronutrient picture in Maharashtra.
 *
 * These are illustrative figures for a sample card, not anyone's record.
 */
export const SAMPLE_READING: Reading[] = [
  { key: "nutPh", metricKey: "ph",                   symbol: "pH",  unit: "",       value: 8.4,  band: [6.5, 7.5],  axis: [4, 10],   dp: 1, scale: "ph" },
  { key: "nutEc", metricKey: "ec",                   symbol: "EC",  unit: "dS/m",   value: 0.42, band: [0, 1],      axis: [0, 2],    dp: 2, scale: "salt" },
  { key: "nutOc", metricKey: "organic_carbon",       symbol: "OC",  unit: "%",      value: 0.41, band: [0.5, 0.75], axis: [0, 1.5],  dp: 2, scale: "lmh" },
  { key: "nutN",  metricKey: "available_nitrogen",   symbol: "N",   unit: "kg/ha",  value: 178,  band: [280, 560],  axis: [0, 700],  dp: 0, scale: "lmh" },
  { key: "nutP",  metricKey: "available_phosphorus", symbol: "P",   unit: "kg/ha",  value: 12.4, band: [10, 25],    axis: [0, 50],   dp: 1, scale: "lmh" },
  { key: "nutK",  metricKey: "available_potassium",  symbol: "K",   unit: "kg/ha",  value: 241,  band: [108, 280],  axis: [0, 400],  dp: 0, scale: "lmh" },
  { key: "nutS",  metricKey: "available_sulphur",    symbol: "S",   unit: "ppm",    value: 8.2,  band: [10, 40],    axis: [0, 40],   dp: 1, scale: "critical" },
  { key: "nutZn", metricKey: "available_zinc",       symbol: "Zn",  unit: "ppm",    value: 0.42, band: [0.6, 2.5],  axis: [0, 2.5],  dp: 2, scale: "critical" },
  { key: "nutFe", metricKey: "available_iron",       symbol: "Fe",  unit: "ppm",    value: 5.8,  band: [4.5, 20],   axis: [0, 20],   dp: 1, scale: "critical" },
  { key: "nutMn", metricKey: "available_manganese",  symbol: "Mn",  unit: "ppm",    value: 3.1,  band: [2, 12],     axis: [0, 12],   dp: 1, scale: "critical" },
  { key: "nutCu", metricKey: "available_copper",     symbol: "Cu",  unit: "ppm",    value: 0.34, band: [0.2, 2],    axis: [0, 2],    dp: 2, scale: "critical" },
  { key: "nutB",  metricKey: "available_boron",      symbol: "B",   unit: "ppm",    value: 0.28, band: [0.5, 2.5],  axis: [0, 2.5],  dp: 2, scale: "critical" },
];

/**
 * A real card, drawn.
 *
 * The card prints its own lab range next to every reading, and that range wins
 * over the ICAR constants above. The promise this product makes is that it
 * reads *your* card, and software that tells a farmer their pH is alkaline
 * while the paper in their hand says it is within range has lost the argument
 * before it starts. `bandFromCard` records which one a row ended up using so
 * the chart can footnote a row where the two disagree.
 *
 * Rows the service did not find are returned in `missing` and are *not*
 * rendered. Falling back to the sample value for an unread property would put
 * an invented number in a chart of measured ones, which is the single most
 * dangerous thing this file could do.
 */
export function readingsFromExtraction(metrics: ExtractedMetric[]): {
  readings: Reading[];
  missing: Reading[];
} {
  const found = new Map(metrics.map((metric) => [metric.key, metric]));
  const readings: Reading[] = [];
  const missing: Reading[] = [];

  // Walked in card order, not in the order the service happened to return.
  for (const template of SAMPLE_READING) {
    const metric = found.get(template.metricKey);
    if (!metric) {
      missing.push(template);
      continue;
    }

    const hasCardBand =
      Number.isFinite(metric.range_min) &&
      Number.isFinite(metric.range_max) &&
      metric.range_max > metric.range_min;

    const band: [number, number] = hasCardBand
      ? [metric.range_min, metric.range_max]
      : template.band;

    readings.push({
      ...template,
      value: metric.reading,
      band,
      // A reading past the end of the drawn axis would pin to the end and read
      // as "at the maximum" rather than "off the scale". Widen instead, so an
      // unusual soil still draws truthfully.
      axis: [
        Math.min(template.axis[0], metric.reading, band[0]),
        Math.max(template.axis[1], metric.reading, band[1]),
      ],
      confidence: metric.confidence,
      bandFromCard: hasCardBand,
    });
  }

  return { readings, missing };
}

/**
 * Whether this row's own card range disagrees with the ICAR default enough to
 * be worth a footnote. Both are defensible; a farmer seeing "within range" for
 * pH 8.12 deserves to know the national guidance would call it alkaline.
 */
export function bandDivergesFromGuidance(r: Reading): boolean {
  if (!r.bandFromCard) return false;
  const template = SAMPLE_READING.find((row) => row.metricKey === r.metricKey);
  if (!template) return false;

  const [cardLow, cardHigh] = r.band;
  const [icarLow, icarHigh] = template.band;
  const span = Math.max(icarHigh - icarLow, 1e-9);

  // A tenth of the desirable window is the threshold: below that the two
  // agree in substance and a footnote would just be noise.
  return (
    Math.abs(cardLow - icarLow) / span > 0.1 || Math.abs(cardHigh - icarHigh) / span > 0.1
  );
}

/** Below the band, inside it, or above it. */
export function toneOf(r: Reading): Tone {
  if (r.value < r.band[0]) return "low";
  if (r.value > r.band[1]) return "high";
  return "ok";
}

/**
 * The rating word, in the vocabulary that property uses. A card does not call
 * pH "low", it calls it acidic — and getting that wrong is the fastest way to
 * look like software that has never seen the document it claims to read.
 */
export function ratingKey(r: Reading): DictKey {
  const tone = toneOf(r);
  switch (r.scale) {
    case "ph":
      return tone === "low" ? "stAcidic" : tone === "high" ? "stAlkaline" : "stNeutral";
    case "salt":
      return tone === "high" ? "stHigh" : "stNeutral";
    case "critical":
      return tone === "low" ? "stDeficient" : "stSufficient";
    default:
      return tone === "low" ? "stLow" : tone === "high" ? "stHigh" : "stMedium";
  }
}

/** Formatted to the number of decimals the card reports. */
export function formatValue(r: Reading): string {
  return r.value.toFixed(r.dp);
}

/**
 * Where a figure sits along its axis, 0–1. Clamped, because a reading past
 * the end of the axis should pin to the end rather than overflow the track.
 */
export function positionOn(r: Reading, v: number): number {
  const [min, max] = r.axis;
  return Math.min(1, Math.max(0, (v - min) / (max - min)));
}

/** Text and fill colours per tone. Straight from the existing palette. */
export const toneText: Record<Tone, string> = {
  low: "text-anar",
  ok: "text-leaf",
  high: "text-haldi-ink",
};

export const toneFill: Record<Tone, string> = {
  low: "bg-anar",
  ok: "bg-leaf",
  high: "bg-haldi",
};

export const tonePill: Record<Tone, string> = {
  low: "bg-anar-wash text-anar",
  ok: "bg-leaf-wash text-leaf-deep",
  high: "bg-haldi-wash text-haldi-ink",
};
