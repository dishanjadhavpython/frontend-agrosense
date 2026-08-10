from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from ..config import AGENT_REPORTS_DIR, AGENTS_INTERVAL_HOURS
from . import storage
from .topics import Topic, find_topic, slugify

"""
Which topics are worth researching, and when.

The pipeline used to take `least_recently_updated_topics(6)` — a round-robin
over all 37 crops, soils and fertilizers. That refreshes watermelon on schedule
whether or not a single farmer has ever been shown watermelon, and at four LLM
calls per topic every eight hours it is a standing bill for pages nobody opens.

This replaces it with demand. `/api/predict` records what it just returned; the
scheduler researches only that, oldest and most-wanted first. Three consequences,
all of them the point:

  * nothing is researched until it has been predicted at least once, so a fresh
    install costs nothing;
  * a soil forty farmers were shown refreshes before one that one farmer saw;
  * the cost of the whole subsystem is bounded by how many *distinct* things
    the models actually predict, not by traffic.

The ledger is a small JSON file rather than a database because that is what it
is: a few dozen rows, written once per prediction, read once per sweep.
"""

LEDGER_PATH = AGENT_REPORTS_DIR / "_demand.json"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _read() -> dict[str, dict[str, Any]]:
    if not LEDGER_PATH.exists():
        return {}
    try:
        return json.loads(LEDGER_PATH.read_text())
    except (json.JSONDecodeError, OSError):
        return {}


def _write(ledger: dict[str, dict[str, Any]]) -> None:
    """Atomic replace. A prediction landing while the scheduler reads the
    ledger must not present it with half a file."""
    LEDGER_PATH.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(dir=str(LEDGER_PATH.parent), suffix=".tmp")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as file:
            json.dump(ledger, file, indent=2, ensure_ascii=False)
        os.replace(temporary, LEDGER_PATH)
    except Exception:
        Path(temporary).unlink(missing_ok=True)
        raise


def _key(category: str, name: str) -> str:
    return f"{category}/{slugify(name)}"


def record(predictions: dict[str, list[str]]) -> None:
    """Note that these topics were shown to somebody.

    Called from the prediction endpoint with `{"crop": [...], "soil": [...],
    "fertilizer": [...]}`. Cheap and synchronous — one small file write — so it
    can sit in the request path without a farmer waiting on it.
    """
    ledger = _read()
    now = _now().isoformat()

    for category, names in predictions.items():
        for name in names:
            if not name:
                continue
            # Unknown names are skipped rather than stored: the crop model can
            # return a label the topic universe has no page for, and a ledger
            # row for a topic that cannot be researched is just a leak.
            if find_topic(category, slugify(name)) is None:
                continue

            key = _key(category, name)
            row = ledger.get(key)
            if row is None:
                ledger[key] = {
                    "category": category,
                    "name": name,
                    "first_seen": now,
                    "last_seen": now,
                    "hits": 1,
                }
            else:
                row["last_seen"] = now
                row["hits"] = int(row.get("hits", 0)) + 1

    _write(ledger)


def _age_hours(topic: Topic) -> float:
    """How old this topic's stored report is. `inf` when there isn't one."""
    report = storage.load_report(topic.category, topic.slug)
    if not report:
        return float("inf")
    stamp = report.get("updated_at") or report.get("generated_at")
    if not stamp:
        return float("inf")
    try:
        updated = datetime.fromisoformat(str(stamp))
    except ValueError:
        return float("inf")
    if updated.tzinfo is None:
        updated = updated.replace(tzinfo=timezone.utc)
    return (_now() - updated).total_seconds() / 3600.0


def due_topics(limit: int) -> list[Topic]:
    """Demanded topics whose report is missing or older than the interval.

    Ordered by never-researched first, then by how many farmers were shown it,
    then by age. A topic somebody was just shown for the first time should not
    wait behind a popular one that is merely due.
    """
    ledger = _read()
    candidates: list[tuple[tuple[int, int, float], Topic]] = []

    for row in ledger.values():
        topic = find_topic(str(row.get("category", "")), slugify(str(row.get("name", ""))))
        if topic is None:
            continue

        age = _age_hours(topic)
        if age < AGENTS_INTERVAL_HOURS:
            continue  # still fresh — serve the cache, spend nothing

        never = 0 if age == float("inf") else 1
        candidates.append(((never, -int(row.get("hits", 0)), -age), topic))

    candidates.sort(key=lambda item: item[0])
    return [topic for _, topic in candidates[:limit]]


def snapshot() -> dict[str, Any]:
    """The ledger, for /api/health and for anyone wondering what it is doing."""
    ledger = _read()
    fresh = stale = 0
    for row in ledger.values():
        topic = find_topic(str(row.get("category", "")), slugify(str(row.get("name", ""))))
        if topic is None:
            continue
        if _age_hours(topic) < AGENTS_INTERVAL_HOURS:
            fresh += 1
        else:
            stale += 1

    return {
        "tracked": len(ledger),
        "fresh": fresh,
        "due": stale,
        "interval_hours": AGENTS_INTERVAL_HOURS,
    }


def report_freshness(category: str, slug: str) -> dict[str, Any]:
    """Age and staleness for one topic, for the insights endpoint."""
    topic = find_topic(category, slug)
    if topic is None:
        return {"age_hours": None, "stale": True}
    age = _age_hours(topic)
    if age == float("inf"):
        return {"age_hours": None, "stale": True}
    return {
        "age_hours": round(age, 2),
        "stale": age >= AGENTS_INTERVAL_HOURS,
        "next_refresh_in_hours": round(max(0.0, AGENTS_INTERVAL_HOURS - age), 2),
    }


__all__ = ["record", "due_topics", "snapshot", "report_freshness", "LEDGER_PATH"]
