from __future__ import annotations

import base64
import io
import json
import pickle
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import boto3
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from PIL import Image
from sklearn.preprocessing import StandardScaler
from torchvision import transforms

from .config import (
    MODEL_CACHE_DIR,
    MODEL_DIR,
    MODEL_S3_BUCKET,
    MODEL_S3_PREFIX,
    SOIL_CLASSES,
)


FERTILIZER_SOIL_CODE_MAP = {
    "black": 0,
    "clayey": 1,
    "loamy": 2,
    "red": 3,
    "sandy": 4,
}

FERTILIZER_CROP_CODE_MAP = {
    "barley": 0,
    "cotton": 1,
    "ground nuts": 2,
    "maize": 3,
    "millets": 4,
    "oil seeds": 5,
    "paddy": 6,
    "pulses": 7,
    "sugarcane": 8,
    "tobacco": 9,
    "wheat": 10,
}

SOIL_TO_FERTILIZER_SOIL = {
    "alluvial soil": "loamy",
    "alluvial": "loamy",
    "black soil": "black",
    "black": "black",
    "clay soil": "clayey",
    "clayey": "clayey",
    "clay": "clayey",
    "red soil": "red",
    "red": "red",
    "sandy": "sandy",
    "loamy": "loamy",
}

CROP_TO_FERTILIZER_CROP = {
    "rice": "paddy",
    "paddy": "paddy",
    "sugarcane": "sugarcane",
    "maize": "maize",
    "cotton": "cotton",
    "wheat": "wheat",
    "barley": "barley",
    "pulses": "pulses",
    "vegetables": "millets",
    "ground nuts": "ground nuts",
    "groundnuts": "ground nuts",
    "millets": "millets",
    "oil seeds": "oil seeds",
    "oilseeds": "oil seeds",
    "tobacco": "tobacco",
}

CANONICAL_SOIL_NAMES = {
    "alluvial": "Alluvial soil",
    "alluvial soil": "Alluvial soil",
    "black": "Black Soil",
    "black soil": "Black Soil",
    "clay": "Clay soil",
    "clayey": "Clay soil",
    "clay soil": "Clay soil",
    "red": "Red soil",
    "red soil": "Red soil",
}

SOIL_PROFILES = {
    "Alluvial soil": {
        "ph": 6.8,
        "available_nitrogen": 115.0,
        "available_phosphorus": 36.0,
        "available_potassium": 180.0,
        "organic_carbon": 0.72,
        "ec": 0.42,
    },
    "Black Soil": {
        "ph": 7.7,
        "available_nitrogen": 108.0,
        "available_phosphorus": 30.0,
        "available_potassium": 225.0,
        "organic_carbon": 0.92,
        "ec": 0.58,
    },
    "Clay soil": {
        "ph": 7.1,
        "available_nitrogen": 96.0,
        "available_phosphorus": 26.0,
        "available_potassium": 188.0,
        "organic_carbon": 0.98,
        "ec": 0.74,
    },
    "Red soil": {
        "ph": 5.9,
        "available_nitrogen": 68.0,
        "available_phosphorus": 18.0,
        "available_potassium": 122.0,
        "organic_carbon": 0.56,
        "ec": 0.31,
    },
}

SOIL_PROFILE_SCALES = {
    "ph": 1.3,
    "available_nitrogen": 55.0,
    "available_phosphorus": 18.0,
    "available_potassium": 85.0,
    "organic_carbon": 0.45,
    "ec": 0.45,
}

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

CROP_NUMERIC_COLUMNS = ["N", "P", "K", "temperature", "humidity", "ph", "rainfall"]
CROP_SOIL_COLUMNS = [f"soil_{index}" for index in range(len(SOIL_CLASSES))]

transform = transforms.Compose(
    [
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(
            [0.485, 0.456, 0.406],
            [0.229, 0.224, 0.225],
        ),
    ]
)


class CustomCNN(nn.Module):
    def __init__(self, num_classes: int) -> None:
        super().__init__()
        self.conv1 = nn.Conv2d(3, 16, 3, padding=1)
        self.bn1 = nn.BatchNorm2d(16)

        self.conv2 = nn.Conv2d(16, 32, 3, padding=1)
        self.bn2 = nn.BatchNorm2d(32)

        self.conv3 = nn.Conv2d(32, 64, 3, padding=1)
        self.bn3 = nn.BatchNorm2d(64)

        self.pool = nn.MaxPool2d(2, 2)
        self.fc1 = nn.Linear(64 * 28 * 28, 256)
        self.dropout = nn.Dropout(0.5)
        self.fc2 = nn.Linear(256, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.pool(torch.relu(self.bn1(self.conv1(x))))
        x = self.pool(torch.relu(self.bn2(self.conv2(x))))
        x = self.pool(torch.relu(self.bn3(self.conv3(x))))
        x = x.view(x.size(0), -1)
        x = torch.relu(self.fc1(x))
        x = self.dropout(x)
        return self.fc2(x)


@dataclass
class PredictionArtifacts:
    soil_classes: list[str]
    crop_model: Any
    crop_label_encoder: Any
    crop_scaler: StandardScaler
    fertilizer_feature_columns: list[str]
    fertilizer_model: Any
    fertilizer_scaler: Any
    fertilizer_target_label_encoder: Any
    soil_model: nn.Module


class PredictionService:
    def __init__(self) -> None:
        self._s3_client = None
        self._artifacts: PredictionArtifacts | None = None

    def _get_s3_client(self):
        if self._s3_client is None:
            self._s3_client = boto3.client("s3")
        return self._s3_client

    def resolve_model_path(self, filename: str) -> Path:
        local_path = MODEL_DIR / filename
        if local_path.exists():
            return local_path

        if not MODEL_S3_BUCKET:
            raise FileNotFoundError(f"Model file not found: {local_path}")

        cached_path = MODEL_CACHE_DIR / filename
        if cached_path.exists():
            return cached_path

        key = f"{MODEL_S3_PREFIX}/{filename}" if MODEL_S3_PREFIX else filename
        self._get_s3_client().download_file(MODEL_S3_BUCKET, key, str(cached_path))
        return cached_path

    def _load_pickle(self, filename: str) -> Any:
        with open(self.resolve_model_path(filename), "rb") as file_handle:
            return pickle.load(file_handle)

    def _load_json(self, filename: str) -> Any:
        with open(self.resolve_model_path(filename), "r", encoding="utf-8") as file_handle:
            return json.load(file_handle)

    def _load_artifacts(self) -> PredictionArtifacts:
        if self._artifacts is not None:
            return self._artifacts

        soil_classes = list(self._load_pickle("soil_classes.pkl"))
        crop_model = self._load_pickle("crop_recommendation_xgb_model.pkl")
        crop_label_encoder = self._load_pickle("label_encoder.pkl")
        crop_scaler = self._build_crop_scaler()
        fertilizer_feature_columns = list(self._load_json("feature_columns.json"))
        fertilizer_model = self._load_pickle("fertilizer_xgb_model.pkl")
        fertilizer_scaler = self._load_pickle("scaler.pkl")
        fertilizer_target_label_encoder = self._load_pickle("target_label_encoder.pkl")

        soil_model = CustomCNN(len(soil_classes))
        soil_model.load_state_dict(
            torch.load(
                self.resolve_model_path("custom_cnn_model.pth"),
                map_location=device,
            )
        )
        soil_model.to(device)
        soil_model.eval()

        self._artifacts = PredictionArtifacts(
            soil_classes=soil_classes,
            crop_model=crop_model,
            crop_label_encoder=crop_label_encoder,
            crop_scaler=crop_scaler,
            fertilizer_feature_columns=fertilizer_feature_columns,
            fertilizer_model=fertilizer_model,
            fertilizer_scaler=fertilizer_scaler,
            fertilizer_target_label_encoder=fertilizer_target_label_encoder,
            soil_model=soil_model,
        )
        return self._artifacts

    def _build_crop_scaler(self) -> StandardScaler:
        dataset_path = MODEL_DIR / "Crop_recommendation.csv"
        if not dataset_path.exists():
            raise FileNotFoundError(f"Crop recommendation dataset not found: {dataset_path}")

        dataset = pd.read_csv(dataset_path)
        random_state = np.random.RandomState(42)
        dataset["soil_type"] = random_state.randint(0, len(SOIL_CLASSES), size=len(dataset))
        soil_columns = pd.get_dummies(dataset["soil_type"], prefix="soil")

        for column in CROP_SOIL_COLUMNS:
            if column not in soil_columns.columns:
                soil_columns[column] = 0

        dataset = pd.concat([dataset.drop(columns=["soil_type"]), soil_columns[CROP_SOIL_COLUMNS]], axis=1)
        scaler = StandardScaler()
        scaler.fit(dataset[CROP_NUMERIC_COLUMNS].values)
        return scaler

    @staticmethod
    def parse_data_url(image_base64: str) -> tuple[bytes, str]:
        content_type = "image/jpeg"
        data = image_base64
        if image_base64.startswith("data:"):
            header, data = image_base64.split(",", 1)
            if ";base64" in header:
                content_type = header[5:].split(";", 1)[0] or content_type
        return base64.b64decode(data), content_type

    def predict_soil_type(self, image_bytes: bytes) -> tuple[int, str]:
        artifacts = self._load_artifacts()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        tensor = transform(image).unsqueeze(0).to(device)

        with torch.no_grad():
            output = artifacts.soil_model(tensor)
            _, prediction = torch.max(output, 1)

        label = int(prediction.item())
        return label, artifacts.soil_classes[label]

    def normalize_soil_name(self, soil_name: str | None) -> str:
        key = str(soil_name or "").strip().lower()
        return CANONICAL_SOIL_NAMES.get(key, soil_name or SOIL_CLASSES[0])

    def _crop_model_input(self, values: list[float], soil_name: str) -> np.ndarray:
        artifacts = self._load_artifacts()
        soil = self.normalize_soil_name(soil_name)

        try:
            soil_label = artifacts.soil_classes.index(soil)
        except ValueError:
            soil_label = 0

        numeric_values = np.array([values[:7]], dtype=np.float32)
        scaled_numeric = artifacts.crop_scaler.transform(numeric_values)
        soil_one_hot = np.zeros((1, len(artifacts.soil_classes)), dtype=np.float32)
        soil_one_hot[0, soil_label] = 1.0
        return np.concatenate([scaled_numeric, soil_one_hot], axis=1).astype(np.float32)

    def recommend_crop(self, values: list[float], soil_name: str, top_n: int = 3) -> list[str]:
        artifacts = self._load_artifacts()
        model_input = self._crop_model_input(values, soil_name)

        if hasattr(artifacts.crop_model, "predict_proba"):
            probabilities = artifacts.crop_model.predict_proba(model_input)[0]
            ranked_indices = np.argsort(probabilities)[::-1][:top_n]
        else:
            prediction = artifacts.crop_model.predict(model_input)
            ranked_indices = np.atleast_1d(prediction).astype(int)[:top_n]

        labels = artifacts.crop_label_encoder.inverse_transform(ranked_indices)
        return [str(label) for label in labels]

    def _normalize_soil_for_fertilizer(self, soil_name: str) -> int:
        key = str(soil_name).strip().lower()
        normalized = SOIL_TO_FERTILIZER_SOIL.get(key, "loamy")
        return FERTILIZER_SOIL_CODE_MAP[normalized]

    def _normalize_crop_for_fertilizer(self, crops: list[str]) -> int:
        for crop in crops:
            crop_key = str(crop).strip().lower()
            if crop_key in CROP_TO_FERTILIZER_CROP:
                normalized = CROP_TO_FERTILIZER_CROP[crop_key]
                return FERTILIZER_CROP_CODE_MAP[normalized]

        return FERTILIZER_CROP_CODE_MAP["paddy"]

    def recommend_fertilizers(self, values: list[float], soil_name: str, crops: list[str], top_n: int = 3) -> list[str]:
        artifacts = self._load_artifacts()
        nitrogen, phosphorous, potassium, temperature, humidity, ph_value, rainfall, moisture = values
        soil_code = self._normalize_soil_for_fertilizer(soil_name)
        crop_code = self._normalize_crop_for_fertilizer(crops)

        numeric_columns = ["Temparature", "Humidity", "Moisture", "Nitrogen", "Potassium", "Phosphorous"]
        numeric_values = pd.DataFrame(
            [[temperature, humidity, moisture, nitrogen, potassium, phosphorous]],
            columns=numeric_columns,
        )
        scaled = artifacts.fertilizer_scaler.transform(numeric_values)[0]

        features = {
            "Temparature": scaled[0],
            "Humidity": scaled[1],
            "Moisture": scaled[2],
            "Soil Type": soil_code,
            "Crop Type": crop_code,
            "Nitrogen": scaled[3],
            "Potassium": scaled[4],
            "Phosphorous": scaled[5],
            "temp_humidity_interaction": scaled[0] * scaled[1],
            "nitrogen_phosphorous_interaction": scaled[3] * scaled[5],
        }

        model_input = pd.DataFrame(
            [[features[column] for column in artifacts.fertilizer_feature_columns]],
            columns=artifacts.fertilizer_feature_columns,
        )
        probabilities = artifacts.fertilizer_model.predict_proba(model_input)[0]
        top_indices = np.argsort(probabilities)[::-1][:top_n]
        labels = artifacts.fertilizer_target_label_encoder.inverse_transform(top_indices)
        return [str(label) for label in labels]

    def estimate_soil_from_metrics(self, metric_map: dict[str, float]) -> dict[str, Any]:
        scores: list[dict[str, Any]] = []
        for soil_name, profile in SOIL_PROFILES.items():
            distance = 0.0
            used_metrics = 0
            for key, target in profile.items():
                if key not in metric_map:
                    continue
                scale = SOIL_PROFILE_SCALES[key]
                distance += abs(metric_map[key] - target) / scale
                used_metrics += 1

            if used_metrics == 0:
                continue

            average_distance = distance / used_metrics
            confidence = max(0.2, round(1.0 - min(average_distance, 1.6) / 1.6, 3))
            scores.append(
                {
                    "soil_type": soil_name,
                    "distance": round(average_distance, 4),
                    "confidence": confidence,
                    "used_metric_count": used_metrics,
                }
            )

        if not scores:
            return {
                "soil_type": SOIL_CLASSES[0],
                "confidence": 0.2,
                "source": "default",
                "candidates": [],
            }

        scores.sort(key=lambda item: item["distance"])
        best = scores[0]
        return {
            "soil_type": str(best["soil_type"]),
            "confidence": float(best["confidence"]),
            "source": "heuristic_from_report",
            "candidates": scores,
        }

    def run_full_prediction(
        self,
        values: list[float],
        *,
        image_bytes: bytes | None = None,
        soil_name: str | None = None,
        metric_map: dict[str, float] | None = None,
    ) -> dict[str, Any]:
        source_details: dict[str, Any] = {}

        if image_bytes:
            _, resolved_soil_name = self.predict_soil_type(image_bytes)
            soil_source = "cnn_image_model"
        elif soil_name:
            resolved_soil_name = self.normalize_soil_name(soil_name)
            soil_source = "manual_selection"
        elif metric_map:
            estimated = self.estimate_soil_from_metrics(metric_map)
            resolved_soil_name = self.normalize_soil_name(str(estimated["soil_type"]))
            soil_source = str(estimated["source"])
            source_details["soil_estimation"] = estimated
        else:
            raise ValueError("A soil image, soil type, or document metrics are required.")

        crops = self.recommend_crop(values[:7], resolved_soil_name)
        fertilizers = self.recommend_fertilizers(values, resolved_soil_name, crops)

        return {
            "soil_type": resolved_soil_name,
            "soil_prediction_source": soil_source,
            "crop_prediction_source": "trained_xgboost_model",
            "recommended_crops": crops,
            "recommended_fertilizers": fertilizers,
            "predictions": fertilizers,
            **source_details,
        }

    def run_fertilizer_only(self, values: list[float], soil_name: str, crop_name: str) -> dict[str, Any]:
        resolved_soil_name = self.normalize_soil_name(soil_name)
        fertilizers = self.recommend_fertilizers(values, resolved_soil_name, [crop_name])
        return {
            "soil_type": resolved_soil_name,
            "selected_crop": crop_name,
            "recommended_crops": [],
            "recommended_fertilizers": fertilizers,
            "predictions": fertilizers,
            "soil_prediction_source": "manual_selection",
        }
