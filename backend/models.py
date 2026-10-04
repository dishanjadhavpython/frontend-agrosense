from __future__ import annotations

import json
import pickle
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np

# Import order here is load-bearing, not stylistic.
#
# LightGBM and torch each bring their own OpenMP runtime. If torch loads first
# and LightGBM initialises afterwards, the process segfaults the first time one
# request touches the soil classifier and the crop model together — SIGSEGV,
# no traceback, the whole uvicorn worker gone. Importing LightGBM first makes
# it initialise OpenMP before torch's copy is in the process, and both then
# work.
#
# `config` pins OMP to a single thread, which was enough while the crop model
# was XGBoost and is still necessary; it is not sufficient now that the model
# selection bake-off picked LightGBM. Both are needed.
#
# Kept in this module rather than `config` on purpose: this is the only module
# that loads both libraries, so this is the only place the ordering matters,
# and importing LightGBM into every process that merely reads a PDF would be a
# real cost for no reason.
import lightgbm as _lightgbm_first  # noqa: F401  (imported for its side effect)

from .soil_crop_suitability import adjust as adjust_for_soil
from .soil_crop_suitability import describe as describe_soil

"""
The three models, served.

Descended from `_unwired/prediction.py`, with the parts that could not run here
removed: no S3 model downloads, no DynamoDB, no boto3. Artifacts load from
`ML/models/`, written by the training scripts in `ml/`.

Three models, and they are not equally trustworthy — the code says so where it
matters rather than presenting one confidence number for all of them:

  * **Soil** — EfficientNet-B0 over 8 classes, retrained here. Its per-class
    accuracy on the rare soils rests on ~28 real photographs each, so the
    response carries the runner-up and a calibrated confidence rather than a
    bare answer.
  * **Crop** — XGBoost over the 7 real card/weather features. Retrained
    without the 4 random one-hot columns the old model carried.
  * **Fertilizer** — retrained on 750,000 real rows, and *still* only 19.7%
    accurate against a 14.3% random baseline. That is the dataset, not the
    training: the previously shipped model manages 18.8% on the same split.
    So it no longer chooses the recommendation — the card's measured nutrient
    deficits do, and the model only breaks ties. See `_need_score`.

Loading is lazy and cached: torch plus three pickles is several hundred MB of
process memory, and a deployment that only ever reads Soil Health Cards should
not pay for it.
"""

#: Trained artifacts live beside the notebooks and training scripts that
#: produce them, not inside the service that consumes them — one place to
#: look after a training run, and `ml/` is where the run happened.
MODELS_DIR = Path(__file__).resolve().parent.parent / "ML" / "models"

# --- Fertilizer model vocabulary ------------------------------------------
#
# The fertilizer dataset has its own five soil categories, which are textural
# (how the soil behaves) rather than pedological (how it formed). The image
# classifier's eight are the latter. This maps one to the other.
FERTILIZER_SOIL_CODE_MAP = {"black": 0, "clayey": 1, "loamy": 2, "red": 3, "sandy": 4}

#: Each new entry is a judgement, so each carries its reason.
SOIL_TO_FERTILIZER_SOIL = {
    "alluvial": "loamy",   # deep, balanced texture, good drainage
    "black": "black",      # exact match — vertisol
    "clay": "clayey",      # exact match
    "red": "red",          # exact match
    # --- added with the four new classes -------------------------------
    "laterite": "red",     # leached, iron-rich, free draining: behaves as red
    "yellow": "red",       # weathered sesquioxide soil, close sibling of red
    "peat": "clayey",      # waterlogged and moisture-retentive; clayey is the
                           # nearest behaviour in a vocabulary with no organic
                           # category. Imperfect, and flagged as such.
    "cinder": "sandy",     # volcanic scoria: coarse, extremely free draining
}

FERTILIZER_CROP_CODE_MAP = {
    "barley": 0, "cotton": 1, "ground nuts": 2, "maize": 3, "millets": 4,
    "oil seeds": 5, "paddy": 6, "pulses": 7, "sugarcane": 8, "tobacco": 9, "wheat": 10,
}

#: The crop model speaks 22 crops; the fertilizer model knows 11 categories.
CROP_TO_FERTILIZER_CROP = {
    "rice": "paddy", "maize": "maize", "cotton": "cotton", "jute": "millets",
    "coconut": "oil seeds", "papaya": "millets", "orange": "millets",
    "apple": "millets", "muskmelon": "millets", "watermelon": "millets",
    "grapes": "millets", "mango": "millets", "banana": "millets",
    "pomegranate": "millets", "lentil": "pulses", "blackgram": "pulses",
    "mungbean": "pulses", "mothbeans": "pulses", "pigeonpeas": "pulses",
    "kidneybeans": "pulses", "chickpea": "pulses", "coffee": "oil seeds",
}

#: What the crop model was trained on, in order.
#
# N, P and K are absent, and their absence is the fix for the worst bug this
# pipeline had. Those columns in `Crop_recommendation.csv` are the crop's
# recommended **fertilizer dose**, not a soil test — every one of its 2,200
# rows sits in the Soil Health Card's "low" N band, within-crop K varies by a
# standard deviation of ~3 across a 5-205 column, and the per-crop means are
# the published ICAR doses (rice 80-48-40 against a recommended 80-40-40).
#
# So handing this model a farmer's card reading was never a unit conversion
# waiting to be found. It was asking a fertilizer table what the soil contained.
# See `ML/train_crop.py` for the full check.
#
# The card still reaches the crop ranking — through `ph`, which is a real soil
# measurement on both sides, and through the soil photograph via
# `soil_crop_suitability`. Its nutrients decide the fertilizer, in `_need_score`.
CROP_FEATURES = ["temperature", "humidity", "ph", "rainfall"]


class ModelsUnavailable(RuntimeError):
    """An artifact is missing. The API turns this into a 503 rather than a 500:
    it is a deployment state, not a bug in the request."""


class MissingInput(ValueError):
    """A value the models need was not supplied, and nothing here will invent one.

    Every default this class replaced was a number somebody would have farmed
    against: `temperature=26.0`, `humidity=68.0`, `moisture=34.0`, `soil_key`
    falling through to `"loamy"`. They were plausible, which is what made them
    dangerous — a farmer had no way to tell a recommendation built on their
    field from one built on an average of nowhere.

    The API turns this into a 422 naming the field, so the answer is a question
    rather than a guess.
    """

    def __init__(self, field: str) -> None:
        self.field = field
        super().__init__(f"missing required input: {field}")


def _require(readings: dict[str, float], field: str) -> float:
    """Read one input, or refuse. There is deliberately no `default` parameter."""
    value = readings.get(field)
    if value is None:
        raise MissingInput(field)
    return float(value)


@dataclass
class SoilPrediction:
    key: str
    confidence: float
    alternatives: list[dict[str, Any]]
    note: str
    #: Every class with its calibrated probability, not just the ranked few.
    #: The engine's soil fusion weighs the whole distribution against the
    #: taluka's soil survey (`src/rules/soil_fusion.py`), so a truncated
    #: top-three is not enough to hand it — a 0.45/0.44 split and a 0.45/0.05
    #: one mean very different things and look identical after truncation.
    probabilities: dict[str, float] | None = None


# --------------------------------------------------------------------------
# Loading
# --------------------------------------------------------------------------


def _read_pickle(name: str):
    path = MODELS_DIR / name
    if not path.exists():
        raise ModelsUnavailable(f"missing model artifact: {path.name}")
    with path.open("rb") as handle:
        return pickle.load(handle)


def _read_json(name: str):
    path = MODELS_DIR / name
    if not path.exists():
        raise ModelsUnavailable(f"missing model artifact: {path.name}")
    return json.loads(path.read_text())


def _build_backbone(architecture: str, num_classes: int):
    """Rebuild the architecture the bake-off chose.

    `ML/train_soil.py` compares ResNet18 and EfficientNet-B0 and ships whichever
    wins, so the service cannot assume either. The name is read from
    `soil_metadata.json` — the checkpoint and the metadata are written together,
    so they cannot disagree.
    """
    import torch
    from torchvision import models as tv

    if architecture == "efficientnet_b0":
        model = tv.efficientnet_b0(weights=None)
        in_features = model.classifier[1].in_features
        model.classifier = torch.nn.Sequential(
            torch.nn.Dropout(0.3), torch.nn.Linear(in_features, num_classes)
        )
        return model

    if architecture == "resnet18":
        model = tv.resnet18(weights=None)
        model.fc = torch.nn.Sequential(
            torch.nn.Dropout(0.3), torch.nn.Linear(model.fc.in_features, num_classes)
        )
        return model

    raise ModelsUnavailable(f"unknown soil architecture in metadata: {architecture!r}")


@lru_cache(maxsize=1)
def _soil_model():
    """The winning backbone plus the calibration temperature fitted at training."""
    import torch

    metadata = _read_json("soil_metadata.json")
    classes = list(metadata["classes"])
    architecture = str(metadata.get("architecture", "efficientnet_b0"))

    model = _build_backbone(architecture, len(classes))
    checkpoint = MODELS_DIR / "soil_model.pth"
    if not checkpoint.exists():
        raise ModelsUnavailable(f"missing model artifact: {checkpoint.name}")
    model.load_state_dict(torch.load(checkpoint, map_location="cpu"))
    model.eval()
    return model, classes, float(metadata.get("temperature", 1.0)), metadata


@lru_cache(maxsize=1)
def _crop_model():
    return (
        _read_pickle("crop_model.pkl"),
        _read_pickle("crop_label_encoder.pkl"),
        _read_pickle("crop_scaler.pkl"),
    )


@lru_cache(maxsize=1)
def _fertilizer_model():
    return (
        _read_pickle("fertilizer_model.pkl"),
        _read_pickle("fertilizer_categorical_encoders.pkl"),
        _read_pickle("fertilizer_scaler.pkl"),
        _read_pickle("fertilizer_target_encoder.pkl"),
        list(_read_json("fertilizer_feature_columns.json")),
    )


def availability() -> dict[str, bool]:
    """What this instance can actually do, for /api/health. Checked by file
    presence rather than by loading — the point is to answer instantly."""
    return {
        "soil": (MODELS_DIR / "soil_model.pth").exists(),
        "crop": (MODELS_DIR / "crop_model.pkl").exists(),
        "fertilizer": (MODELS_DIR / "fertilizer_model.pkl").exists(),
    }


# --------------------------------------------------------------------------
# Soil
# --------------------------------------------------------------------------


def predict_soil(image_bytes: bytes, *, top_k: int = 3) -> SoilPrediction:
    import io

    import torch
    from PIL import Image, ImageOps
    from torchvision import transforms

    model, classes, temperature, metadata = _soil_model()
    size = int(metadata.get("image_size", 224))
    norm = metadata.get("normalize", {})

    image = Image.open(io.BytesIO(image_bytes))
    image = ImageOps.exif_transpose(image) or image  # phones rotate via EXIF
    image = image.convert("RGB")

    prepare = transforms.Compose(
        [
            transforms.Resize(int(size * 1.14)),
            transforms.CenterCrop(size),
            transforms.ToTensor(),
            transforms.Normalize(
                norm.get("mean", [0.485, 0.456, 0.406]),
                norm.get("std", [0.229, 0.224, 0.225]),
            ),
        ]
    )
    tensor = prepare(image).unsqueeze(0)

    with torch.no_grad():
        # Same test-time augmentation the model was validated with, so the
        # served confidence matches the measured one.
        logits = (model(tensor) + model(torch.flip(tensor, dims=[3]))) / 2
        # Temperature scaling. Without it the softmax reports 99% routinely,
        # and this number is printed next to a farmer's decision.
        probabilities = torch.softmax(logits / max(temperature, 1e-3), dim=1)[0]

    order = torch.argsort(probabilities, descending=True)
    ranked = [
        {"key": classes[int(i)], "confidence": round(float(probabilities[int(i)]) * 100, 1)}
        for i in order[:top_k]
    ]

    return SoilPrediction(
        key=ranked[0]["key"],
        confidence=ranked[0]["confidence"],
        alternatives=ranked[1:],
        note=describe_soil(ranked[0]["key"]),
        probabilities={name: round(float(probabilities[i]), 6)
                       for i, name in enumerate(classes)},
    )


# --------------------------------------------------------------------------
# Crop
# --------------------------------------------------------------------------


def predict_crops(
    readings: dict[str, float], soil_key: str, *, top_k: int = 5
) -> list[dict[str, Any]]:
    """Rank crops from the card readings, then re-rank for the soil.

    `readings` needs all seven of `CROP_FEATURES`, and every one is required.
    N, P, K and pH come off the farmer's card and are confirmed by them before
    they get here; temperature, humidity and rainfall are typed in for the
    field in question. A blank is an error, never a zero — `readings.get(name,
    0.0)` used to turn a nitrogen that OCR could not find into a soil with no
    nitrogen in it, which is a different field and a different answer.
    """
    # Read the inputs before touching the model. A request missing a value is
    # refused for free, rather than after several hundred MB of pickle has been
    # loaded to answer a question that was never askable.
    row = np.array([[_require(readings, name) for name in CROP_FEATURES]], dtype=np.float32)

    model, encoder, scaler = _crop_model()

    scaled = scaler.transform(row).astype(np.float32)
    probabilities = model.predict_proba(scaled)[0]

    order = np.argsort(probabilities)[::-1]
    ranked = [
        {
            "name": str(encoder.classes_[int(i)]),
            "score": float(probabilities[int(i)]),
        }
        for i in order[: max(top_k * 2, 8)]
    ]

    ranked = adjust_for_soil(ranked, soil_key)
    for item in ranked:
        item["confidence"] = round(min(item["score"], 1.0) * 100, 1)
    return ranked[:top_k]


# --------------------------------------------------------------------------
# Fertilizer
# --------------------------------------------------------------------------


def _fertilizer_soil_code(soil_key: str) -> int:
    """The classifier's soil, in the fertilizer dataset's vocabulary.

    No fallback. This used to answer `"loamy"` for anything it did not
    recognise — including `None`, which is what it got on every request that
    carried no soil photograph. A farmer who sent only a card was silently told
    their ground was loamy and given fertilizer for it.

    `SOIL_TO_FERTILIZER_SOIL` covers all eight classes in `soil_classes.json`,
    so a miss here is a genuine mismatch between the classifier and this map,
    and it should be loud.
    """
    mapped = SOIL_TO_FERTILIZER_SOIL.get((soil_key or "").lower())
    if mapped is None:
        raise MissingInput(f"soil type (no fertilizer mapping for {soil_key!r})")
    return FERTILIZER_SOIL_CODE_MAP[mapped]


def _fertilizer_crop_code(crop_name: str) -> int:
    """Likewise, with `"paddy"` removed for the same reason."""
    mapped = CROP_TO_FERTILIZER_CROP.get((crop_name or "").lower())
    if mapped is None:
        raise MissingInput(f"crop type (no fertilizer mapping for {crop_name!r})")
    return FERTILIZER_CROP_CODE_MAP[mapped]


def predict_fertilizers(
    readings: dict[str, float],
    soil_key: str,
    crop_name: str,
    *,
    top_k: int = 3,
) -> list[dict[str, Any]]:
    import pandas as pd

    numeric_columns = ["Temparature", "Humidity", "Moisture"]
    # Every one of these was a `.get(name, <a number>)`. They were never once
    # supplied by the caller, so this row was 26°C / 68% / 34% moisture on every
    # prediction the product has ever made. See `MissingInput`. Read before the
    # model loads, as in `predict_crops`.
    #
    # Nitrogen/Potassium/Phosphorous are gone from here too. The training table
    # holds them as 4-42 / 0-19 / 0-42; a card reads hundreds of kg/ha, so this
    # scaler was being handed a value about twenty-four standard deviations out
    # on every request. The nutrients now reach the answer only through
    # `_need_score`, which compares each reading to the range printed on that
    # farmer's own card — a comparison no scale mismatch can reach.
    row = [
        _require(readings, "temperature"),
        _require(readings, "humidity"),
        _require(readings, "moisture"),
    ]
    soil_code = _fertilizer_soil_code(soil_key)
    crop_code = _fertilizer_crop_code(crop_name)

    model, _encoders, scaler, target_encoder, feature_columns = _fertilizer_model()

    numeric = pd.DataFrame([row], columns=numeric_columns)
    scaled = scaler.transform(numeric)[0]

    features = {
        "Temparature": scaled[0],
        "Humidity": scaled[1],
        "Moisture": scaled[2],
        "Soil Type": soil_code,
        "Crop Type": crop_code,
        "temp_humidity_interaction": scaled[0] * scaled[1],
    }
    model_input = pd.DataFrame(
        [[features[column] for column in feature_columns]], columns=feature_columns
    )

    probabilities = model.predict_proba(model_input)[0]
    all_labels = list(target_encoder.classes_)

    # Ranked by what the card says is missing, with the model only separating
    # bags that meet the same need equally. See `_need_score` for why the model
    # is not allowed to lead.
    scored = []
    for index, label in enumerate(all_labels):
        name = str(label)
        scored.append(
            {
                "name": name,
                "need": _need_score(name, readings),
                "model_probability": float(probabilities[index]),
            }
        )
    scored.sort(key=lambda item: (item["need"], item["model_probability"]), reverse=True)

    results = []
    for item in scored[:top_k]:
        results.append(
            {
                "name": item["name"],
                # Deliberately the *nutrient match*, not the model's softmax. A
                # confidence taken from a 19.7%-accurate classifier, printed as
                # a percentage next to a purchase, would be a lie with a decimal
                # point on it.
                "confidence": round(max(0.0, min(item["need"], 1.0)) * 100, 1),
                "model_probability": round(item["model_probability"] * 100, 1),
                "verdict": _verdict_for(item["name"], readings),
            }
        )
    return results


#: What each bag actually contains, as N-P-K percentages. Printed on the sack.
FERTILIZER_NPK = {
    "Urea": (46, 0, 0),
    "DAP": (18, 46, 0),
    "28-28": (28, 28, 0),
    "20-20": (20, 20, 0),
    "17-17-17": (17, 17, 17),
    "14-35-14": (14, 35, 14),
    "10-26-26": (10, 26, 26),
}


def _need_score(label: str, readings: dict[str, float]) -> float:
    """How well this bag matches what the farmer's own card says is missing.

    This exists because the fertilizer model is close to worthless on its own.
    Trained on 750,000 rows of `playground-series-s5e6`, it reaches **19.7%
    accuracy against a 14.3% random baseline** — and the previously shipped
    model scores 18.8% on the same split, so this is the dataset, not the
    training. (Kaggle's own leaderboard for that competition tops out around
    0.38 MAP@3, which says the same thing.) Its features simply do not
    determine the label.

    A near-random ranking must not be what decides which sack somebody buys.
    So the card leads: a bag scores for supplying a nutrient the card measured
    as *below* its printed range, and is penalised for pushing one already
    *above* it. The model is kept only to break ties between bags that address
    the same deficiency equally well.

    This is a measurement standing in front of a guess, which is the right way
    round.
    """
    npk = FERTILIZER_NPK.get(label)
    if npk is None:
        return 0.0

    score = 0.0
    for nutrient, content in zip(("N", "P", "K"), npk):
        if content == 0:
            continue
        share = content / 100.0
        status = readings.get(f"{nutrient}_status")
        if status == "low":
            score += share
        elif status == "high":
            # Selling somebody more of what they already have too much of is
            # the failure this product exists to prevent.
            score -= share * 1.5
    return score


def _verdict_for(label: str, readings: dict[str, float]) -> str:
    """`hold` when the bag's main nutrient is already above the card's range."""
    npk = FERTILIZER_NPK.get(label)
    if npk is None:
        return "apply"

    # The nutrient the bag mostly is.
    dominant = ("N", "P", "K")[max(range(3), key=lambda i: npk[i])]
    if readings.get(f"{dominant}_status") == "high":
        return "hold"

    # Or: it supplies nothing the card asked for.
    if _need_score(label, readings) <= 0:
        return "hold"
    return "apply"


# --------------------------------------------------------------------------
# The whole pipeline
# --------------------------------------------------------------------------


def predict_all(
    readings: dict[str, float],
    soil_image: bytes,
) -> dict[str, Any]:
    """The photograph names the soil, the soil re-ranks the crops, the top crop
    and the card's deficits choose the fertilizer.

    `soil_image` is required. It used to be optional, and the optional path was
    not a smaller answer — it was the same answer computed against `"loamy"`,
    with `soil_applied: false` as the only sign. Either the ground has been
    looked at or there is nothing here to say about fertilizer.
    """
    soil = predict_soil(soil_image)

    crops = predict_crops(readings, soil.key)
    if not crops:
        raise MissingInput("crop ranking (the crop model returned nothing)")
    top_crop = crops[0]["name"]
    fertilizers = predict_fertilizers(readings, soil.key, top_crop)

    return {
        "soil": {
            "key": soil.key,
            "confidence": soil.confidence,
            "alternatives": soil.alternatives,
            "note": soil.note,
        },
        "crops": crops,
        "fertilizers": fertilizers,
        # The crop the fertilizer model was run for. Stated rather than left
        # for a client to infer from `crops[0]`: a fertilizer card that names
        # the crop it serves must name the one the model actually scored, not
        # whichever crop a hand-written example happened to pair it with.
        "fertilizers_for": top_crop,
        # Always true now that the photograph is required. Kept so the response
        # shape does not change under clients that still read it.
        "soil_applied": True,
        # Which of the three macronutrients had a printed range on the card to
        # be judged against. `_need_score` is driven by these, so a `null` here
        # is the difference between "this bag was ruled out" and "nothing on
        # your card could rule it in or out".
        "nutrient_status": {
            nutrient: readings.get(f"{nutrient}_status") for nutrient in ("N", "P", "K")
        },
        "out_of_range": training_range_warnings(readings),
    }


# --------------------------------------------------------------------------
# Honesty about scale
# --------------------------------------------------------------------------

#: `readings` key -> (model name, metadata file, column in that training table).
#:
#: Only inputs that actually reach a model appear here, and every one of them is
#: now the same quantity on both sides — °C against °C, % against %, pH against
#: pH. That is the point: the mismatched pairs were not made checkable, they
#: were removed. `N`, `P` and `K` are deliberately absent because neither model
#: takes them any more.
#:
#: This stays because a farmer can still type a number outside what a model
#: saw — 400 mm of rainfall against a table that stops at 298 — and a
#: recommendation extrapolated past its training data should say so.
_RANGE_SOURCES: dict[str, tuple[str, str, str]] = {
    "temperature": ("crop", "crop_metadata.json", "temperature"),
    "humidity": ("crop", "crop_metadata.json", "humidity"),
    "ph": ("crop", "crop_metadata.json", "ph"),
    "rainfall": ("crop", "crop_metadata.json", "rainfall"),
    "moisture": ("fertilizer", "fertilizer_metadata.json", "Moisture"),
}


@lru_cache(maxsize=4)
def _feature_ranges(metadata_name: str) -> dict[str, list[float]]:
    """What the training table actually contained, or nothing.

    Written by `ML/feature_ranges.py`. Absent metadata is a normal state — an
    older set of artifacts simply produces no warnings — so this never raises.
    """
    path = MODELS_DIR / metadata_name
    if not path.exists():
        return {}
    try:
        metadata = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return {}
    ranges = metadata.get("feature_ranges")
    return ranges if isinstance(ranges, dict) else {}


def training_range_warnings(readings: dict[str, float]) -> list[dict[str, Any]]:
    """Inputs that fall outside anything the model that consumes them was
    trained on.

    This began as a report on a mismatch that could not be fixed: the crop
    model's `N` ran 0–140 while a Soil Health Card reads 245–700 kg/ha, and
    there was no honest conversion between them. Reporting it was the most that
    could be done without inventing a factor.

    Then the columns turned out not to be soil nitrogen at all — they were the
    crop's recommended fertilizer dose — so the answer was to stop feeding a
    soil test to a fertilizer table rather than to convert between them. Both
    models were retrained without N, P and K, and the mismatch is gone rather
    than annotated.

    What is left is the ordinary case this should always have been: a farmer
    types 400 mm into a model whose table stops at 298. Every pair checked here
    is the same quantity in the same unit on both sides, so a warning now means
    an unusual field, not an incoherent comparison.
    """
    warnings: list[dict[str, Any]] = []
    for field, (model, metadata_name, column) in _RANGE_SOURCES.items():
        value = readings.get(field)
        if value is None:
            continue
        bounds = _feature_ranges(metadata_name).get(column)
        if not isinstance(bounds, list) or len(bounds) != 2:
            continue
        low, high = float(bounds[0]), float(bounds[1])
        if low <= float(value) <= high:
            continue
        warnings.append(
            {
                "field": field,
                "model": model,
                "value": round(float(value), 2),
                "trained_min": round(low, 2),
                "trained_max": round(high, 2),
            }
        )
    return warnings
