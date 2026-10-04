// GENERATED — do not edit by hand.
// Written by scripts/build-examiner-data.mjs. Re-run `npm run data:examiner`
// after retraining. `npm run check:examiner` fails the build if a source file
// on disk no longer matches the hash recorded here.
//
// Sources:
//   ML/models/crop_metadata.json
//     sha256 9b893e2a752964b0 · 2200 bytes · 2026-08-25
//   ML/models/fertilizer_metadata.json
//     sha256 daad5c23cb51176c · 2432 bytes · 2026-08-25
//   ml engine for Recommendation/artifacts/model_selection.json
//     sha256 01e6e2010495f057 · 1780 bytes · 2026-09-12

import type { Tournament } from "../types";

export const TOURNAMENTS = [
  {
    "id": "crop-model",
    "task": "Which crop suits these four field conditions?",
    "protocol": "5-fold cross-validation over 2,200 rows, 22 crops",
    "metric": "CV accuracy",
    "contenders": [
      {
        "name": "xgboost",
        "score": "0.9600",
        "detail": "± 0.0042 · 0.35 ms per prediction",
        "chosen": false
      },
      {
        "name": "lightgbm",
        "score": "0.9632",
        "detail": "± 0.0066 · 0.28 ms per prediction",
        "chosen": true
      }
    ],
    "chosen": "lightgbm",
    "why": "A third of a point ahead on accuracy and slightly faster to serve. Neither margin is large; the incumbent rule would have kept either.",
    "cost": "Trained WITHOUT N/P/K: those columns are the crop's recommended fertilizer dose, not a soil test (all 2,200 rows sit in the Soil Health Card's 'low' N band; within-crop K varies by sd~3 across a 5-205 column; per-crop means match ICAR doses). Feeding a card's kg/ha reading to them was a category error, not a unit error. Also without the four one-hot soil columns of the older model, which were np.random.randint(0, 4); soil reaches the ranking through soil_crop_suitability.py and nutrients through _need_score.",
    "source": "ML/models/crop_metadata.json"
  },
  {
    "id": "fertiliser-model",
    "task": "Which of seven fertiliser products fits these conditions?",
    "protocol": "5-fold cross-validation over 7,50,000 rows, 7 products",
    "metric": "CV accuracy",
    "contenders": [
      {
        "name": "xgboost",
        "score": "0.1745",
        "detail": "± 0.0003 · 0.34 ms per prediction",
        "chosen": true
      },
      {
        "name": "lightgbm",
        "score": "0.1727",
        "detail": "± 0.0007 · 0.3 ms per prediction",
        "chosen": false
      }
    ],
    "chosen": "xgboost",
    "why": "Both arms land near the 0.1429 a seven-way coin toss would give. The tournament was won, and the winner is still not allowed to choose the bag.",
    "cost": "Kaggle playground-series-s5e6. Labels are synthetic, so a high score means the generator's rule was learned. Trained WITHOUT Nitrogen/Potassium/Phosphorous: those columns run 4-42/0-19/0-42 while a Soil Health Card reads hundreds of kg/ha, so serving was scaling the card ~24 standard deviations out of distribution on every request. The farmer's nutrients now reach the answer only through _need_score, which compares each reading to the range printed on that farmer's own card and is therefore scale-free.",
    "source": "ML/models/fertilizer_metadata.json"
  },
  {
    "id": "engine-ranker",
    "task": "Which model ranks crops for a taluka?",
    "protocol": "forward chaining, 544 queries",
    "metric": "NDCG@5",
    "contenders": [
      {
        "name": "lightgbm",
        "score": "0.8830",
        "detail": "fit 14.5s · serve 0.0016s",
        "chosen": false
      },
      {
        "name": "catboost",
        "score": "0.8860",
        "detail": "fit 78.8s · serve 0.0039s",
        "chosen": true
      },
      {
        "name": "tabpfn",
        "score": null,
        "chosen": false,
        "failed": "TimeoutError: the arm produced nothing within its 6 min budget and was terminated; recorded rather than allowed to hang the tournament"
      }
    ],
    "chosen": "catboost",
    "why": "+0.0038 NDCG@5 over lightgbm, Holm p=0.021, CI excludes zero, latency 0.0039s",
    "source": "ml engine for Recommendation/artifacts/model_selection.json"
  },
  {
    "id": "engine-yield",
    "task": "Which model predicts yield for a crop in a district it has never seen?",
    "protocol": "GroupKFold by district (cold start), 7,035 rows",
    "metric": "within-crop rho",
    "contenders": [
      {
        "name": "lightgbm",
        "score": "0.4180",
        "detail": "80% interval covers 0.715 · pinball 0.3257",
        "chosen": true
      },
      {
        "name": "catboost",
        "score": "0.4690",
        "detail": "80% interval covers 0.620 · pinball 0.3150",
        "chosen": false
      },
      {
        "name": "tabpfn",
        "score": null,
        "chosen": false,
        "failed": "TimeoutError: the arm produced nothing within its 6 min budget and was terminated; recorded rather than allowed to hang the tournament"
      }
    ],
    "chosen": "lightgbm",
    "why": "catboost led by 0.051 rho but its 80% interval covers 0.620 against 0.715; a sharper point estimate is not worth an interval that overstates its confidence, so the incumbent is kept",
    "source": "ml engine for Recommendation/artifacts/model_selection.json"
  }
] as const satisfies readonly Tournament[];

/** CatBoost's measured edge over the incumbent ranker, with its interval. */
export const RANKER_DELTA = {
  "delta": 0.0038,
  "lo": 0.0009,
  "hi": 0.007,
  "p": 0.021,
  "districts": 34,
  "queries": 544
};

export const CROP_FEATURES = [
  "temperature",
  "humidity",
  "ph",
  "rainfall"
];
export const FERTILISER_RANDOM_BASELINE = 0.1429;
export const FERTILISER_HOLDOUT = {
  "accuracy": 0.1745,
  "macroF1": 0.1676,
  "top3": 0.4867
};
