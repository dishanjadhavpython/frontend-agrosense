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

#: What the card + weather supply, in the order the crop model was trained on.
CROP_FEATURES = ["N", "P", "K", "temperature", "humidity", "ph", "rainfall"]


class ModelsUnavailable(RuntimeError):
    """An artifact is missing. The API turns this into a 503 rather than a 500:
    it is a deployment state, not a bug in the request."""


@dataclass
class SoilPrediction:
    key: str
    confidence: float
    alternatives: list[dict[str, Any]]
    note: str


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
    )


# --------------------------------------------------------------------------
# Crop
# --------------------------------------------------------------------------


def predict_crops(
    readings: dict[str, float], soil_key: str | None = None, *, top_k: int = 5
) -> list[dict[str, Any]]:
    """Rank crops from the card readings, then re-rank for the soil.

    `readings` needs N, P, K, temperature, humidity, ph, rainfall. The card
    supplies N/P/K/ph; the weather feed supplies the rest.
    """
    model, encoder, scaler = _crop_model()

    row = np.array([[float(readings.get(name, 0.0)) for name in CROP_FEATURES]], dtype=np.float32)
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


def _fertilizer_soil_code(soil_key: str | None) -> int:
    mapped = SOIL_TO_FERTILIZER_SOIL.get((soil_key or "").lower(), "loamy")
    return FERTILIZER_SOIL_CODE_MAP.get(mapped, 2)


def _fertilizer_crop_code(crop_name: str | None) -> int:
    mapped = CROP_TO_FERTILIZER_CROP.get((crop_name or "").lower(), "paddy")
    return FERTILIZER_CROP_CODE_MAP.get(mapped, 6)


def predict_fertilizers(
    readings: dict[str, float],
    soil_key: str | None,
    crop_name: str | None,
    *,
    top_k: int = 3,
) -> list[dict[str, Any]]:
    import pandas as pd

    model, _encoders, scaler, target_encoder, feature_columns = _fertilizer_model()

    numeric_columns = ["Temparature", "Humidity", "Moisture", "Nitrogen", "Potassium", "Phosphorous"]
    numeric = pd.DataFrame(
        [[
            float(readings.get("temperature", 26.0)),
            float(readings.get("humidity", 68.0)),
            float(readings.get("moisture", 34.0)),
            float(readings.get("N", 0.0)),
            float(readings.get("K", 0.0)),
            float(readings.get("P", 0.0)),
        ]],
        columns=numeric_columns,
    )
    scaled = scaler.transform(numeric)[0]

    features = {
        "Temparature": scaled[0],
        "Humidity": scaled[1],
        "Moisture": scaled[2],
        "Soil Type": _fertilizer_soil_code(soil_key),
        "Crop Type": _fertilizer_crop_code(crop_name),
        "Nitrogen": scaled[3],
        "Potassium": scaled[4],
        "Phosphorous": scaled[5],
        "temp_humidity_interaction": scaled[0] * scaled[1],
        "nitrogen_phosphorous_interaction": scaled[3] * scaled[5],
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
    soil_image: bytes | None = None,
) -> dict[str, Any]:
    """Soil (if a photo came), then crops, then fertilizer for the top crop."""
    soil: SoilPrediction | None = None
    if soil_image:
        soil = predict_soil(soil_image)

    soil_key = soil.key if soil else None
    crops = predict_crops(readings, soil_key)
    top_crop = crops[0]["name"] if crops else None
    fertilizers = predict_fertilizers(readings, soil_key, top_crop)

    return {
        "soil": (
            {
                "key": soil.key,
                "confidence": soil.confidence,
                "alternatives": soil.alternatives,
                "note": soil.note,
            }
            if soil
            else None
        ),
        "crops": crops,
        "fertilizers": fertilizers,
        # Says plainly whether the soil photograph reached the ranking, so the
        # UI never implies a soil-aware result it did not get.
        "soil_applied": soil_key is not None,
    }
