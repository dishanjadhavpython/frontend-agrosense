from __future__ import annotations

from typing import Iterable

"""
What the card says about itself, on ingest.

Scoped deliberately: this reads the twelve numbers against **the ranges the
card itself printed** and reports what is out of range. It does not decide what
to plant.

It used to. `CROP_PROFILES` held six crops with hand-written nutrient windows —
no model, no dataset, no source — and `predict_from_metrics` returned a
`recommended_crop` scored against them on every ingest. Nothing rendered it,
which is the only reason it never reached anybody, and it was a second crop
recommendation sitting behind the real one with none of its provenance.

Crops come from the crop model in `models.py`, ranked from readings the farmer
confirmed and re-ranked for a soil that was photographed. There is one path to
a crop recommendation now, and this is not it.
"""

LOW_ACTIONS = {
    "available_nitrogen": (
        "Nitrogen support",
        "Apply split doses of urea or ammonium sulphate and keep residue or compost in the field.",
    ),
    "available_phosphorus": (
        "Phosphorus support",
        "Use DAP or single super phosphate near the root zone in the next application cycle.",
    ),
    "available_potassium": (
        "Potassium support",
        "Add muriate of potash or sulphate of potash and watch irrigation losses.",
    ),
    "organic_carbon": (
        "Organic carbon support",
        "Increase farmyard manure, compost, crop residue retention, or green manure.",
    ),
    "available_sulphur": (
        "Sulphur support",
        "Use gypsum or elemental sulphur in moderate, soil-tested doses.",
    ),
    "available_zinc": (
        "Zinc support",
        "Use zinc sulphate with organic matter to improve micronutrient availability.",
    ),
    "available_boron": (
        "Boron support",
        "Apply borax carefully at low dose because boron moves quickly and can become excessive.",
    ),
}

HIGH_ACTIONS = {
    "available_phosphorus": (
        "Phosphorus restraint",
        "Avoid phosphorus-heavy inputs for the next cycle and use a balanced grade instead of DAP-rich plans.",
    ),
    "available_potassium": (
        "Potassium restraint",
        "Reduce potash application until the next soil test confirms the drawdown.",
    ),
    "available_zinc": (
        "Zinc restraint",
        "Pause zinc sulphate application and rely on maintenance doses only after retesting.",
    ),
    "available_boron": (
        "Boron restraint",
        "Do not add boron this cycle. Re-test before the next micronutrient application.",
    ),
}


def _metrics_by_key(metrics: Iterable[dict[str, object]]) -> dict[str, dict[str, object]]:
    metric_map: dict[str, dict[str, object]] = {}
    for metric in metrics:
        key = str(metric.get("key") or "")
        if key:
            metric_map[key] = dict(metric)
    return metric_map


def _flagged_metrics(metric_map: dict[str, dict[str, object]]) -> list[str]:
    return [
        str(metric.get("label") or key)
        for key, metric in metric_map.items()
        if str(metric.get("status_code") or "normal") != "normal"
    ]


def _soil_health(metric_map: dict[str, dict[str, object]]) -> dict[str, object]:
    if not metric_map:
        return {
            "label": "Insufficient data",
            "score": 0,
            "summary": "The PDF did not contain enough structured soil readings to score soil health.",
            "flagged_metrics": [],
        }

    flagged = _flagged_metrics(metric_map)
    score = 100 - (len(flagged) * 12)

    organic_carbon = metric_map.get("organic_carbon")
    if organic_carbon and str(organic_carbon.get("status_code")) == "low":
        score -= 8

    ph_metric = metric_map.get("ph")
    if ph_metric:
        ph_value = float(ph_metric.get("reading") or 0.0)
        if ph_value < 5.5 or ph_value > 8.2:
            score -= 10

    score = max(35, min(100, int(round(score))))
    if score >= 85:
        label = "Balanced"
    elif score >= 70:
        label = "Stable"
    elif score >= 55:
        label = "Needs monitoring"
    else:
        label = "Corrective action needed"

    if flagged:
        summary = (
            f"Soil health is {label.lower()} with {len(flagged)} flagged readings: "
            + ", ".join(flagged[:4])
            + ("." if len(flagged) <= 4 else ", plus additional flagged values.")
        )
    else:
        summary = "All extracted readings are within range, so the soil profile looks balanced."

    return {
        "label": label,
        "score": score,
        "summary": summary,
        "flagged_metrics": flagged,
    }


def _fertilizer_plan(metric_map: dict[str, dict[str, object]]) -> list[dict[str, object]]:
    actions: list[dict[str, object]] = []

    for key, metric in metric_map.items():
        status_code = str(metric.get("status_code") or "normal")
        if status_code == "low" and key in LOW_ACTIONS:
            title, action = LOW_ACTIONS[key]
            actions.append(
                {
                    "title": title,
                    "status": "low",
                    "metric": str(metric.get("label") or key),
                    "action": action,
                }
            )
        if status_code == "high" and key in HIGH_ACTIONS:
            title, action = HIGH_ACTIONS[key]
            actions.append(
                {
                    "title": title,
                    "status": "high",
                    "metric": str(metric.get("label") or key),
                    "action": action,
                }
            )

    ph_metric = metric_map.get("ph")
    if ph_metric:
        ph_value = float(ph_metric.get("reading") or 0.0)
        if ph_value < 5.8:
            actions.append(
                {
                    "title": "Raise soil pH",
                    "status": "low",
                    "metric": "pH",
                    "action": "Use liming material gradually and re-check pH after the next season.",
                }
            )
        elif ph_value > 7.8:
            actions.append(
                {
                    "title": "Reduce alkalinity pressure",
                    "status": "high",
                    "metric": "pH",
                    "action": "Use organic matter and avoid unnecessary alkaline amendments before the next test.",
                }
            )

    if not actions:
        actions.append(
            {
                "title": "Maintenance plan",
                "status": "normal",
                "metric": "Overall profile",
                "action": "Use a balanced nutrient schedule and maintain organic matter because the extracted readings are within range.",
            }
        )

    return actions[:5]


def predict_from_metrics(metrics: list[dict[str, object]]) -> dict[str, object]:
    """A summary of the card, derived only from the card.

    Every value here traces back to a printed range on the farmer's own
    document. No crop is named — see the module docstring.
    """
    metric_map = _metrics_by_key(metrics)

    return {
        "soil_health": _soil_health(metric_map),
        "fertilizer_plan": _fertilizer_plan(metric_map),
        "input_coverage": {
            "metrics_found": len(metric_map),
            "metrics_flagged": len(_flagged_metrics(metric_map)),
        },
    }
