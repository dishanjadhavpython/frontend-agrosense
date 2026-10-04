from __future__ import annotations

from agents import Agent, Runner

from .model_provider import agent_model
from .context import dated_context
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

Never write about the research itself. No sentence anywhere in the report may
mention tools, searches, APIs, errors, or anything that "could not be
retrieved" — the page already tells the farmer when a section is empty, in
their own language. If the findings have nothing for a field, leave it empty.
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
        instructions=f"{dated_context()}\n\n{CREATOR_INSTRUCTIONS}",
        model=agent_model(),
        output_type=TopicReport,
    )
    result = await Runner.run(agent, _build_prompt(topic, findings), max_turns=6)
    return result.final_output_as(TopicReport)
