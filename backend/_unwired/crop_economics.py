from __future__ import annotations

from typing import Any, Iterable

from pricecrop.economics import load_price_dataset, normalize_crop_name, serialize_crop_row

from .config import PRICECROP_CSV_FILE


def _clean_crop_list(crops: Iterable[str] | None) -> list[str]:
    clean: list[str] = []
    seen: set[str] = set()
    for crop in crops or []:
        original = str(crop or "").strip()
        normalized = normalize_crop_name(original)
        if not original or not normalized or normalized in seen:
            continue
        seen.add(normalized)
        clean.append(original)
    return clean


def _build_unavailable_payload(crop_list: list[str], reason: str) -> dict[str, Any]:
    return {
        "available": False,
        "rows": [],
        "predicted_crops": crop_list,
        "matched_crops": [],
        "missing_crops": crop_list,
        "primary_predicted_crop": None,
        "predicted_crop_highlights": [],
        "best_for_cultivation": None,
        "most_profitable_crop": None,
        "highest_risk_crop": None,
        "lowest_cost_crop": None,
        "recommendation": None,
        "risk_warning": None,
        "average_risk_factor": 0,
        "total_crops_analyzed": 0,
        "comparison_basis": "predicted_crop_subset",
        "currency": "INR",
        "reason": reason,
    }


def _build_rank_lookup(rows: list[dict[str, Any]], metric_key: str) -> dict[str, int]:
    ranked_rows = sorted(rows, key=lambda row: float(row[metric_key]), reverse=True)
    return {
        normalize_crop_name(str(row["Crop"])): index + 1
        for index, row in enumerate(ranked_rows)
    }


def _serialize_row_with_flags(
    row: dict[str, Any],
    *,
    predicted_norms: set[str],
    primary_norm: str,
    best_norm: str,
    profit_norm: str,
    risk_norm: str,
    cost_norm: str,
    profit_ranks: dict[str, int],
    profitability_ranks: dict[str, int],
    risk_ranks: dict[str, int],
) -> dict[str, Any]:
    serialized = serialize_crop_row(row)
    normalized = normalize_crop_name(serialized["crop"])
    serialized.update(
        {
            "is_predicted_crop": normalized in predicted_norms,
            "is_primary_predicted_crop": normalized == primary_norm,
            "is_best_for_cultivation": normalized == best_norm,
            "is_most_profitable_crop": normalized == profit_norm,
            "is_highest_risk_crop": normalized == risk_norm,
            "is_lowest_cost_crop": normalized == cost_norm,
            "profit_rank": profit_ranks.get(normalized),
            "profitability_rank": profitability_ranks.get(normalized),
            "risk_rank": risk_ranks.get(normalized),
        }
    )
    return serialized


def _build_market_comparison(crops: Iterable[str] | None) -> dict[str, Any]:
    crop_list = _clean_crop_list(crops)
    if not crop_list:
        payload = _build_unavailable_payload(crop_list, "No predicted crops were available for economics comparison.")
        payload["missing_crops"] = []
        return payload

    try:
        rows = load_price_dataset(PRICECROP_CSV_FILE)
    except FileNotFoundError:
        payload = _build_unavailable_payload(crop_list, f"Crop economics dataset not found: {PRICECROP_CSV_FILE}")
        return payload
    except ValueError as exc:
        payload = _build_unavailable_payload(crop_list, f"Crop economics dataset error: {exc}")
        return payload

    lookup = {normalize_crop_name(str(row["Crop"])): row for row in rows}
    predicted_rows: list[dict[str, Any]] = []
    missing_crops: list[str] = []
    for crop in crop_list:
        row = lookup.get(normalize_crop_name(crop))
        if row:
            predicted_rows.append(row)
        else:
            missing_crops.append(crop)

    if not predicted_rows:
        payload = _build_unavailable_payload(crop_list, "No predicted crops matched the crop-economics dataset.")
        payload["missing_crops"] = missing_crops
        return payload

    best_crop = max(predicted_rows, key=lambda row: float(row["Profitability_Index"]))
    most_profitable_crop = max(predicted_rows, key=lambda row: float(row["Profit"]))
    highest_risk_crop = max(predicted_rows, key=lambda row: float(row["Risk_Factor"]))
    lowest_cost_crop = min(predicted_rows, key=lambda row: float(row["Cost_of_Production"]))
    average_risk = sum(float(row["Risk_Factor"]) for row in predicted_rows) / len(predicted_rows)

    primary_row = predicted_rows[0]
    primary_norm = normalize_crop_name(str(primary_row["Crop"]))
    predicted_norms = {normalize_crop_name(str(row["Crop"])) for row in predicted_rows}
    best_norm = normalize_crop_name(str(best_crop["Crop"]))
    profit_norm = normalize_crop_name(str(most_profitable_crop["Crop"]))
    risk_norm = normalize_crop_name(str(highest_risk_crop["Crop"]))
    cost_norm = normalize_crop_name(str(lowest_cost_crop["Crop"]))

    profit_ranks = _build_rank_lookup(predicted_rows, "Profit")
    profitability_ranks = _build_rank_lookup(predicted_rows, "Profitability_Index")
    risk_ranks = _build_rank_lookup(predicted_rows, "Risk_Factor")

    sorted_rows = sorted(
        predicted_rows,
        key=lambda row: (float(row["Profitability_Index"]), float(row["Profit"])),
        reverse=True,
    )
    serialized_rows = [
        _serialize_row_with_flags(
            row,
            predicted_norms=predicted_norms,
            primary_norm=primary_norm,
            best_norm=best_norm,
            profit_norm=profit_norm,
            risk_norm=risk_norm,
            cost_norm=cost_norm,
            profit_ranks=profit_ranks,
            profitability_ranks=profitability_ranks,
            risk_ranks=risk_ranks,
        )
        for row in sorted_rows
    ]
    serialized_lookup = {
        normalize_crop_name(str(row["crop"])): row
        for row in serialized_rows
    }

    primary_serialized = serialized_lookup.get(primary_norm)
    best_serialized = serialized_lookup.get(best_norm)
    most_profitable_serialized = serialized_lookup.get(profit_norm)
    highest_risk_serialized = serialized_lookup.get(risk_norm)
    lowest_cost_serialized = serialized_lookup.get(cost_norm)
    predicted_highlights = [
        serialized_lookup[normalize_crop_name(str(row["Crop"]))]
        for row in predicted_rows
        if normalize_crop_name(str(row["Crop"])) in serialized_lookup
    ]

    recommendation = None
    risk_warning = None
    if primary_serialized and best_serialized:
        recommendation = {
            "predicted_crop": primary_serialized,
            "best_crop": best_serialized,
            "should_switch": primary_norm != best_norm,
            "profit_gap": round(float(best_serialized["profit"]) - float(primary_serialized["profit"]), 2),
            "profitability_gap": round(
                float(best_serialized["profitability_index"]) - float(primary_serialized["profitability_index"]),
                2,
            ),
        }
    if primary_serialized and highest_risk_serialized:
        risk_warning = {
            "predicted_crop": primary_serialized,
            "highest_risk_crop": highest_risk_serialized,
            "predicted_crop_is_highest_risk": primary_norm == risk_norm,
            "average_risk_factor": round(average_risk, 4),
            "risk_gap_from_average": round(float(primary_serialized["risk_factor"]) - average_risk, 4),
        }

    return {
        "available": True,
        "rows": serialized_rows,
        "predicted_crops": crop_list,
        "matched_crops": [str(row["crop"]) for row in predicted_highlights],
        "missing_crops": missing_crops,
        "primary_predicted_crop": primary_serialized,
        "predicted_crop_highlights": predicted_highlights,
        "best_for_cultivation": best_serialized,
        "most_profitable_crop": most_profitable_serialized,
        "highest_risk_crop": highest_risk_serialized,
        "lowest_cost_crop": lowest_cost_serialized,
        "recommendation": recommendation,
        "risk_warning": risk_warning,
        "average_risk_factor": round(average_risk, 4),
        "total_crops_analyzed": len(serialized_rows),
        "comparison_basis": "predicted_crop_subset",
        "currency": "INR",
    }


def build_crop_economics_for_prediction(crops: Iterable[str] | None) -> dict[str, Any]:
    return _build_market_comparison(crops)


def build_pricecrop_dashboard(crops: Iterable[str] | None) -> dict[str, Any]:
    return _build_market_comparison(crops)
