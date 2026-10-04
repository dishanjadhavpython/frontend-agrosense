/**
 * Generates the committed data modules the examiner walkthrough renders from.
 *
 * Why a generator and not a build-time import: `ML/models/` is gitignored and
 * `ml engine for Recommendation/` is untracked, so the artifacts are not in a
 * clone. Reading them during `next build` would work on Fly — which builds from
 * the working directory — and fail on Vercel, which builds from a git push.
 * `fly.toml` records that difference as the reason Fly was chosen at all, so a
 * build that depends on the artifacts would break one of the three deployment
 * topologies the walkthrough is about.
 *
 * So the numbers are read here, once, and written out as TypeScript that is
 * committed. Every emitted module records the sha256 of each file it came from.
 *
 *   node scripts/build-examiner-data.mjs            write the modules
 *   node scripts/build-examiner-data.mjs --check    fail if they have drifted
 *
 * `--check` is what runs in `npm run build`. It passes when an artifact is
 * absent, because a clean clone has nothing to check; it fails only when a file
 * is present and no longer matches what was committed. Same contract as
 * `check-csp-hash.mjs` and `check-ontology.mjs`: turn a quiet staleness bug
 * into a loud build failure, without making a clone unbuildable.
 */

import { createHash } from "node:crypto";
import { readFileSync, statSync, existsSync } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "src/data/examiner/generated");
const CHECK = process.argv.includes("--check");

/**
 * The only directories this script is allowed to read. The repository root also
 * holds `.env` with live keys; an accidental glob is not a risk worth carrying
 * for a convenience.
 */
const ALLOWED_ROOTS = [
  "ML/models",
  "ML/data",
  "ml engine for Recommendation/artifacts",
  "ml engine for Recommendation/reports",
  "scrape data imp/output",
];

const abs = (rel) => {
  if (!ALLOWED_ROOTS.some((r) => rel === r || rel.startsWith(r + "/"))) {
    throw new Error(`refusing to read outside the artifact roots: ${rel}`);
  }
  return path.join(ROOT, rel);
};

/**
 * Absolute local paths leak out of the training artifacts — `soil_metadata.json`
 * records its dataset as "/Volumes/dishan project/4 soils in use", and
 * `out_of_fold.json` carries 1,555 of them. None of that belongs on a public
 * page.
 */
const redact = (v) =>
  typeof v === "string"
    ? v.replace(/\/Volumes\/[^"',\s]*?\/([^/"',\s]+)/g, "$1").replace(/\/Volumes\/[^"',\s]+/g, "(local path)")
    : v;

const sources = new Map();

function read(rel) {
  const file = abs(rel);
  if (!existsSync(file)) {
    sources.set(rel, { path: rel, exists: false, bytes: null, sha256: null, modified: null });
    return null;
  }
  const buf = readFileSync(file);
  sources.set(rel, {
    path: rel,
    exists: true,
    bytes: buf.length,
    sha256: createHash("sha256").update(buf).digest("hex").slice(0, 16),
    modified: statSync(file).mtime.toISOString().slice(0, 10),
  });
  return buf;
}

const readJson = (rel) => {
  const buf = read(rel);
  if (!buf) return null;
  // The scraped CSVs carry a UTF-8 BOM; JSON from the trainers does not, but
  // stripping it costs nothing and one of these files will eventually have one.
  return JSON.parse(buf.toString("utf8").replace(/^﻿/, ""));
};

/** Short literals in, no float drift out. */
const r4 = (n) => (typeof n === "number" && Number.isFinite(n) ? Number(n.toFixed(4)) : n);

/**
 * Significant figures, for quantities that live near zero.
 *
 * `r4` turned a McNemar p of 4.48e-06 into a flat 0, which on the page reads as
 * "no result" rather than "overwhelming". Anything that can legitimately be
 * smaller than 0.0001 — p-values, coverage error — goes through this instead.
 */
const sig = (n, digits = 3) =>
  typeof n === "number" && Number.isFinite(n) ? Number(n.toPrecision(digits)) : n;

/* ── markdown and csv ──────────────────────────────────────────────────── */

/**
 * Lift a GitHub pipe table out of a report, by the heading above it.
 *
 * The engine's reports are machine-written, so the tables are regular and this
 * is reliable in a way that parsing prose never is. It throws rather than
 * returning nothing when a heading moves: a silently empty table is how a wrong
 * number — or no number at all — reaches a viva.
 */
function tableUnder(md, headingPattern, label) {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => headingPattern.test(l));
  if (start < 0) throw new Error(`table not found: no heading matching ${headingPattern} (${label})`);

  let i = start + 1;
  while (i < lines.length && !lines[i].trim().startsWith("|")) {
    if (/^#{1,6}\s/.test(lines[i])) {
      throw new Error(`table not found under ${headingPattern}: next heading reached first (${label})`);
    }
    i++;
  }
  if (i >= lines.length) throw new Error(`table not found under ${headingPattern} (${label})`);

  const cells = (line) =>
    line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

  const head = cells(lines[i]).map((h) => h.replace(/\s*<-.*$/, "").trim());
  i += 2; // skip the alignment row
  const rows = [];
  while (i < lines.length && lines[i].trim().startsWith("|")) {
    rows.push(
      cells(lines[i]).map((c) => {
        const plain = c.replace(/\*\*/g, "").trim();
        if (plain === "" || plain === "—" || plain === "-") return plain;
        const n = Number(plain);
        return Number.isFinite(n) && /^-?[\d.]+$/.test(plain) ? n : plain;
      }),
    );
    i++;
  }
  if (!rows.length) throw new Error(`table under ${headingPattern} has no rows (${label})`);
  return { head, rows };
}

/** A report table plus the citation that proves where it came from. */
function reportTable(rel, headingPattern, headingLabel) {
  const buf = read(rel);
  if (!buf) return null;
  const { head, rows } = tableUnder(buf.toString("utf8"), headingPattern, rel);
  return { heading: headingLabel, source: rel, head, rows };
}

/** CSV with a header row. Strips the BOM the scraped files carry. */
function readCsv(rel) {
  const buf = read(rel);
  if (!buf) return null;
  const lines = buf.toString("utf8").replace(/^﻿/, "").trim().split("\n");
  const split = (line) => {
    const out = [];
    let cur = "", quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === "," && !quoted) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  };
  const head = split(lines[0]);
  return lines.slice(1).filter(Boolean).map((l) => {
    const cells = split(l);
    return Object.fromEntries(head.map((h, i) => {
      const v = cells[i] ?? "";
      const n = Number(v);
      return [h, v !== "" && Number.isFinite(n) && /^-?[\d.]+$/.test(v) ? n : v];
    }));
  });
}

/* ── soil image classifier ─────────────────────────────────────────────── */

function buildSoilModel() {
  const meta = readJson("ML/models/soil_v2/soil_metadata.json");
  const manifest = readJson("ML/data/soil_v2/manifest.json");
  const oof = readJson("ML/models/soil_v2/out_of_fold.json");
  const serving = readJson("ML/models/soil_metadata.json");
  // The model this one replaced, and the four-class run it supersedes. Both are
  // context, not requirements: a checkout without them still builds the chapter.
  const legacy = readJson("ML/models/legacy_8class/soil_metadata.json");
  const fourClass = readJson("ML/models/soil_v2_4class/soil_metadata.json");
  if (!meta || !manifest || !oof || !serving) return null;

  const classes = meta.classes;
  const chosen = meta.arm;

  const arms = meta.comparison.map((a) => ({
    name: a.architecture === chosen ? chosen : a.architecture,
    macroF1: r4(a.macro_f1_mean),
    macroF1Std: r4(a.macro_f1_std),
    perFold: a.macro_f1_per_fold.map(r4),
    accuracy: r4(a.accuracy_mean),
    ece: r4(a.ece_mean),
    temperature: r4(a.temperature),
    perClassRecall: Object.fromEntries(Object.entries(a.per_class_recall).map(([k, v]) => [k, r4(v)])),
    checkpointBytes: a.checkpoint_bytes,
    chosen: a.architecture === chosen,
  }));
  // The metadata's `comparison` names arms by architecture; the warm-started arm
  // shares an architecture with the cold one, so trust `arm` for the winner and
  // fall back to position for the label.
  if (!arms.some((a) => a.chosen)) {
    const i = meta.comparison.findIndex((a) => r4(a.macro_f1_mean) === r4(meta.cv_macro_f1_mean));
    if (i >= 0) { arms[i].chosen = true; arms[i].name = chosen; }
  }

  // Pooled out-of-fold: every image scored exactly once, by the fold that held
  // it out. A per-fold average hides which classes the mistakes land in.
  const rows = oof[chosen];
  const idx = Object.fromEntries(classes.map((c, i) => [c, i]));
  const confusion = classes.map(() => classes.map(() => 0));
  let correct = 0, confSum = 0, confRight = 0, confWrong = 0, nRight = 0, nWrong = 0;
  const BINS = 20;
  const bins = Array.from({ length: BINS }, (_, i) => ({
    from: r4(i / BINS), to: r4((i + 1) / BINS), correct: 0, wrong: 0,
  }));

  for (const row of rows) {
    confusion[idx[row.truth]][idx[row.predicted]] += 1;
    const ok = row.truth === row.predicted;
    const b = Math.min(BINS - 1, Math.floor(row.confidence * BINS));
    bins[b][ok ? "correct" : "wrong"] += 1;
    confSum += row.confidence;
    if (ok) { correct++; confRight += row.confidence; nRight++; }
    else { confWrong += row.confidence; nWrong++; }
  }

  const classScores = classes.map((label, i) => {
    const tp = confusion[i][i];
    const predicted = classes.reduce((a, _, j) => a + confusion[j][i], 0);
    const support = confusion[i].reduce((a, b) => a + b, 0);
    const precision = predicted ? tp / predicted : 0;
    const recall = support ? tp / support : 0;
    return {
      label,
      precision: r4(precision),
      recall: r4(recall),
      f1: r4(precision + recall ? (2 * precision * recall) / (precision + recall) : 0),
      support,
    };
  });

  return {
    dataset: {
      filesScanned: manifest.files_scanned,
      distinctByMd5: manifest.distinct_by_md5,
      distinctScenes: manifest.distinct_scenes,
      hammingThreshold: manifest.hamming_threshold,
      droppedLabelConflicts: manifest.dropped_label_conflicts.length,
      classes,
      surveyVocabulary: manifest.survey_vocabulary,
      imagesPerClass: manifest.images_per_class,
      scenesPerClass: manifest.scenes_per_class,
      builtAt: manifest.built_at,
    },
    protocol: redact(meta.protocol),
    folds: meta.comparison[0].macro_f1_per_fold.length,
    shippedFold: meta.shipped_fold,
    arms,
    pooled: {
      arm: chosen,
      accuracy: r4(correct / rows.length),
      macroF1: r4(classScores.reduce((a, c) => a + c.f1, 0) / classScores.length),
      support: rows.length,
      classes: classScores,
      confusion,
      meanConfidence: r4(confSum / rows.length),
      meanConfidenceCorrect: r4(confRight / nRight),
      meanConfidenceWrong: r4(confWrong / nWrong),
      confidenceBins: bins,
    },
    // Promotion copies the winner into ML/models/ with slug labels, so the
    // serving metadata carries the same fit (temperature, CV score) as soil_v2.
    promoted:
      serving.trained_at === meta.trained_at && serving.temperature === meta.temperature,
    previous: legacy && {
      architecture: legacy.architecture,
      classes: legacy.classes.length,
      reportedMacroF1: r4(legacy.cv_macro_f1_mean),
      reportedMacroF1Std: r4(legacy.cv_macro_f1_std),
    },
    fourClass: fourClass && {
      classes: fourClass.classes.length,
      scenes: fourClass.dataset.distinct_scenes,
      macroF1: r4(fourClass.cv_macro_f1_mean),
      macroF1Std: r4(fourClass.cv_macro_f1_std),
    },
    sources: [
      "ML/models/soil_v2/soil_metadata.json",
      "ML/models/soil_v2/out_of_fold.json",
      "ML/models/soil_metadata.json",
      "ML/models/legacy_8class/soil_metadata.json",
      "ML/models/soil_v2_4class/soil_metadata.json",
      "ML/data/soil_v2/manifest.json",
    ],
  };
}

/* ── model tournaments ─────────────────────────────────────────────────── */

const ENG = "ml engine for Recommendation";

function buildTournaments() {
  const crop = readJson("ML/models/crop_metadata.json");
  const fert = readJson("ML/models/fertilizer_metadata.json");
  const sel = readJson(`${ENG}/artifacts/model_selection.json`);
  if (!crop || !fert || !sel) return null;

  const pick = (arms, chosen, metric) =>
    arms.map((a) => ({
      name: a.name,
      score: r4(a[metric]).toFixed(4),
      detail: `± ${r4(a[`${metric.replace("_mean", "")}_std`] ?? 0).toFixed(4)} · ${a.predict_ms} ms per prediction`,
      chosen: a.name === chosen,
    }));

  const rankArms = Object.entries(sel.ranking.arms).map(([name, a]) => ({
    name,
    score: a.status === "ok" ? r4(a["ndcg@5"]).toFixed(4) : null,
    detail: a.status === "ok" ? `fit ${a.fit_s}s · serve ${a.latency_s}s` : undefined,
    chosen: name === sel.chosen.ranker,
    failed: a.status === "ok" ? undefined : a.note,
  }));

  const yieldArms = Object.entries(sel.yield.arms).map(([name, a]) => ({
    name,
    score: a.status === "ok" ? r4(a.within_crop_rho).toFixed(4) : null,
    detail:
      a.status === "ok"
        ? `80% interval covers ${r4(a.coverage_80).toFixed(3)} · pinball ${r4(a.pinball_p50).toFixed(4)}`
        : undefined,
    chosen: name === sel.chosen.yield,
    failed: a.status === "ok" ? undefined : a.note,
  }));

  const cbDelta = sel.ranking.arms.catboost?.vs_incumbent;

  return {
    tournaments: [
      {
        id: "crop-model",
        task: "Which crop suits these four field conditions?",
        protocol: `5-fold cross-validation over ${crop.rows.toLocaleString("en-IN")} rows, ${crop.classes.length} crops`,
        metric: "CV accuracy",
        contenders: pick(crop.comparison, crop.model, "accuracy_mean"),
        chosen: crop.model,
        why: "A third of a point ahead on accuracy and slightly faster to serve. Neither margin is large; the incumbent rule would have kept either.",
        cost: redact(crop.note),
        source: "ML/models/crop_metadata.json",
      },
      {
        id: "fertiliser-model",
        task: "Which of seven fertiliser products fits these conditions?",
        protocol: `5-fold cross-validation over ${fert.rows.toLocaleString("en-IN")} rows, ${fert.classes.length} products`,
        metric: "CV accuracy",
        contenders: pick(fert.comparison, fert.model, "accuracy_mean"),
        chosen: fert.model,
        why: `Both arms land near the ${(1 / fert.classes.length).toFixed(4)} a seven-way coin toss would give. The tournament was won, and the winner is still not allowed to choose the bag.`,
        cost: redact(fert.note),
        source: "ML/models/fertilizer_metadata.json",
      },
      {
        id: "engine-ranker",
        task: "Which model ranks crops for a taluka?",
        protocol: `${sel.ranking.protocol}, ${sel.ranking.n_queries} queries`,
        metric: "NDCG@5",
        contenders: rankArms,
        chosen: sel.chosen.ranker,
        why: sel.chosen.why.ranker,
        source: `${ENG}/artifacts/model_selection.json`,
      },
      {
        id: "engine-yield",
        task: "Which model predicts yield for a crop in a district it has never seen?",
        protocol: `${sel.yield.protocol}, ${sel.yield.n_rows.toLocaleString("en-IN")} rows`,
        metric: "within-crop rho",
        contenders: yieldArms,
        chosen: sel.chosen.yield,
        why: sel.chosen.why.yield,
        source: `${ENG}/artifacts/model_selection.json`,
      },
    ],
    rankerDelta: cbDelta
      ? {
          delta: r4(cbDelta.delta),
          lo: r4(cbDelta.ci_low),
          hi: r4(cbDelta.ci_high),
          p: sig(cbDelta.p_holm),
          districts: cbDelta.n_districts,
          queries: cbDelta.n_queries,
        }
      : null,
    cropFeatures: crop.features,
    fertiliserRandomBaseline: r4(1 / fert.classes.length),
    fertiliserHoldout: {
      accuracy: r4(fert.holdout_accuracy),
      macroF1: r4(fert.holdout_macro_f1),
      top3: r4(fert.holdout_top3_accuracy),
    },
    sources: [
      "ML/models/crop_metadata.json",
      "ML/models/fertilizer_metadata.json",
      `${ENG}/artifacts/model_selection.json`,
    ],
  };
}

/* ── the engine ────────────────────────────────────────────────────────── */

function buildEngine() {
  const latest = readJson(`${ENG}/artifacts/scorecard_latest.json`);
  const historyRows = readCsv(`${ENG}/reports/scorecard_history.csv`);
  const regimes = readCsv(`${ENG}/artifacts/s3_regimes.csv`);
  if (!latest || !historyRows) return null;

  const scoreMd = read(`${ENG}/reports/scorecard.md`);
  const subTable = scoreMd
    ? tableUnder(scoreMd.toString("utf8"), /^### Sub-scores/, "scorecard sub-scores")
    : null;

  const num = (v) => (typeof v === "number" ? r4(v) : null);

  const subScores = subTable
    ? subTable.rows.map((r) => ({
        label: String(r[0]),
        measured: num(r[1]),
        floor: r4(Number(r[2])),
        target: r4(Number(r[3])),
        weight: r4(Number(r[4])),
        score: num(r[5]),
      }))
    : [];

  return {
    scorecard: {
      label: latest.row.label,
      at: latest.row.timestamp,
      composite: r4(latest.row.composite),
      uncapped: r4(latest.row.composite_uncapped),
      measuredWeight: r4(latest.row.measured_weight),
      gates: Object.entries(latest.gates).map(([name, [pass, detail]]) => ({
        name, pass, detail,
      })),
      subScores,
      history: historyRows.map((h) => ({
        at: String(h.timestamp),
        label: String(h.label),
        composite: r4(Number(h.composite)),
        gates: String(h.gates),
      })),
      source: `${ENG}/artifacts/scorecard_latest.json`,
    },
    tables: [
      reportTable(`${ENG}/reports/benchmark_results.md`, /^## The headline number is a mirage/, "The headline number is a mirage"),
      reportTable(`${ENG}/reports/benchmark_results.md`, /^## Why GroupKFold by district is not optional/, "Why GroupKFold by district is not optional"),
      reportTable(`${ENG}/reports/benchmark_results.md`, /^## 7\.1 Feature block ablation/, "§7.1 Feature block ablation"),
      reportTable(`${ENG}/reports/benchmark_results.md`, /^### Blocks the n=34 constraint rejects/, "§7.1 Blocks the n=34 constraint rejects"),
      reportTable(`${ENG}/reports/benchmark_results.md`, /^## 7\.3 Ranking benchmark/, "§7.3 Ranking benchmark"),
      reportTable(`${ENG}/reports/benchmark_results.md`, /^## 5\.4 Conformal calibration/, "§5.4 Conformal calibration"),
      reportTable(`${ENG}/reports/gate_validation.md`, /^## Does the gate agree with practice\?/, "Does the gate agree with practice?"),
      reportTable(`${ENG}/reports/scorecard.md`, /^\*\*Forward chaining/, "Ranking as served — forward chaining"),
      reportTable(`${ENG}/reports/scorecard.md`, /^\*\*Grouped \+ temporal/, "Ranking as served — grouped + temporal"),
      reportTable(`${ENG}/reports/experiments.md`, /^## Result: the shipped engine had a defect/, "Engines compared"),
      reportTable(`${ENG}/reports/experiments.md`, /^## What did \*not\* work/, "Honest negatives"),
    ].filter(Boolean),
    regimes: regimes
      ? regimes.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "number" ? r4(v) : v])))
      : [],
    sources: [
      `${ENG}/artifacts/scorecard_latest.json`,
      `${ENG}/reports/scorecard_history.csv`,
      `${ENG}/reports/scorecard.md`,
      `${ENG}/reports/benchmark_results.md`,
      `${ENG}/reports/gate_validation.md`,
      `${ENG}/reports/experiments.md`,
      `${ENG}/artifacts/s3_regimes.csv`,
    ],
  };
}

/* ── the scrapers ──────────────────────────────────────────────────────── */

const SCRAPE = "scrape data imp/output";

/**
 * A census of what the scrapers actually produced.
 *
 * Row counts are counted, never quoted from a plan. The point of this chapter
 * is that the engine stands on real government data, and a figure that was
 * typed in by hand proves nothing about what is on disk.
 */
function buildScrapers() {
  const files = [
    { group: "Soil Health Card", rel: `${SCRAPE}/maharashtra_all_parameters_2023-24_talukas.csv`, period: "2023-24" },
    { group: "Soil Health Card", rel: `${SCRAPE}/maharashtra_all_parameters_2024-25_talukas.csv`, period: "2024-25" },
    { group: "Soil Health Card", rel: `${SCRAPE}/maharashtra_all_parameters_2025-26_talukas.csv`, period: "2025-26" },
    { group: "Crop statistics", rel: `${SCRAPE}/maharashtra_crops_apy_2015-16.csv`, period: "2015-16" },
    { group: "Crop statistics", rel: `${SCRAPE}/maharashtra_crops_apy_2019-20.csv`, period: "2019-20" },
    { group: "Crop statistics", rel: `${SCRAPE}/maharashtra_crops_apy_2021-22.csv`, period: "2021-22" },
    { group: "Daily weather", rel: `${SCRAPE}/maharashtra_daily_weather_taluka_2023-04-01_to_2024-03-31.csv`, period: "2023-24" },
    { group: "Daily weather", rel: `${SCRAPE}/maharashtra_daily_weather_taluka_2024-04-01_to_2025-03-31.csv`, period: "2024-25" },
    { group: "Fertiliser recommendations", rel: `${SCRAPE}/maharashtra_fertilizer_recommendations.csv`, period: "current" },
    { group: "Soil type", rel: `${SCRAPE}/maharashtra_soil_type_talukas.csv`, period: "current" },
  ];

  const out = [];
  for (const f of files) {
    const { rel, ...meta } = f;
    const row = { ...meta, path: rel, name: rel.split("/").pop() };
    const buf = read(rel);
    if (!buf) { out.push({ ...row, rows: null, columns: null, bytes: null, headers: [] }); continue; }
    const text = buf.toString("utf8").replace(/^﻿/, "");
    const lines = text.split("\n").filter((l) => l.trim().length);
    const headers = lines[0].split(",").map((h) => h.trim());
    out.push({
      ...row,
      rows: lines.length - 1,
      columns: headers.length,
      bytes: buf.length,
      // The first handful only: a 45-column table is a fact about the table,
      // not something to print in full on a page.
      headers: headers.slice(0, 6),
    });
  }

  if (!out.some((f) => f.rows !== null)) return null;

  const totals = {};
  for (const f of out) {
    if (f.rows === null) continue;
    totals[f.group] = (totals[f.group] ?? 0) + f.rows;
  }

  return {
    files: out,
    totals,
    sources: files.map((f) => f.rel),
  };
}

/* ── emit ──────────────────────────────────────────────────────────────── */

const header = (srcs) => `// GENERATED — do not edit by hand.
// Written by scripts/build-examiner-data.mjs. Re-run \`npm run data:examiner\`
// after retraining. \`npm run check:examiner\` fails the build if a source file
// on disk no longer matches the hash recorded here.
//
// Sources:
${srcs.map((s) => {
  const m = sources.get(s);
  return `//   ${s}\n//     ${m?.exists ? `sha256 ${m.sha256} · ${m.bytes} bytes · ${m.modified}` : "NOT PRESENT in this checkout"}`;
}).join("\n")}
`;

const ts = (v) => JSON.stringify(v, null, 2);

async function main() {
  const soil = buildSoilModel();
  const tourn = buildTournaments();
  const engine = buildEngine();
  const scrapers = buildScrapers();

  const modules = [
    soil && {
      file: "soilModel.ts",
      body: `${header(soil.sources)}
import type { SoilModel } from "../types";

export const SOIL_MODEL = ${ts(soil)} as const satisfies SoilModel;
`,
    },
    tourn && {
      file: "tournaments.ts",
      body: `${header(tourn.sources)}
import type { Tournament } from "../types";

export const TOURNAMENTS = ${ts(tourn.tournaments)} as const satisfies readonly Tournament[];

/** CatBoost's measured edge over the incumbent ranker, with its interval. */
export const RANKER_DELTA = ${ts(tourn.rankerDelta)};

export const CROP_FEATURES = ${ts(tourn.cropFeatures)};
export const FERTILISER_RANDOM_BASELINE = ${ts(tourn.fertiliserRandomBaseline)};
export const FERTILISER_HOLDOUT = ${ts(tourn.fertiliserHoldout)};
`,
    },
    engine && {
      file: "engine.ts",
      body: `${header(engine.sources)}
import type { ReportTable, Scorecard } from "../types";

export const SCORECARD = ${ts(engine.scorecard)} as const satisfies Scorecard;

/** Pipe tables lifted verbatim from the engine's own reports. */
export const ENGINE_TABLES = ${ts(engine.tables)} as const satisfies readonly ReportTable[];

export const YIELD_REGIMES = ${ts(engine.regimes)};
`,
    },
    scrapers && {
      file: "scrapers.ts",
      body: `${header(scrapers.sources)}
import type { ScrapedFile } from "../types";

export const SCRAPED_FILES = ${ts(scrapers.files)} as const satisfies readonly ScrapedFile[];

/** Rows per dataset family, summed over the files sampled above. */
export const SCRAPED_TOTALS = ${ts(scrapers.totals)};
`,
    },
    {
      file: "manifest.ts",
      body: `${header([...sources.keys()])}
import type { SourceFile } from "../types";

/** Every artifact this walkthrough was generated from, and its state on disk. */
export const SOURCE_FILES = ${ts([...sources.values()])} as const satisfies readonly SourceFile[];

export const GENERATED_AT = ${JSON.stringify(new Date().toISOString().slice(0, 10))};
`,
    },
  ].filter(Boolean);

  if (CHECK) {
    let stale = 0, missing = 0;
    for (const [rel, meta] of sources) {
      if (!meta.exists) { missing++; continue; }
      const committed = path.join(OUT_DIR, "manifest.ts");
      if (!existsSync(committed)) {
        console.error(`check:examiner — ${path.relative(ROOT, committed)} has not been generated yet.`);
        console.error("  run: npm run data:examiner");
        process.exit(1);
      }
      const text = readFileSync(committed, "utf8");
      // The committed manifest records the hash; a present file that no longer
      // matches means the modules were not regenerated after retraining.
      const m = new RegExp(`"path": ${JSON.stringify(rel).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},\\s*\\n\\s*"exists": true,\\s*\\n\\s*"bytes": (\\d+),\\s*\\n\\s*"sha256": "([0-9a-f]+)"`).exec(text);
      if (!m) { console.error(`check:examiner — ${rel} is on disk but absent from the committed manifest.`); stale++; continue; }
      if (m[2] !== meta.sha256) {
        console.error(`check:examiner — ${rel} has changed since the data modules were generated.`);
        console.error(`  committed sha256 ${m[2]}, on disk ${meta.sha256}`);
        stale++;
      }
    }
    if (stale) { console.error(`\n${stale} stale source(s). Run: npm run data:examiner`); process.exit(1); }
    console.log(`check:examiner — ok (${sources.size - missing} present and current, ${missing} not in this checkout)`);
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });
  for (const m of modules) {
    await writeFile(path.join(OUT_DIR, m.file), m.body);
    console.log(`  wrote src/data/examiner/generated/${m.file}  (${(m.body.length / 1024).toFixed(1)} KB)`);
  }
  const absent = [...sources.values()].filter((s) => !s.exists);
  if (absent.length) {
    console.log(`\n  ${absent.length} source(s) not in this checkout:`);
    for (const s of absent) console.log(`    ${s.path}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
