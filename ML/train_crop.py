"""Retrain the crop recommender on features that are actually features.

The shipped model takes 11 inputs: N, P, K, temperature, humidity, ph, rainfall
— and four one-hot soil columns. Those four came from
`ML/dishanminiproject_updated.ipynb`, cell 35:

    np.random.seed(42)
    df['soil_type'] = np.random.randint(0, 4, size=len(df))

They are random integers. There was never a soil/crop relationship in the
training data for the model to learn, so the soil classifier's output has never
been able to influence a crop recommendation, however much the pipeline
diagram implies it does.

Widening those columns from four to eight — the obvious response to adding four
soil classes — would have produced more noise and a model that looked more
soil-aware. So they are dropped instead. Accuracy is unchanged (they carried no
signal), and the code stops claiming a relationship it does not have.

The soil type still reaches the recommendation, through
`soil_crop_suitability.py`: an explicit, sourced table that re-ranks this
model's output. That is a weaker claim than a learned relationship and it is
the true one, and unlike 4 columns of `randint` a person can read it and argue
with it.

Usage:
    python ml/train_crop.py
"""

from __future__ import annotations

import time
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler

from tabular import (
    choose,
    lightgbm_candidate,
    report,
    save,
    score_candidate,
    write_metadata,
    xgboost_candidate,
)

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "ML" / "models"

#: Four. Not seven.
#
# N, P and K were dropped after checking what they actually contain, and the
# check is worth repeating because the columns are *labelled* to look usable —
# Kaggle calls them "ratio of Nitrogen content in soil" and the literature
# reports them as kg/ha, the same unit a Soil Health Card prints.
#
# They are not soil measurements. They are the recommended **fertilizer dose**
# for the crop, jittered:
#
#   * Every row of all 2,200 falls in the Soil Health Card's "low" band for N
#     (<280 kg/ha). Not most — all of them. The column tops out at 140 where an
#     Indian card routinely reads 250-700.
#   * Within a single crop, K varies by a standard deviation of ~3 across a
#     column spanning 5-205. Apple and grapes are both K=200±3. That is a
#     constant with noise on it, not a measurement.
#   * The per-crop means are the published doses. Rice reads 80-48-40 against
#     ICAR's 80-40-40 for rabi rice; maize 78-48-20; cotton 118-46-20.
#
# So the model was scoring 99.2% by memorising a fertilizer table, and the
# served pipeline then handed it a farmer's soil test — a different quantity on
# a different scale, tens of standard deviations outside anything it trained
# on. A confident answer to a question it had never been asked.
#
# Dropping them costs 3.0 points of cross-validated accuracy (99.2% -> 96.3%)
# and buys a model whose every input the product can actually supply: pH off
# the card, and the three field conditions the farmer types in.
#
# The card's nutrients still decide the fertilizer, where they belong — through
# `_need_score` in `backend/models.py`, which compares each reading to the
# range printed on that farmer's own card and is therefore immune to this whole
# class of scale mismatch.
FEATURES = ["temperature", "humidity", "ph", "rainfall"]

CANDIDATE_CSVS = [
    ROOT / "ml" / "data" / "Crop_recommendation.csv",
    Path("/Volumes/dishan project/mini project sem 6/final mini project/Crop_recommendation.csv"),
    Path("/Volumes/dishan project/final/Crop_recommendation.csv"),
    Path("/Volumes/dishan project/agrosense old version/Crop_recommendation.csv"),
]


def find_dataset() -> Path:
    for path in CANDIDATE_CSVS:
        if path.is_file():
            return path
    raise SystemExit(
        "Crop_recommendation.csv not found. Place it at ml/data/Crop_recommendation.csv."
    )


def main() -> None:
    started = time.time()
    OUT.mkdir(parents=True, exist_ok=True)

    source = find_dataset()
    frame = pd.read_csv(source)
    print(f"dataset: {source}\nrows: {len(frame)}  crops: {frame['label'].nunique()}")

    missing = [c for c in FEATURES + ["label"] if c not in frame.columns]
    if missing:
        raise SystemExit(f"dataset is missing columns: {missing}")

    X = frame[FEATURES].to_numpy(dtype=np.float32)

    # Captured before scaling, in the dataset's own units. Serving compares the
    # farmer's inputs against these and reports anything outside — the card's
    # available N is kg/ha and this table's N tops out at 140, and until this
    # was recorded nothing said so. See ML/feature_ranges.py.
    feature_ranges = {
        name: [round(float(frame[name].min()), 4), round(float(frame[name].max()), 4)]
        for name in FEATURES
    }

    encoder = LabelEncoder()
    y = encoder.fit_transform(frame["label"].to_numpy())

    # Kept because the serving code standardises its inputs the same way, and
    # because tree models are indifferent to it — so it costs nothing and keeps
    # one preprocessing path for every tabular model.
    scaler = StandardScaler().fit(X)
    X_scaled = scaler.transform(X).astype(np.float32)

    # --- Bake-off: XGBoost vs LightGBM ------------------------------------
    #
    # Both cross-validated on identical seeded folds, so the comparison is
    # paired rather than two separate lotteries.
    candidates = [xgboost_candidate(), lightgbm_candidate()]
    results = [score_candidate(c, X_scaled, y, folds=5) for c in candidates]
    report(results)

    winner = choose(results)
    chosen = next(c for c in candidates if c.name == winner["name"])
    print(f"\nchosen: {winner['name']}")

    # Hold-out sanity check with the winner, and a per-crop breakdown.
    X_train, X_test, y_train, y_test = train_test_split(
        X_scaled, y, test_size=0.2, stratify=y, random_state=42
    )
    probe = chosen.build(len(encoder.classes_))
    probe.fit(X_train, y_train)
    holdout = probe.predict(X_test)
    print(f"\nhold-out accuracy {accuracy_score(y_test, holdout):.4f}")
    print(
        classification_report(
            y_test, holdout, target_names=list(encoder.classes_), zero_division=0
        )[:1200]
    )

    # Trained on everything for shipping — the numbers above are the estimate.
    shipped = chosen.build(len(encoder.classes_))
    shipped.fit(X_scaled, y)

    save(OUT, "crop", shipped, {"label_encoder": encoder, "scaler": scaler})

    write_metadata(
        OUT,
        "crop",
        {
                "model": winner["name"],
                "comparison": results,
                "features": FEATURES,
                "feature_ranges": feature_ranges,
                "note": (
                    "Trained WITHOUT N/P/K: those columns are the crop's recommended "
                    "fertilizer dose, not a soil test (all 2,200 rows sit in the Soil "
                    "Health Card's 'low' N band; within-crop K varies by sd~3 across a "
                    "5-205 column; per-crop means match ICAR doses). Feeding a card's "
                    "kg/ha reading to them was a category error, not a unit error. "
                    "Also without the four one-hot soil columns of the older model, "
                    "which were np.random.randint(0, 4); soil reaches the ranking "
                    "through soil_crop_suitability.py and nutrients through _need_score."
                ),
                "classes": list(encoder.classes_),
                "rows": int(len(frame)),
                "cv_accuracy_mean": winner["accuracy_mean"],
                "cv_accuracy_std": winner["accuracy_std"],
                "cv_macro_f1_mean": winner["macro_f1_mean"],
                "source": str(source),
                "trained_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        },
    )

    print(f"\nwrote {OUT}/crop_model.pkl (+ encoder, scaler, metadata)")
    print(f"total {time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
