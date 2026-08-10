from __future__ import annotations

import asyncio
import logging
import traceback
from datetime import datetime, timezone
from typing import Any

from agents import Agent, Runner

from ..config import AGENTS_BATCH_SIZE, AGENTS_MODEL, OPENAI_API_KEY
from . import demand, storage
from .creator import create_report
from .planner import plan_batch
from .research import research_topic
from .reviewer import review_report, strip_unsourced_claims
from .schemas import ReviewResult, TopicReport
from .topics import Topic

logger = logging.getLogger("agrosense.agents")

_REVISION_INSTRUCTIONS = """
You are the Creator Agent revising a report after the Reviewer rejected it.
Address every concern listed. Only use facts already present in the
original report or its sources -- do not invent new content to fill gaps;
remove or soften unsupported claims instead.
""".strip()


async def _revise_report(topic: Topic, report: TopicReport, review: ReviewResult) -> TopicReport:
    agent = Agent(
        name="Creator Agent (revision)",
        instructions=_REVISION_INSTRUCTIONS,
        model=AGENTS_MODEL,
        output_type=TopicReport,
    )
    prompt = (
        f"Topic: {topic.label} ({topic.category})\n\n"
        f"Original report (JSON):\n{report.model_dump_json(indent=2)}\n\n"
        f"Reviewer concerns:\n" + "\n".join(f"- {c}" for c in review.concerns)
    )
    result = await Runner.run(agent, prompt, max_turns=6)
    return result.final_output_as(TopicReport)


async def process_topic(topic: Topic, research_focus: str | None) -> dict[str, Any]:
    """Runs Research -> Creator -> Reviewer (with one revision attempt) for
    a single topic and persists the result. Returns a status dict; never
    raises, so one bad topic can't take down the whole batch."""
    try:
        findings = await research_topic(topic, research_focus)
        report = await create_report(topic, findings)

        # The source policy is applied in code before the Reviewer sees the
        # report, not left to the model's judgement. A model asked to drop its
        # own unsourced scheme will sometimes decide the scheme is well known
        # enough to keep -- and "well known" is how an expired subsidy reaches
        # a farmer.
        report, stripped = strip_unsourced_claims(report)

        review = await review_report(topic, report)

        if not review.approved and review.concerns:
            report = await _revise_report(topic, report, review)
            report, more_stripped = strip_unsourced_claims(report)
            stripped.extend(more_stripped)
            review = await review_report(topic, report)

        payload = report.model_dump()
        payload["needs_review"] = not review.approved
        # Removals are recorded rather than silent, so a blank schemes section
        # can be explained instead of just looking like nothing was found.
        payload["reviewer_concerns"] = list(review.concerns) + stripped
        payload["model"] = AGENTS_MODEL
        storage.save_report(topic, payload)

        return {
            "category": topic.category,
            "name": topic.name,
            "status": "ok",
            "needs_review": not review.approved,
        }
    except Exception as exc:  # noqa: BLE001 - isolate per-topic failures
        logger.error("Agent pipeline failed for %s/%s: %s", topic.category, topic.name, exc)
        logger.debug("Traceback:\n%s", traceback.format_exc())
        return {
            "category": topic.category,
            "name": topic.name,
            "status": "error",
            "error": str(exc),
        }


async def run_pipeline_async(batch_size: int | None = None) -> dict[str, Any]:
    started_at = datetime.now(timezone.utc).isoformat()

    if not OPENAI_API_KEY:
        result = {
            "started_at": started_at,
            "finished_at": started_at,
            "status": "skipped",
            "reason": "OPENAI_API_KEY is not configured.",
            "topics": [],
        }
        storage.save_run_status(result)
        return result

    # Demanded topics only, and only those past the refresh interval. The
    # round-robin this replaces researched whatever was oldest across all 37
    # topics, whether or not anybody had ever been shown it.
    topics = demand.due_topics(batch_size or AGENTS_BATCH_SIZE)
    if not topics:
        result = {
            "started_at": started_at,
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "status": "idle",
            "reason": "No predicted topic is due for a refresh.",
            "topics": [],
        }
        storage.save_run_status(result)
        return result

    focus_map = await plan_batch(topics)

    topic_results = []
    for topic in topics:
        focus = focus_map.get((topic.category, topic.name))
        topic_results.append(await process_topic(topic, focus))

    result = {
        "started_at": started_at,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "status": "completed",
        "topics": topic_results,
    }
    storage.save_run_status(result)
    return result


def run_pipeline_sync(batch_size: int | None = None) -> dict[str, Any]:
    """Sync entrypoint for callers that aren't already in an event loop
    (the APScheduler job, and the manual-trigger HTTP endpoint)."""
    return asyncio.run(run_pipeline_async(batch_size))
