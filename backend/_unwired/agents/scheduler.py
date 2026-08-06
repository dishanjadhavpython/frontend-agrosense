from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.background import BackgroundScheduler

from ..config import AGENTS_ENABLED, AGENTS_INTERVAL_HOURS, AGENTS_RUN_ON_STARTUP_IF_STALE
from . import storage
from .pipeline import run_pipeline_sync

logger = logging.getLogger("agrosense.agents")

_scheduler: BackgroundScheduler | None = None


def _run_job() -> None:
    logger.info("Running scheduled AI agent research/report pipeline...")
    try:
        result = run_pipeline_sync()
        logger.info("Agent pipeline run finished: %s", result.get("status"))
    except Exception:
        logger.exception("Agent pipeline run failed unexpectedly.")


def _last_run_is_stale() -> bool:
    status = storage.load_run_status()
    if not status or not status.get("finished_at"):
        return True
    try:
        finished_at = datetime.fromisoformat(status["finished_at"])
    except ValueError:
        return True
    return datetime.now(timezone.utc) - finished_at >= timedelta(hours=AGENTS_INTERVAL_HOURS)


def start_scheduler() -> BackgroundScheduler | None:
    """Starts the background scheduler that refreshes AI-generated
    crop/soil/fertilizer reports every AGROSENSE_AGENTS_INTERVAL_HOURS
    (default 12). No-op if AGROSENSE_AGENTS_ENABLED resolves to false
    (the default when no OPENAI_API_KEY is configured)."""
    global _scheduler

    if not AGENTS_ENABLED:
        logger.info("AI agent pipeline is disabled (no OPENAI_API_KEY or AGROSENSE_AGENTS_ENABLED=0).")
        return None

    if _scheduler is not None:
        return _scheduler

    run_soon = AGENTS_RUN_ON_STARTUP_IF_STALE and _last_run_is_stale()
    first_run_delay = timedelta(seconds=30) if run_soon else timedelta(hours=AGENTS_INTERVAL_HOURS)
    first_run_time = datetime.now(timezone.utc) + first_run_delay

    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        _run_job,
        trigger="interval",
        hours=AGENTS_INTERVAL_HOURS,
        id="agrosense-agent-pipeline",
        max_instances=1,
        coalesce=True,
        next_run_time=first_run_time,
    )
    scheduler.start()
    _scheduler = scheduler
    logger.info("AI agent pipeline scheduled every %s hour(s).", AGENTS_INTERVAL_HOURS)

    if run_soon:
        logger.info("No recent agent report run found; running the first batch shortly after startup.")

    return scheduler


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
