from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from . import kv
from .topics import Topic, all_topics


def save_report(topic: Topic, report: dict[str, Any]) -> None:
    # Files locally, DynamoDB on AWS — see `kv.py` for why it has to be shared.
    payload = dict(report)
    payload.setdefault("category", topic.category)
    payload.setdefault("name", topic.name)
    payload.setdefault("slug", topic.slug)
    payload["generated_at"] = datetime.now(timezone.utc).isoformat()
    kv.put(f"{topic.category}/{topic.slug}", payload)


def load_report(category: str, slug: str) -> dict[str, Any] | None:
    return kv.get(f"{category}/{slug}")


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


def save_run_status(status: dict[str, Any]) -> None:
    kv.put("_run_status", status)


def load_run_status() -> dict[str, Any] | None:
    return kv.get("_run_status")
