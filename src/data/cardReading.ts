import type { DictKey } from "@/lib/i18n";
import type { ExtractedMetric, MetricKey } from "@/lib/cardTypes";

/**
 * One real Soil Health Card, transcribed.
 *
 * `soilReading.ts` holds an *illustrative* profile used by the hero card and
 * the predict panel. This file is different in kind: it is what a scanned card
 * actually said, in the order that card printed it, and it is the fixture the
 * reading chart draws until the extractor is wired up. Keeping it separate is
 * the point — when real extraction lands it replaces this array and nothing
 * else, and no one has to work out which of two arrays was the sample.
 *
 * Two columns come off the card and only two: SAMPLE READING and RANGE. So
 * that is all a row carries. Everything the chart needs — how far off, which
 * way, how to sort it — is derived below, because a derived field stored in
 * the table is a field that goes stale the moment a value is edited.
 *
 * The card does not print units. These are the units the Maharashtra Soil
 * Health Card reports each property in, and they are labels only — no
 * arithmetic here depends on them.
 */

export type CardTone = "short" | "in" | "over";

export type CardRow = {
  /** Dictionary key — carries both the Marathi and English name. */
  key: DictKey;
  /** As printed in the first column. */
  symbol: string;
  unit: string;
  /** SAMPLE READING. */
  value: number;
  /** RANGE, as printed: [lower, upper]. */
  range: [number, number];
  /** Decimals the reading is printed to. */
  dp: 0 | 1 | 2;
  /** Decimals the *range* is printed to, when the card differs. */
  rangeDp?: 0 | 1 | 2;
  /** Which vocabulary this property's rating uses. */
  scale: "ph" | "salt" | "nutrient";
};

/**
 * Card order, not our order. A farmer holding the sheet should be able to run
 * a finger down both at once.
 *
 * The iron row on the scan carries a stray "5.95" printed into the label
 * column; 8.26 is the figure standing under SAMPLE READING, and that is the
 * reading. Left as-is rather than quietly averaged — a transcription should be
 * wrong in the same way the paper is, or it isn't a transcription.
 */
export const CARD_READING: CardRow[] = [
  { key: "nutB",  symbol: "B",  unit: "ppm",   value: 0.8,    range: [0.4, 1],       dp: 2, scale: "nutrient" },
  { key: "nutN",  symbol: "N",  unit: "kg/ha", value: 628.25, range: [280, 560],     dp: 2, rangeDp: 0, scale: "nutrient" },
  { key: "nutP",  symbol: "P",  unit: "kg/ha", value: 57.2,   range: [10, 25],       dp: 2, rangeDp: 0, scale: "nutrient" },
  { key: "nutK",  symbol: "K",  unit: "kg/ha", value: 488.2,  range: [120, 280],     dp: 2, rangeDp: 0, scale: "nutrient" },
  { key: "nutPh", symbol: "pH", unit: "",      value: 4.88,   range: [7.5, 8.9],     dp: 2, rangeDp: 1, scale: "ph" },
  { key: "nutEc", symbol: "EC", unit: "dS/m",  value: 0.25,   range: [0.2, 0.9],     dp: 2, scale: "salt" },
  { key: "nutOc", symbol: "OC", unit: "%",     value: 0.32,   range: [0.2, 0.6],     dp: 2, scale: "nutrient" },
  { key: "nutS",  symbol: "S",  unit: "ppm",   value: 23.36,  range: [10.2, 30.5],   dp: 2, scale: "nutrient" },
  { key: "nutZn", symbol: "Zn", unit: "ppm",   value: 2.55,   range: [0.5, 1],       dp: 2, scale: "nutrient" },
  { key: "nutFe", symbol: "Fe", unit: "ppm",   value: 8.26,   range: [2.2, 5.6],     dp: 2, scale: "nutrient" },
  { key: "nutMn", symbol: "Mn", unit: "ppm",   value: 9.06,   range: [7.1, 9.99],    dp: 2, scale: "nutrient" },
  { key: "nutCu", symbol: "Cu", unit: "ppm",   value: 4.34,   range: [1, 2],         dp: 2, rangeDp: 0, scale: "nutrient" },
];

/**
 * The same twelve rows, from a card that was actually uploaded.
 *
 * `CARD_READING` above is a transcription kept as the fixture this chart draws
 * before anyone has handed anything over. This turns a real extraction into
 * the same shape, so the chart itself does not know or care which it is
 * holding — which was the point of `rows` being a prop with a default.
 *
 * Both columns come off the document: the reading and the range printed beside
 * it. `symbol`, `unit` and the decimal places are ours, because the card does
 * not print them.
 *
 * Rows the reader could not recover are simply absent. They are never filled
 * in from the fixture — a chart of measured figures with one invented row in
 * it is worse than a chart with a row missing, because nothing on screen says
 * which is which.
 */
export function cardRowsFromExtraction(metrics: ExtractedMetric[]): CardRow[] {
  const found = new Map(metrics.map((metric) => [metric.key, metric]));

  return CARD_READING.flatMap((template) => {
    const metric = found.get(METRIC_KEY_BY_ROW[template.key]);
    if (!metric) return [];

    const range: [number, number] =
      Number.isFinite(metric.range_min) &&
      Number.isFinite(metric.range_max) &&
      metric.range_max > metric.range_min
        ? [metric.range_min, metric.range_max]
        : template.range;

    return [{ ...template, value: metric.reading, range }];
  });
}

/** Joins a row to what the reading service calls the same property. */
const METRIC_KEY_BY_ROW: Record<string, MetricKey> = {
  nutB: "available_boron",
  nutN: "available_nitrogen",
  nutP: "available_phosphorus",
  nutK: "available_potassium",
  nutPh: "ph",
  nutEc: "ec",
  nutOc: "organic_carbon",
  nutS: "available_sulphur",
  nutZn: "available_zinc",
  nutFe: "available_iron",
  nutMn: "available_manganese",
  nutCu: "available_copper",
};

/* ---- Reading the row ---------------------------------------------------- */

export function cardTone(r: CardRow): CardTone {
  if (r.value < r.range[0]) return "short";
  if (r.value > r.range[1]) return "over";
  return "in";
}

/**
 * The rating word, in the vocabulary that property uses. A card does not call
 * pH "low", it calls it acidic — and every one of these twelve rows prints a
 * genuine upper bound, so "above the range" is a thing that can be said. That
 * matters: an excess is money already spent, and rounding it up to
 * "sufficient" is how a farmer keeps buying it.
 */
export function cardRating(r: CardRow): DictKey {
  const tone = cardTone(r);
  switch (r.scale) {
    case "ph":
      return tone === "short" ? "stAcidic" : tone === "over" ? "stAlkaline" : "stNeutral";
    case "salt":
      return tone === "short" ? "stLow" : tone === "over" ? "stHigh" : "stNeutral";
    default:
      return tone === "short" ? "stDeficient" : tone === "over" ? "stExcess" : "stSufficient";
  }
}

const fmt = (n: number, dp: number) => n.toFixed(dp);

export const formatCardValue = (r: CardRow) => fmt(r.value, r.dp);

/** One end of the range, printed the way the card prints it. */
export const formatBound = (r: CardRow, end: 0 | 1) =>
  fmt(r.range[end], r.rangeDp ?? r.dp);

/** Both, for anywhere the range is quoted as a single string. */
export const formatCardRange = (r: CardRow) =>
  `${formatBound(r, 0)} – ${formatBound(r, 1)}`;

/**
 * How far outside the range this sits, in the property's own units. Signed:
 * negative is short of the lower bound, positive is past the upper one, zero
 * is anywhere inside. This is the number that turns into an instruction —
 * "1.55 ppm of zinc more than this field can use" is a thing to act on in a
 * way that "2.55" never is.
 */
export function gap(r: CardRow): number {
  if (r.value < r.range[0]) return r.value - r.range[0];
  if (r.value > r.range[1]) return r.value - r.range[1];
  return 0;
}

/** The same distance measured in range-widths, so twelve units compare. */
export function severity(r: CardRow): number {
  const width = r.range[1] - r.range[0];
  return width > 0 ? Math.abs(gap(r)) / width : 0;
}

export const formatGap = (r: CardRow) => {
  const g = gap(r);
  // A minus sign, not a hyphen. It sits on the digit's centreline.
  return `${g > 0 ? "+" : "−"}${fmt(Math.abs(g), r.dp)}`;
};

/* ---- Putting a row on a shared track ------------------------------------
   The chart's one real idea. Twelve properties share no units — nitrogen runs
   in the hundreds of kg/ha and boron in tenths of a ppm — so drawing each
   against its own axis, which is the obvious thing to do, produces twelve
   charts that happen to be stacked. Nothing can be compared across them and
   the eye has to re-read the scale on every row.

   Instead every row's *range* is mapped onto the same window in the middle of
   the track. The target stops being a different place on each row and becomes
   one vertical column down the page: inside it is right, left is short, right
   is excess, and the length sticking out is how bad it is — in range-widths,
   which is the one quantity all twelve share.

   Outside the window the scale is compressive, `d / (d + 1)`, which is what
   lets a reading 3× over its range and one 30× over both stay on the track and
   still be told apart. It is not linear and is not meant to be read as a
   measurement; the printed figures beside it are the measurement. */

const BAND_START = 0.36;
const BAND_END = 0.64;
const OUTSIDE = BAND_START;

export const bandEdges = { start: BAND_START, end: BAND_END };

export function positionOf(r: CardRow, value: number): number {
  const [lo, hi] = r.range;
  const width = hi - lo || 1;

  if (value >= lo && value <= hi) {
    return BAND_START + ((value - lo) / width) * (BAND_END - BAND_START);
  }
  if (value < lo) {
    const d = (lo - value) / width;
    return BAND_START - OUTSIDE * (d / (d + 1));
  }
  const d = (value - hi) / width;
  return BAND_END + OUTSIDE * (d / (d + 1));
}

/* ---- Palette. The product's three-colour language, unchanged. ---------- */

export const toneText: Record<CardTone, string> = {
  short: "text-anar",
  in: "text-leaf",
  over: "text-haldi-ink",
};

export const toneFill: Record<CardTone, string> = {
  short: "bg-anar",
  in: "bg-leaf",
  over: "bg-haldi",
};

export const tonePill: Record<CardTone, string> = {
  short: "bg-anar-wash text-anar",
  in: "bg-leaf-wash text-leaf-deep",
  over: "bg-haldi-wash text-haldi-ink",
};

/**
 * The verdict, at full strength.
 *
 * The washes above are right for a quiet label beside a figure, but wrong for
 * the one word on the row that decides whether a farmer acts. A pale pink pill
 * reading "कमी" next to a pale green one reading "बरोबर" are the same object
 * at a glance, and this chart is scanned, not read.
 *
 * Text colour is not decoration here. `anar` and `leaf` are dark on paper and
 * light in the dark theme, so they flip which text they need; `haldi` is a
 * mid-yellow in both and always wants dark ink. `on-light` is deliberately
 * outside the theme swap for exactly this — text sitting on a fixed colour
 * rather than on the page.
 */
export const toneSolid: Record<CardTone, string> = {
  short: "bg-anar text-chalk dark:text-on-light",
  in: "bg-leaf text-chalk dark:text-on-light",
  over: "bg-haldi text-on-light",
};

/** The 4px spine down the left of a row — the thing that makes the list scannable. */
export const toneSpine: Record<CardTone, string> = {
  short: "bg-anar",
  in: "bg-leaf",
  over: "bg-haldi",
};
