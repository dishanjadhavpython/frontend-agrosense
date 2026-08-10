from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..config import AGENT_REPORTS_DIR
from .topics import Topic, all_topics


def _report_path(category: str, slug: str) -> Path:
    return AGENT_REPORTS_DIR / category / f"{slug}.json"


def save_report(topic: Topic, report: dict[str, Any]) -> None:
    path = _report_path(topic.category, topic.slug)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = dict(report)
    payload.setdefault("category", topic.category)
    payload.setdefault("name", topic.name)
    payload.setdefault("slug", topic.slug)
    payload["generated_at"] = datetime.now(timezone.utc).isoformat()
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)


def load_report(category: str, slug: str) -> dict[str, Any] | None:
    path = _report_path(category, slug)
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (json.JSONDecodeError, OSError):
        return None


def list_reports() -> list[dict[str, Any]]:
    summaries: list[dict[str, Any]] = []
    for topic in all_topics():
        report = load_report(topic.category, topic.slug)
        summaries.append(
            {
                "category": topic.category,
                "name": topic.name,
                "slug": topic.slug,
                "available": report is not None,
                "generated_at": report.get("generated_at") if report else None,
                "needs_review": bool(report.get("needs_review")) if report else False,
            }
        )
    return summaries


def least_recently_updated_topics(limit: int) -> list[Topic]:
    """Ranks topics oldest-first (never-generated topics sort first), for the
    planner to pick a bounded batch to refresh each cycle so full topic
    coverage rotates over several runs instead of refreshing everything
    (and paying for it) every single cycle."""

    def sort_key(topic: Topic) -> str:
        report = load_report(topic.category, topic.slug)
        generated_at = report.get("generated_at") if report else None
        return str(generated_at or "")

    ranked = sorted(all_topics(), key=sort_key)
    return ranked[:limit]


def _run_status_path() -> Path:
    return AGENT_REPORTS_DIR / "_run_status.json"


def save_run_status(status: dict[str, Any]) -> None:
    path = _run_status_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(status, handle, indent=2, ensure_ascii=False)


def load_run_status() -> dict[str, Any] | None:
    path = _run_status_path()
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (json.JSONDecodeError, OSError):
        return None
