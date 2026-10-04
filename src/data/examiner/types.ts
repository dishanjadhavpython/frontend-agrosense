/**
 * Shapes for everything under `src/data/examiner/`.
 *
 * Hand-written, and deliberately not emitted by the generator. If a training
 * artifact ever changes shape, the failure should land here — as a type error
 * at the import site, naming the field — rather than as a generator quietly
 * writing `undefined` into a module that a page then renders as an empty chart.
 * Generated modules close with `satisfies`, so that check is not optional.
 */

/**
 * Five accents and two neutrals. Never an eighth, and never one chosen because
 * a chart needed another series.
 *
 *   gold    the thing that was chosen
 *   green   a measured improvement
 *   blue    a neutral quantity, or a system we call out to
 *   clay    rejected, vetoed, or a cost
 *   slate   something we do not own
 */
export type Tone =
  "gold" | "green" | "blue" | "clay" | "slate" | "ink" | "mute";

/** Where a number came from. Rendered under every figure, verbatim. */
export type Source = {
  /** Repo-relative. Absolute local paths are rewritten by the generator. */
  path: string;
  /** Section within the file, when the file is a report: "§7.1". */
  at?: string;
};

/** A file the generator read, with enough to prove it has not drifted. */
export type SourceFile = {
  path: string;
  exists: boolean;
  bytes: number | null;
  sha256: string | null;
  modified: string | null;
};

/* ── the soil image classifier ─────────────────────────────────────────── */

/** One arm of the three-way tournament. */
export type Arm = {
  name: string;
  /** The grouped-CV mean and its spread across the five folds. */
  macroF1: number;
  macroF1Std: number;
  perFold: readonly number[];
  accuracy: number;
  /** Expected calibration error, after temperature scaling. */
  ece: number;
  temperature: number;
  perClassRecall: Readonly<Record<string, number>>;
  checkpointBytes: number;
  /** The arm that was carried forward out of the tournament. */
  chosen: boolean;
};

/** Pooled out-of-fold performance for one class. */
export type ClassScore = {
  label: string;
  precision: number;
  recall: number;
  f1: number;
  support: number;
};

export type SoilModel = {
  dataset: {
    filesScanned: number;
    distinctByMd5: number;
    distinctScenes: number;
    hammingThreshold: number;
    droppedLabelConflicts: number;
    classes: readonly string[];
    /** The Survey of India name for each class; `null` where there is none. */
    surveyVocabulary: Readonly<Record<string, string | null>>;
    imagesPerClass: Readonly<Record<string, number>>;
    scenesPerClass: Readonly<Record<string, number>>;
    builtAt: string;
  };
  protocol: string;
  folds: number;
  shippedFold: number;
  arms: readonly Arm[];
  /** Pooled over the five held-out folds, so every image is scored once. */
  pooled: {
    arm: string;
    accuracy: number;
    macroF1: number;
    support: number;
    classes: readonly ClassScore[];
    /** Rows are truth, columns are prediction, in `dataset.classes` order. */
    confusion: readonly (readonly number[])[];
    meanConfidence: number;
    meanConfidenceCorrect: number;
    meanConfidenceWrong: number;
    /** Twenty bins across [0,1], counted separately for right and wrong. */
    confidenceBins: readonly {
      from: number;
      to: number;
      correct: number;
      wrong: number;
    }[];
  };
  /** Whether `ML/models/` is serving this fit, rather than an older one. */
  promoted: boolean;
  /**
   * The eight-class model this one replaced. Its score is self-reported, from
   * folds that did not group near-duplicates, so it is quoted, never compared.
   */
  previous: {
    architecture: string;
    classes: number;
    reportedMacroF1: number;
    reportedMacroF1Std: number;
  } | null;
  /** The four-class run on `4 soils in use` that this one supersedes. */
  fourClass: {
    classes: number;
    scenes: number;
    macroF1: number;
    macroF1Std: number;
  } | null;
  sources: readonly string[];
};

/* ── the decision ledger ───────────────────────────────────────────────── */

/**
 * One engineering decision, in the shape an examiner asks about it: what was
 * the question, what were the options, what was measured, what was chosen, and
 * what did choosing it cost.
 *
 * The `cost` field is not optional out of politeness. Every real decision here
 * gave something up — dropping N/P/K from the crop model cost three accuracy
 * points, keeping the incumbent soil model cost the four-class vocabulary — and
 * a ledger of decisions with no costs in it is a sales document.
 */
export type Decision = {
  id: string;
  /** The chapter this belongs to, as an href. */
  chapter: string;
  question: string;
  options: readonly {
    name: string;
    /** What this option actually measured, where there is a number. */
    measured?: string;
    chosen?: boolean;
  }[];
  decision: string;
  because: string;
  cost?: string;
  source?: string;
};

/* ── model tournaments ─────────────────────────────────────────────────── */

/** One candidate in a head-to-head. `null` where an arm produced no number. */
export type Contender = {
  name: string;
  /** The metric that decided it, already formatted for display. */
  score: string | null;
  /** Everything else measured about the arm: spread, latency, fit time. */
  detail?: string;
  chosen: boolean;
  /** Why there is no score — a timeout, a crash. Recorded, never dropped. */
  failed?: string;
};

/**
 * A decision between models, in the shape it has to be defended in: what the
 * task was, what protocol the comparison ran under, which metric settled it,
 * and what the winner cost.
 */
export type Tournament = {
  id: string;
  task: string;
  protocol: string;
  metric: string;
  contenders: readonly Contender[];
  chosen: string;
  why: string;
  /** The thing this page must not omit — what choosing the winner gave up. */
  cost?: string;
  source: string;
};

/* ── engine reports ────────────────────────────────────────────────────── */

/** A pipe table lifted verbatim from one of the engine's report markdowns. */
export type ReportTable = {
  /** The heading it was found under, so the citation is exact. */
  heading: string;
  source: string;
  head: readonly string[];
  rows: readonly (readonly (string | number)[])[];
};

/** One weighted line of the engine scorecard. `null` means never measured. */
export type SubScore = {
  label: string;
  measured: number | null;
  floor: number;
  target: number;
  weight: number;
  score: number | null;
};

export type Scorecard = {
  label: string;
  at: string;
  composite: number;
  uncapped: number;
  measuredWeight: number;
  gates: readonly { name: string; pass: boolean; detail: string }[];
  subScores: readonly SubScore[];
  history: readonly {
    at: string;
    label: string;
    composite: number;
    gates: string;
  }[];
  source: string;
};

/* ── the scrapers ──────────────────────────────────────────────────────── */

/** One file a scraper produced, counted on disk rather than quoted. */
export type ScrapedFile = {
  group: string;
  /** Repo-relative, so the figure can cite the file it counted. */
  path: string;
  name: string;
  period: string;
  rows: number | null;
  columns: number | null;
  bytes: number | null;
  /** The first few column names; the full width is in `columns`. */
  headers: readonly string[];
};
