"""Train the fertilizer recommender.

Until the dataset arrived this model was the one piece that could not be
retrained — the artifact was reused from an earlier project and its training
CSV was not on the machine. `data set of the project/fertilizer data/train.csv`
is that CSV: 750,000 rows, seven products, the Kaggle playground-series-s5e6
schema the notebook was built against.

The feature set is kept exactly as the served path expects it, because
`backend/models.py::predict_fertilizers` reconstructs these ten columns by hand
for every request:

    Temparature, Humidity, Moisture      (scaled)
    Soil Type, Crop Type                 (integer codes)
    Nitrogen, Potassium, Phosphorous     (scaled)
    temp_humidity_interaction            (scaled temp x scaled humidity)
    nitrogen_phosphorous_interaction     (scaled N x scaled P)

"Temparature" is misspelled in the source data. It is preserved rather than
corrected: the column name is part of the contract between this script, the
saved feature list and the serving code, and quietly renaming it would break
the model at inference in a way that looks like a bad prediction rather than a
bug.

A note on what the accuracy means. Seven roughly balanced classes over
temperature, humidity, moisture, soil, crop and NPK — this is a Kaggle
playground set, and its labels are synthetic. A good score here says the model
learned the generator's rule, not that the bag it names is the right thing to
buy. That is why `predict_fertilizers` overrides the ranking with a `hold`
whenever the farmer's own card already reads high for the nutrient a product
sells: the card is measurement, this is a pattern.

Usage:
    python ml/train_fertilizer.py
"""

from __future__ import annotations

import argparse
import json
import pickle
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, classification_report, f1_score, top_k_accuracy_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler

from tabular import choose, lightgbm_candidate, report, score_candidate, xgboost_candidate

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "ML" / "models"

CANDIDATE_CSVS = [
    ROOT / "data set of the project" / "fertilizer data" / "train.csv",
    ROOT / "ml" / "data" / "fertilizer_train.csv",
]

NUMERIC = ["Temparature", "Humidity", "Moisture", "Nitrogen", "Potassium", "Phosphorous"]
CATEGORICAL = ["Soil Type", "Crop Type"]

#: The exact order the serving code builds. Saved alongside the model so the
#: two cannot drift.
FEATURE_COLUMNS = [
    "Temparature",
    "Humidity",
    "Moisture",
    "Soil Type",
    "Crop Type",
    "Nitrogen",
    "Potassium",
    "Phosphorous",
    "temp_humidity_interaction",
    "nitrogen_phosphorous_interaction",
]


def find_dataset() -> Path:
    for path in CANDIDATE_CSVS:
        if path.is_file():
            return path
    raise SystemExit(
        "fertilizer train.csv not found. Expected at "
        f"{CANDIDATE_CSVS[0]}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rows", type=int, default=0, help="subsample for a quick run")
    parser.add_argument("--estimators", type=int, default=600)
    args = parser.parse_args()

    started = time.time()
    OUT.mkdir(parents=True, exist_ok=True)

    source = find_dataset()
    frame = pd.read_csv(source)
    if args.rows and args.rows < len(frame):
        frame = frame.sample(args.rows, random_state=42).reset_index(drop=True)
    print(f"dataset: {source}\nrows: {len(frame):,}")

    missing = [c for c in NUMERIC + CATEGORICAL + ["Fertilizer Name"] if c not in frame.columns]
    if missing:
        raise SystemExit(f"dataset is missing columns: {missing}")

    # Categorical codes. `categorical_encoders.pkl` holds these so the serving
    # code can turn "Clayey" into the same integer this saw.
    encoders: dict[str, LabelEncoder] = {}
    for column in CATEGORICAL:
        encoder = LabelEncoder()
        frame[column] = encoder.fit_transform(frame[column])
        encoders[column] = encoder
        print(f"  {column}: {list(encoder.classes_)}")

    scaler = StandardScaler()
    frame[NUMERIC] = scaler.fit_transform(frame[NUMERIC])

    frame["temp_humidity_interaction"] = frame["Temparature"] * frame["Humidity"]
    frame["nitrogen_phosphorous_interaction"] = frame["Nitrogen"] * frame["Phosphorous"]

    target_encoder = LabelEncoder()
    y = target_encoder.fit_transform(frame["Fertilizer Name"])
    X = frame[FEATURE_COLUMNS]
    print(f"  fertilizers: {list(target_encoder.classes_)}")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
    )

    # --- Bake-off: XGBoost vs LightGBM ------------------------------------
    #
    # Three folds rather than five: at 750,000 rows the fold-to-fold variance
    # is in the fourth decimal, and each fit is minutes. Five folds would buy
    # precision on a number that is about to be shown to be near-random anyway.
    depth = dict(max_depth=8, learning_rate=0.06, n_estimators=args.estimators)
    candidates = [
        xgboost_candidate(min_child_weight=4, reg_lambda=1.5, colsample_bytree=0.8, **depth),
        lightgbm_candidate(num_leaves=96, min_child_samples=40, reg_lambda=1.5,
                           colsample_bytree=0.8, **depth),
    ]
    Xv = X.to_numpy(dtype=np.float32)
    results = [score_candidate(c, Xv, y, folds=3, top_k=3) for c in candidates]
    report(results, top_k=3)

    winner = choose(results)
    chosen = next(c for c in candidates if c.name == winner["name"])
    print(f"\nchosen: {winner['name']}")

    model = chosen.build(len(target_encoder.classes_))
    model.fit(X_train, y_train)

    probabilities = model.predict_proba(X_test)
    predictions = probabilities.argmax(axis=1)

    accuracy = accuracy_score(y_test, predictions)
    macro = f1_score(y_test, predictions, average="macro", zero_division=0)
    top3 = top_k_accuracy_score(y_test, probabilities, k=3, labels=np.arange(len(target_encoder.classes_)))

    print(f"\nhold-out accuracy       {accuracy:.4f}   (random baseline 0.1429)")
    print(f"hold-out macro-F1       {macro:.4f}")
    print(f"hold-out top-3 accuracy {top3:.4f}   (random baseline 0.4286)")
    print()
    print(classification_report(y_test, predictions, target_names=list(target_encoder.classes_), zero_division=0))

    # Prefixed names, so every artifact in ML/models says which model it
    # belongs to. The old flat `scaler.pkl` / `feature_columns.json` were
    # ambiguous the moment a second model needed a scaler.
    with (OUT / "fertilizer_model.pkl").open("wb") as fh:
        pickle.dump(model, fh)
    with (OUT / "fertilizer_categorical_encoders.pkl").open("wb") as fh:
        pickle.dump(encoders, fh)
    with (OUT / "fertilizer_scaler.pkl").open("wb") as fh:
        pickle.dump(scaler, fh)
    with (OUT / "fertilizer_target_encoder.pkl").open("wb") as fh:
        pickle.dump(target_encoder, fh)
    (OUT / "fertilizer_feature_columns.json").write_text(json.dumps(FEATURE_COLUMNS, indent=2))

    (OUT / "fertilizer_metadata.json").write_text(
        json.dumps(
            {
                "features": FEATURE_COLUMNS,
                "numeric_scaled": NUMERIC,
                "categorical": {k: list(map(str, v.classes_)) for k, v in encoders.items()},
                "classes": list(target_encoder.classes_),
                "rows": int(len(frame)),
                "holdout_accuracy": float(accuracy),
                "holdout_macro_f1": float(macro),
                "holdout_top3_accuracy": float(top3),
                "model": winner["name"],
                "comparison": results,
                "source": str(source),
                "note": (
                    "Kaggle playground-series-s5e6. Labels are synthetic, so a high "
                    "score means the generator's rule was learned. The served path "
                    "overrides the ranking with a 'hold' when the farmer's card "
                    "already reads high for the nutrient a product sells."
                ),
                "trained_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            },
            indent=2,
        )
    )

    print(f"wrote {OUT}/fertilizer_model.pkl (+ encoders, scaler, metadata)")
    print(f"total {time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
