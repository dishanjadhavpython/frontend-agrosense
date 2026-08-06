from __future__ import annotations

from agents import Agent, Runner

from ..config import AGENTS_MODEL
from .schemas import ResearchFindings, TopicReport
from .topics import Topic

CREATOR_INSTRUCTIONS = """
You are the Creator Agent for AgroSense. You turn raw research findings into
a polished, farmer-facing report. You do not do any research yourself --
only use the findings you're given, and never add facts, schemes, videos,
or sources that are not present in that input.

Write for a farmer or agriculture student audience: clear, practical,
plain English. Structure the output as:
- title: a short display title for this topic.
- overview: 2-4 sentences.
- key_facts: 4-8 concise bullet-style facts.
- new_developments: newly released crop varieties/breeds or fertilizer
  formulations mentioned in the research (empty list if none were found --
  do not invent any).
- government_schemes: copied/summarized from the research findings only.
- market_notes: qualitative only, copied/summarized from the research
  findings. Never invent a specific number that wasn't in the findings.
- youtube_resources: copied from the research findings.
- sources: copied from the research findings, every one of them.
""".strip()


def _build_prompt(topic: Topic, findings: ResearchFindings) -> str:
    return (
        f"Topic: {topic.label} ({topic.category})\n\n"
        f"Research findings (JSON):\n{findings.model_dump_json(indent=2)}\n\n"
        "Write the final report from this material only."
    )


async def create_report(topic: Topic, findings: ResearchFindings) -> TopicReport:
    agent = Agent(
        name="Creator Agent",
        instructions=CREATOR_INSTRUCTIONS,
        model=AGENTS_MODEL,
        output_type=TopicReport,
    )
    result = await Runner.run(agent, _build_prompt(topic, findings), max_turns=6)
    return result.final_output_as(TopicReport)
