from __future__ import annotations

import asyncio
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any

from ..config import AGENTS_ENABLED, AGENTS_INTERVAL_HOURS, AGENTS_MAX_INFLIGHT
from . import demand, storage
from .topics import Topic, find_topic, slugify

logger = logging.getLogger("agrosense.agents")

"""
Research that starts when the farmer hits Predict.

Before this, the pipeline was purely a timer: `/api/predict` wrote a row to the
demand ledger and a sweep picked it up within thirty minutes. That is fine for
refreshing a topic somebody looked at last week, and wrong for the moment it
was actually built for — a farmer who has just been told their soil is black
and their crop is cotton is *looking at the page now*, and being told the
information will arrive after the next sweep is a promise they will not stay
for.

So a prediction asks for its own topics immediately, and the sweep goes back to
being what its name says: the thing that catches whatever the request path
missed.

Three properties this has to keep, because it now runs on a stranger's click
rather than on a clock:

  * **Bounded.** One prediction names up to nine topics and every one of them
    costs four LLM calls and four MCP subprocesses. `AGENTS_MAX_INFLIGHT`
    is the ceiling; the rest fall through to the sweep, which is exactly what
    the sweep is for.
  * **Idempotent.** Two farmers predicting cotton within a minute must produce
    one research run, not two. Anything already in flight or already fresh is
    skipped.
  * **Silent on failure.** This is called from the request path. It may not
    raise, it may not block, and it may not make a farmer wait — the
    prediction is the answer, this is an enrichment of it.
"""

#: Topics currently being researched, as `"category/slug"`. Read by the
#: insights endpoint so a page can say "gathering this now" instead of
#: "not researched yet", which is a materially different thing to be told.
_inflight: set[str] = set()
_lock = threading.Lock()

#: Small and long-lived. Each worker runs one topic to completion — research,
#: write-up, review — which is minutes, not milliseconds.
_pool: ThreadPoolExecutor | None = None

#: Why the last request was declined, for `/api/health`. Without this, "no
#: credits" and "everything is fresh" look identical from outside: nothing
#: happens either way.
_last_decline: dict[str, Any] | None = None


def _key(category: str, slug: str) -> str:
    return f"{category}/{slug}"


def _executor() -> ThreadPoolExecutor:
    global _pool
    if _pool is None:
        _pool = ThreadPoolExecutor(
            max_workers=AGENTS_MAX_INFLIGHT,
            thread_name_prefix="agrosense-research",
        )
    return _pool


def is_researching(category: str, slug: str) -> bool:
    with _lock:
        return _key(category, slugify(slug)) in _inflight


def snapshot() -> dict[str, Any]:
    """What the queue is doing, for `/api/health`."""
    with _lock:
        return {
            "inflight": sorted(_inflight),
            "max_inflight": AGENTS_MAX_INFLIGHT,
            "last_decline": _last_decline,
        }


def _run(topic: Topic) -> None:
    """One topic, start to finish, on a worker thread.

    `process_topic` is async and never raises — it catches per-topic failures
    and returns a status dict, which is what makes it safe to fire and forget.
    Imported here rather than at module scope so importing this module does not
    drag in the agents SDK, torch, and four MCP client stubs.
    """
    from .pipeline import process_topic

    key = _key(topic.category, topic.slug)
    try:
        result = asyncio.run(process_topic(topic, None))
        logger.info(
            "On-demand research finished for %s: %s", key, result.get("status")
        )
        # Recorded the same way a sweep records itself, so `_run_status.json`
        # remains the one place to look at what the agents last did.
        storage.save_run_status(
            {
                "started_at": datetime.now(timezone.utc).isoformat(),
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "status": "completed",
                "trigger": "on-demand",
                "topics": [result],
            }
        )
    except Exception:
        logger.exception("On-demand research crashed for %s", key)
    finally:
        with _lock:
            _inflight.discard(key)


def request_now(predictions: dict[str, list[str]]) -> dict[str, Any]:
    """Start research for what was just predicted. Returns immediately.

    Takes the same `{"soil": [...], "crop": [...], "fertilizer": [...]}` shape
    `demand.record` takes, so the call site passes one dict to both.

    Ordering matters and is not alphabetical: the soil and the first crop are
    what a farmer taps first, so they get the workers. `demand.due_topics`
    already knows how to rank by need, but it ranks the *whole ledger* — this
    only wants the handful in front of us, in the order they appear on screen.
    """
    global _last_decline

    if not AGENTS_ENABLED:
        # The state this repo ships in without a key, and the state it is in
        # right now with an exhausted one. Recorded rather than ignored.
        _last_decline = {
            "at": datetime.now(timezone.utc).isoformat(),
            "reason": "Agents are disabled (no model credentials, or switched off).",
        }
        return {"started": [], "skipped": [], "reason": _last_decline["reason"]}

    # Soil first, then crops in rank order, then fertilizers. `dict` preserves
    # insertion order, but the caller's dict is built elsewhere, so the
    # priority is stated here rather than assumed.
    ordered: list[Topic] = []
    for category in ("soil", "crop", "fertilizer"):
        for name in predictions.get(category, []):
            topic = find_topic(category, slugify(str(name)))
            if topic is not None:
                ordered.append(topic)

    started: list[str] = []
    skipped: list[str] = []

    for topic in ordered:
        key = _key(topic.category, topic.slug)

        # Fresh enough. `demand` owns this rule for the sweep; reuse its
        # measurement rather than re-deriving what "stale" means.
        age = demand._age_hours(topic)  # noqa: SLF001 - one owner of this rule
        if age < AGENTS_INTERVAL_HOURS:
            skipped.append(f"{key} (fresh, {age:.1f}h old)")
            continue

        with _lock:
            if key in _inflight:
                skipped.append(f"{key} (already running)")
                continue
            if len(_inflight) >= AGENTS_MAX_INFLIGHT:
                # Not an error. The sweep will take it within the half hour,
                # which is what the sweep is for.
                skipped.append(f"{key} (queue full, left for the sweep)")
                continue
            _inflight.add(key)

        try:
            _executor().submit(_run, topic)
            started.append(key)
        except Exception:
            with _lock:
                _inflight.discard(key)
            logger.exception("Could not start on-demand research for %s", key)
            skipped.append(f"{key} (could not start)")

    if started:
        logger.info("On-demand research started: %s", ", ".join(started))

    return {"started": started, "skipped": skipped}


def shutdown() -> None:
    """Let the service stop without waiting on an agent mid-fetch."""
    global _pool
    if _pool is not None:
        _pool.shutdown(wait=False, cancel_futures=True)
        _pool = None


__all__ = ["request_now", "is_researching", "snapshot", "shutdown"]
