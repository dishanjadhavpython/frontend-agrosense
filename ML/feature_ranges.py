"""Record what each model was actually trained on.

Written while chasing a mismatch, and worth keeping now that the mismatch is
gone, because it is what found it.

The crop model's `N` column ran 0–140 while a Maharashtra Soil Health Card
reports available nitrogen at 150–700 kg/ha. Recording the ranges made that
visible; scoring the training table against the government's own critical
limits (N low <280, medium 280–560, high >560) then showed *all 2,200 rows*
falling in the "low" band, within-crop K varying by a standard deviation of ~3
across a 5–205 column, and the per-crop means matching published ICAR
fertilizer doses. Those columns were a fertilizer prescription, not a soil
test, and no unit conversion would ever have reconciled them.

So both models were retrained without N, P and K. Every feature checked here
is now the same quantity in the same unit on both sides — °C, %, pH, mm — and
a warning means an unusual field rather than an incoherent comparison.

Run it after obtaining or retraining the models; `train_crop.py` and
`train_fertilizer.py` write these ranges themselves, so this is only needed for
artifacts trained before they did.

Usage:
    python ML/feature_ranges.py
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "ML" / "models"

#: Same list `train_crop.py` searches, so both agree on which file is "the"
#: crop dataset on a given machine.
CROP_CSVS = [
    ROOT / "ML" / "data" / "Crop_recommendation.csv",
    Path("/Volumes/dishan project/mini project sem 6/final mini project/Crop_recommendation.csv"),
    Path("/Volumes/dishan project/final/Crop_recommendation.csv"),
    Path("/Volumes/dishan project/agrosense old version/Crop_recommendation.csv"),
]

FERTILIZER_CSVS = [
    ROOT / "data set of the project" / "fertilizer data" / "train.csv",
    ROOT / "ML" / "data" / "fertilizer_train.csv",
]

#: Only what the models now take. N/P/K left both feature sets when they turned
#: out to be fertilizer doses and small-scale soil indices rather than anything
#: a Soil Health Card measures — see ML/train_crop.py.
CROP_FEATURES = ["temperature", "humidity", "ph", "rainfall"]
FERTILIZER_FEATURES = ["Temparature", "Humidity", "Moisture"]


def find(candidates: list[Path]) -> Path | None:
    for path in candidates:
        if path.is_file():
            return path
    return None


def ranges_of(frame: pd.DataFrame, columns: list[str]) -> dict[str, list[float]]:
    """Observed min and max per column, skipping any the table does not have."""
    out: dict[str, list[float]] = {}
    for column in columns:
        if column not in frame.columns:
            print(f"  ! {column} not in this table, skipped")
            continue
        series = pd.to_numeric(frame[column], errors="coerce").dropna()
        if series.empty:
            continue
        out[column] = [round(float(series.min()), 4), round(float(series.max()), 4)]
    return out


def patch(metadata_name: str, feature_ranges: dict[str, list[float]]) -> None:
    """Merge into the metadata file rather than rewriting it.

    Everything else in there — the bake-off scores, the class list, the
    training timestamp — is the record of a training run that did happen, and
    this script did not run it.
    """
    path = OUT / metadata_name
    if not path.exists():
        print(f"  ! {metadata_name} does not exist, skipped")
        return
    metadata = json.loads(path.read_text())
    metadata["feature_ranges"] = feature_ranges
    metadata["feature_ranges_note"] = (
        "Observed min/max in the training table. Serving compares the farmer's "
        "inputs against these and reports anything outside; no conversion is "
        "applied. See ML/feature_ranges.py."
    )
    path.write_text(json.dumps(metadata, indent=2))
    print(f"  wrote feature_ranges into {metadata_name}")


def main() -> None:
    crop_csv = find(CROP_CSVS)
    if crop_csv is None:
        print("Crop_recommendation.csv not found; crop ranges not written.")
    else:
        print(f"crop dataset: {crop_csv}")
        frame = pd.read_csv(crop_csv)
        crop_ranges = ranges_of(frame, CROP_FEATURES)
        for name, (low, high) in crop_ranges.items():
            print(f"  {name:<12} {low:>10} .. {high:<10}")
        patch("crop_metadata.json", crop_ranges)

    fertilizer_csv = find(FERTILIZER_CSVS)
    if fertilizer_csv is None:
        print("fertilizer train.csv not found; fertilizer ranges not written.")
        return

    print(f"\nfertilizer dataset: {fertilizer_csv}")
    # 750,000 rows and only three columns are needed, so read only those.
    frame = pd.read_csv(fertilizer_csv, usecols=lambda c: c in FERTILIZER_FEATURES)
    fertilizer_ranges = ranges_of(frame, FERTILIZER_FEATURES)
    for name, (low, high) in fertilizer_ranges.items():
        print(f"  {name:<12} {low:>10} .. {high:<10}")
    patch("fertilizer_metadata.json", fertilizer_ranges)


if __name__ == "__main__":
    main()
