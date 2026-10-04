// GENERATED — do not edit by hand.
// Written by scripts/build-examiner-data.mjs. Re-run `npm run data:examiner`
// after retraining. `npm run check:examiner` fails the build if a source file
// on disk no longer matches the hash recorded here.
//
// Sources:
//   ml engine for Recommendation/artifacts/scorecard_latest.json
//     sha256 c18974e4aedabf36 · 1701 bytes · 2026-09-12
//   ml engine for Recommendation/reports/scorecard_history.csv
//     sha256 e4dfaf00253b799a · 777 bytes · 2026-09-12
//   ml engine for Recommendation/reports/scorecard.md
//     sha256 d3c1adc1d4853678 · 9682 bytes · 2026-09-12
//   ml engine for Recommendation/reports/benchmark_results.md
//     sha256 e32409f6638e4e29 · 9526 bytes · 2026-08-26
//   ml engine for Recommendation/reports/gate_validation.md
//     sha256 c717e27599ff9efa · 4213 bytes · 2026-08-28
//   ml engine for Recommendation/reports/experiments.md
//     sha256 150fb167ab0e9d28 · 6622 bytes · 2026-08-26
//   ml engine for Recommendation/artifacts/s3_regimes.csv
//     sha256 465e9df96ff1701c · 484 bytes · 2026-08-28

import type { ReportTable, Scorecard } from "../types";

export const SCORECARD = {
  "label": "Phase 2-3: 29 weather years, as-of normals, year-matched yield weather",
  "at": "2026-09-12 12:23",
  "composite": 7.97,
  "uncapped": 7.97,
  "measuredWeight": 0.9,
  "gates": [
    {
      "name": "all tests green",
      "pass": true,
      "detail": "235 passed, 37 warnings in 563.26s (0:09:23)"
    },
    {
      "name": "fertiliser table reproduced exactly",
      "pass": true,
      "detail": "1000/1000 sampled keys reproduce the table exactly"
    },
    {
      "name": "irrigation never adds a veto",
      "pass": true,
      "detail": "0 (taluka, season, crop) cells are vetoed only when irrigated"
    },
    {
      "name": "photo never removes a veto",
      "pass": true,
      "detail": "vacuous: the engine takes no soil photograph yet"
    },
    {
      "name": "no-leakage tests pass",
      "pass": true,
      "detail": "12 passed in 46.37s"
    },
    {
      "name": "cache key covers every input",
      "pass": true,
      "detail": "89/89 inputs hashed"
    }
  ],
  "subScores": [
    {
      "label": "Forward-chaining NDCG@5 margin over popularity",
      "measured": 0.112,
      "floor": 0.05,
      "target": 0.16,
      "weight": 1.5,
      "score": 5.64
    },
    {
      "label": "Grouped + temporal NDCG@5 margin over popularity",
      "measured": 0.063,
      "floor": 0,
      "target": 0.09,
      "weight": 1.5,
      "score": 7
    },
    {
      "label": "False vetoes on >5% of district area",
      "measured": 0.0084,
      "floor": 0.03,
      "target": 0.005,
      "weight": 1,
      "score": 8.64
    },
    {
      "label": "Metamorphic relations (M1-M3, M5, M6) pass rate",
      "measured": 1,
      "floor": 0.9,
      "target": 1,
      "weight": 1.5,
      "score": 10
    },
    {
      "label": "Fertiliser season/irrigation context-match (M4)",
      "measured": 1,
      "floor": 0.8,
      "target": 1,
      "weight": 1,
      "score": 10
    },
    {
      "label": "Cold-start within-crop yield rho",
      "measured": 0.432,
      "floor": 0.3,
      "target": 0.55,
      "weight": 0.75,
      "score": 5.28
    },
    {
      "label": "Served-regime 90% interval coverage error",
      "measured": 0.0006,
      "floor": 0.1,
      "target": 0.02,
      "weight": 0.75,
      "score": 10
    },
    {
      "label": "Soil photo macro-F1 on the owner's dataset (grouped CV)",
      "measured": null,
      "floor": 0.6,
      "target": 0.85,
      "weight": 0.5,
      "score": null
    },
    {
      "label": "Soil photo calibration (ECE) + non-soil rejection",
      "measured": null,
      "floor": 0,
      "target": 1,
      "weight": 0.5,
      "score": null
    },
    {
      "label": "Inputs that measurably change the answer (of 15)",
      "measured": 0.9333,
      "floor": 0,
      "target": 1,
      "weight": 0.5,
      "score": 9.33
    },
    {
      "label": "Explanations, provenance and Maharashtra crop count",
      "measured": 0.6,
      "floor": 0,
      "target": 1,
      "weight": 0.5,
      "score": 6
    }
  ],
  "history": [
    {
      "at": "2026-09-12 10:26",
      "label": "Phase 0 baseline",
      "composite": 6,
      "gates": "4/6"
    },
    {
      "at": "2026-09-12 11:08",
      "label": "Phase 1 correctness fixes",
      "composite": 7.75,
      "gates": "6/6"
    },
    {
      "at": "2026-09-12 11:26",
      "label": "Phase 1b: duplicate columns dropped, served ranker bagged + monotone",
      "composite": 7.85,
      "gates": "6/6"
    },
    {
      "at": "2026-09-12 12:23",
      "label": "Phase 2-3: 29 weather years, as-of normals, year-matched yield weather",
      "composite": 7.97,
      "gates": "6/6"
    }
  ],
  "source": "ml engine for Recommendation/artifacts/scorecard_latest.json"
} as const satisfies Scorecard;

/** Pipe tables lifted verbatim from the engine's own reports. */
export const ENGINE_TABLES = [
  {
    "heading": "The headline number is a mirage",
    "source": "ml engine for Recommendation/reports/benchmark_results.md",
    "head": [
      "Target",
      "R2",
      "Verdict"
    ],
    "rows": [
      [
        "Raw yield (t/ha), soil + weather features",
        0.822,
        "the mirage"
      ],
      [
        "Raw yield (t/ha), crop + season identity ONLY",
        0.787,
        "almost the same — the model learned crop scale, not agronomy"
      ],
      [
        "Within-crop z-scored yield, soil + weather",
        0.191,
        "the honest signal"
      ]
    ]
  },
  {
    "heading": "Why GroupKFold by district is not optional",
    "source": "ml engine for Recommendation/reports/benchmark_results.md",
    "head": [
      "Protocol",
      "R2"
    ],
    "rows": [
      [
        "Random KFold (LEAKS — districts split across folds)",
        0.325
      ],
      [
        "GroupKFold by district (6 folds)",
        0.191
      ],
      [
        "Leave-one-district-out (34 folds)",
        0.163
      ],
      [
        "Spatial block CV (KMeans on centroids)",
        0.053
      ]
    ]
  },
  {
    "heading": "§7.1 Feature block ablation",
    "source": "ml engine for Recommendation/reports/benchmark_results.md",
    "head": [
      "Feature set",
      "R2",
      "Delta",
      "Per-crop rho",
      "n feat"
    ],
    "rows": [
      [
        "Null model (predict the mean)",
        0,
        "nan",
        "nan",
        0
      ],
      [
        "Crop + season identity only",
        -0.012,
        -0.012,
        -0.16,
        2
      ],
      [
        "+ Soil Health Card (12 components)",
        0.107,
        0.119,
        0.285,
        49
      ],
      [
        "+ Soil physical",
        0.161,
        0.054,
        0.376,
        66
      ],
      [
        "+ Agro-climatic (engineered)",
        0.182,
        0.021,
        0.4,
        147
      ],
      [
        "+ Agronomic interactions",
        0.191,
        0.009,
        0.426,
        310
      ]
    ]
  },
  {
    "heading": "§7.1 Blocks the n=34 constraint rejects",
    "source": "ml engine for Recommendation/reports/benchmark_results.md",
    "head": [
      "Feature set",
      "R2",
      "n feat"
    ],
    "rows": [
      [
        "Best set (blocks A-D)",
        0.191,
        310
      ],
      [
        "+ Spatial kNN smoothing",
        0.174,
        326
      ],
      [
        "+ Contextual z-scores",
        0.188,
        324
      ]
    ]
  },
  {
    "heading": "§7.3 Ranking benchmark",
    "source": "ml engine for Recommendation/reports/benchmark_results.md",
    "head": [
      "Method",
      "ndcg@5",
      "ndcg@3",
      "p@3",
      "recall@5"
    ],
    "rows": [
      [
        "Random ranking",
        0.153,
        0.125,
        0.112,
        0.186
      ],
      [
        "Yield-regression framing",
        0.73,
        0.68,
        0.459,
        0.761
      ],
      [
        "Area-share regression framing",
        0.798,
        0.8,
        0.552,
        0.783
      ],
      [
        "S2 agronomic rules only (no labels)",
        0.553,
        0.526,
        0.377,
        0.592
      ],
      [
        "LambdaMART, crop identity only",
        0.412,
        0.34,
        0.245,
        0.548
      ],
      [
        "Popularity prior, out-of-fold  <- the bar",
        0.74,
        0.712,
        0.528,
        0.804
      ],
      [
        "LambdaMART + engineered features",
        0.864,
        0.855,
        0.61,
        0.865
      ],
      [
        "Full engine (early fusion + blend)  <- as served",
        0.883,
        0.873,
        0.622,
        0.879
      ]
    ]
  },
  {
    "heading": "§5.4 Conformal calibration",
    "source": "ml engine for Recommendation/reports/benchmark_results.md",
    "head": [
      "Interval",
      "coverage",
      "mean_width",
      "n"
    ],
    "rows": [
      [
        "Raw quantile model, nominal 80%",
        0.728,
        1.851,
        7035
      ],
      [
        "Split-conformal, nominal 90%",
        0.9,
        2.742,
        7035
      ],
      [
        "Split-conformal, nominal 80%",
        0.8,
        2.118,
        7035
      ]
    ]
  },
  {
    "heading": "Does the gate agree with practice?",
    "source": "ml engine for Recommendation/reports/gate_validation.md",
    "head": [
      "suitability_class",
      "cells",
      "planted_rate",
      "mean_area_share",
      "mean_area_share_if_planted"
    ],
    "rows": [
      [
        "S1",
        2192,
        0.786,
        0.14,
        0.178
      ],
      [
        "S2",
        1848,
        0.667,
        0.125,
        0.188
      ],
      [
        "S3",
        1392,
        0.598,
        0.075,
        0.125
      ],
      [
        "N",
        15240,
        0.107,
        0.021,
        0.192
      ]
    ]
  },
  {
    "heading": "Ranking as served — forward chaining",
    "source": "ml engine for Recommendation/reports/scorecard.md",
    "head": [
      "Method",
      "ndcg@5",
      "ndcg@3",
      "p@3",
      "recall@5"
    ],
    "rows": [
      [
        "Popularity prior (same protocol)",
        0.717,
        0.705,
        0.547,
        0.729
      ],
      [
        "District persistence (last year's share)",
        0.819,
        0.832,
        0.644,
        0.785
      ],
      [
        "S2 rules only",
        0.589,
        0.557,
        0.42,
        0.611
      ],
      [
        "Ranker alone (learned score)",
        0.844,
        0.856,
        0.653,
        0.811
      ],
      [
        "Engine as served (blend + veto)",
        0.829,
        0.844,
        0.642,
        0.792
      ]
    ]
  },
  {
    "heading": "Ranking as served — grouped + temporal",
    "source": "ml engine for Recommendation/reports/scorecard.md",
    "head": [
      "Method",
      "ndcg@5",
      "ndcg@3",
      "p@3",
      "recall@5"
    ],
    "rows": [
      [
        "Popularity prior (same protocol)",
        0.71,
        0.708,
        0.574,
        0.701
      ],
      [
        "S2 rules only",
        0.601,
        0.566,
        0.44,
        0.607
      ],
      [
        "Ranker alone (learned score)",
        0.79,
        0.8,
        0.63,
        0.753
      ],
      [
        "Engine as served (blend + veto)",
        0.773,
        0.781,
        0.608,
        0.733
      ]
    ]
  },
  {
    "heading": "Engines compared",
    "source": "ml engine for Recommendation/reports/experiments.md",
    "head": [
      "Engine",
      "NDCG@5",
      "NDCG@3",
      "P@3",
      "Recall@5"
    ],
    "rows": [
      [
        "Popularity prior *(the bar the plan says you must beat)*",
        0.79,
        0.748,
        0.588,
        0.785
      ],
      [
        "OLD engine, as first shipped",
        0.777,
        0.76,
        0.598,
        0.742
      ],
      [
        "NEW engine — α fix + capacity",
        0.841,
        0.826,
        0.65,
        0.795
      ],
      [
        "NEW engine + early fusion",
        0.876,
        0.865,
        0.684,
        0.835
      ]
    ]
  },
  {
    "heading": "Honest negatives",
    "source": "ml engine for Recommendation/reports/experiments.md",
    "head": [
      "Change",
      "Δ NDCG@5",
      "p",
      "Verdict"
    ],
    "rows": [
      [
        "Within-district dispersion features (54 cols)",
        "+0.003",
        0.43,
        "not significant"
      ],
      [
        "Taluka-level suitability fractions (8 cols)",
        "+0.001",
        0.68,
        "not significant"
      ],
      [
        "Both together",
        "−0.002",
        0.57,
        "not significant"
      ],
      [
        "Training label: magnitude-weighted grades",
        "−0.011",
        0.11,
        "not significant"
      ],
      [
        "Training label: 8 grades instead of 5",
        "−0.013",
        0.13,
        "not significant"
      ],
      [
        "Training label: binary planted/not",
        "−0.095",
        "< 10⁻⁴",
        "significantly worse"
      ],
      [
        "Training label: log-magnitude grades",
        "+0.001",
        0.66,
        "not significant"
      ],
      [
        "SHC sample weighting on the ranker",
        "+0.001",
        "—",
        "negligible"
      ]
    ]
  }
] as const satisfies readonly ReportTable[];

export const YIELD_REGIMES = [
  {
    "regime": "cold start (new district, no history)",
    "n": 7035,
    "n_features": 310,
    "R2": 0.191,
    "within_crop_rho": 0.426,
    "note": "GroupKFold by district — the honest number for an unseen place"
  },
  {
    "regime": "warm start (known district, next year)",
    "n": 3807,
    "n_features": 320,
    "R2": 0.283,
    "within_crop_rho": 0.501,
    "note": "forward chaining — the honest number for a place with history"
  },
  {
    "regime": "upper bound (do not report as headline)",
    "n": 7035,
    "n_features": 320,
    "R2": 0.306,
    "within_crop_rho": 0.492,
    "note": "GroupKFold with lags: a held-out district's history comes from its own held-out rows, so this overstates the cold-start case"
  }
];
