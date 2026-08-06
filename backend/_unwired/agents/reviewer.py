from __future__ import annotations

from agents import Agent, Runner

from ..config import AGENTS_MODEL
from .schemas import ReviewResult, TopicReport
from .topics import Topic

REVIEWER_INSTRUCTIONS = """
You are the Reviewer Agent for AgroSense, a quality gate over farmer-facing
agriculture content before it's published. You did not write this report
and have no other information beyond what's given to you -- you're
checking internal consistency and sourcing discipline, not verifying facts
against the live internet.

Reject (approved=false) if any of these are true:
- A government scheme, new variety/breed, or fertilizer formulation is
  named with no corresponding entry in `sources`.
- `market_notes` states a specific number/price/percentage.
- `key_facts` or `overview` contain suspiciously specific claims (exact
  dates, exact statistics) that aren't grounded in `sources`.
- The report is generic filler that doesn't actually mention the topic.

Otherwise approve. List every concern you find, even on an approved report
(e.g. minor wording issues), in `concerns`.
""".strip()


def _build_prompt(topic: Topic, report: TopicReport) -> str:
    return (
        f"Topic: {topic.label} ({topic.category})\n\n"
        f"Report to review (JSON):\n{report.model_dump_json(indent=2)}"
    )


async def review_report(topic: Topic, report: TopicReport) -> ReviewResult:
    agent = Agent(
        name="Reviewer Agent",
        instructions=REVIEWER_INSTRUCTIONS,
        model=AGENTS_MODEL,
        output_type=ReviewResult,
    )
    result = await Runner.run(agent, _build_prompt(topic, report), max_turns=6)
    return result.final_output_as(ReviewResult)
