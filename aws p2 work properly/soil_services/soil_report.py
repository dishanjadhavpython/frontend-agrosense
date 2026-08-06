from __future__ import annotations

import re

SOIL_METRICS = [
    ("available_boron", "Available Boron (B)", r"AVAILABLE\s+BORON\s*\(B\)"),
    ("available_nitrogen", "Available Nitrogen (N)", r"AVAILABLE\s+NITROGEN\s*\(N\)"),
    ("available_phosphorus", "Available Phosphorus (P)", r"AVAILABLE\s+PHOSPHORUS\s*\(P\)"),
    ("available_potassium", "Available Potassium (K)", r"AVAILABLE\s+POTASSIUM\s*\(K\)"),
    ("ph", "pH", r"PH\s*\(pH\)"),
    ("ec", "EC", r"EC\s*\(EC"),
    ("organic_carbon", "Organic Carbon (OC)", r"ORGANIC\s+CARBON\s*\(OC\)"),
    ("available_sulphur", "Available Sulphur (S)", r"AVAILABLE\s+SULPHUR\s*\(S\)"),
    ("available_zinc", "Available Zinc (Zn)", r"AVAILABLE\s+ZINC\s*\(Zn\)"),
    ("available_iron", "Available Iron (Fe)", r"AVAILABLE\s+IRON\s*\(Fe\)"),
    ("available_manganese", "Available Manganese (Mn)", r"AVAILABLE\s+MANGANESE\s*\(Mn\)"),
    ("available_copper", "Available Copper (Cu)", r"AVAILABLE\s+COPPER\s*\(Cu\)"),
]

NUMBER_PATTERN = re.compile(r"[0-9]+(?:\.[0-9]+)?")


def _normalize_text(text: str) -> str:
    return " ".join(
        text.replace("\u2013", "-").replace("\u2014", "-").replace("\u2212", "-").split()
    )


def _soil_section(text: str) -> str:
    normalized = _normalize_text(text)
    start = normalized.find("SOIL SAMPLE DETAILS")
    if start == -1:
        return normalized

    section = normalized[start:]
    marker_indices = [
        section.find(marker)
        for marker in ("RECOMMENDATION", "FOLIAR", "खतसंयोजन", "!शफारस", "सूचना:")
        if section.find(marker) != -1
    ]
    if marker_indices:
        return section[: min(marker_indices)]
    return section


def _status(reading: float, minimum: float, maximum: float) -> tuple[str, str]:
    if reading < minimum:
        return "Below range", "low"
    if reading > maximum:
        return "Above range", "high"
    return "Within range", "normal"


def extract_soil_metrics(text: str) -> list[dict[str, object]]:
    section = _soil_section(text)
    matches: list[dict[str, object]] = []
    search_from = 0

    for key, label, pattern in SOIL_METRICS:
        match = re.search(pattern, section[search_from:], flags=re.IGNORECASE)
        if not match:
            continue

        start = search_from + match.start()
        end = search_from + match.end()
        matches.append({"key": key, "label": label, "start": start, "end": end})
        search_from = end

    metrics: list[dict[str, object]] = []
    for index, match in enumerate(matches):
        next_start = matches[index + 1]["start"] if index + 1 < len(matches) else len(section)
        segment = section[int(match["start"]) : int(next_start)]
        numbers = NUMBER_PATTERN.findall(segment)
        if len(numbers) < 3:
            continue

        reading_display, minimum_display, maximum_display = numbers[-3:]
        reading = float(reading_display)
        minimum = float(minimum_display)
        maximum = float(maximum_display)
        status, status_code = _status(reading, minimum, maximum)

        metrics.append(
            {
                "key": match["key"],
                "label": match["label"],
                "reading": reading,
                "reading_display": reading_display,
                "range_min": minimum,
                "range_max": maximum,
                "range_display": f"{minimum_display} - {maximum_display}",
                "status": status,
                "status_code": status_code,
            }
        )

    return metrics


def summarize_soil_metrics(metrics: list[dict[str, object]]) -> str:
    if not metrics:
        return "No structured soil readings were extracted from the uploaded report."

    out_of_range = [metric for metric in metrics if metric["status_code"] != "normal"]
    if not out_of_range:
        return f"Extracted {len(metrics)} soil readings. All values are within the listed ranges."

    highlights = [
        (
            f"{metric['label']} {metric['reading_display']} "
            f"({str(metric['status']).lower()}, expected {metric['range_display']})"
        )
        for metric in out_of_range[:6]
    ]
    extra_count = len(out_of_range) - len(highlights)
    summary = (
        f"Extracted {len(metrics)} soil readings. Out-of-range values: "
        + "; ".join(highlights)
    )
    if extra_count > 0:
        summary += f"; plus {extra_count} more"
    return summary + "."
