from __future__ import annotations

from datetime import date

from agents import Agent, Runner
from pydantic import BaseModel, Field

from ..config import AGENTS_MODEL
from .context import dated_context
from .topics import Topic

PLANNER_INSTRUCTIONS = """
You are the Planner Agent for AgroSense. You orchestrate the research
pipeline for a batch of topics (crops, soil types, fertilizers) that are
due for a refresh. You do not research or write content yourself -- you
decide what each topic's research should focus on this cycle so the
Research Agent's time is well spent, given the current date and India's
agricultural calendar (Kharif: ~Jun-Oct, Rabi: ~Oct-Mar, Zaid: ~Mar-Jun).

For each topic, write one or two sentences of research_focus: what's
seasonally or currently relevant to emphasize (e.g. sowing-season advice
for a crop entering its season, a fertilizer's role in the season ahead,
soil management priorities for the season). Keep it concrete and specific
to that one topic, not generic.
""".strip()


class PlanItem(BaseModel):
    category: str
    name: str
    research_focus: str = Field(
        description="What the Research agent should emphasize for this specific topic this cycle."
    )


class ResearchPlan(BaseModel):
    items: list[PlanItem] = Field(default_factory=list)


def _build_prompt(topics: list[Topic]) -> str:
    topic_lines = "\n".join(f"- {topic.category}: {topic.name}" for topic in topics)
    return (
        f"Today's date: {date.today().isoformat()}\n\n"
        f"Topics due for a refresh this cycle:\n{topic_lines}\n\n"
        "Produce a research_focus for every topic listed above."
    )


async def plan_batch(topics: list[Topic]) -> dict[tuple[str, str], str]:
    """Returns a {(category, name): research_focus} map covering every
    given topic. Falls back to a generic focus for any topic the planner
    didn't return (or if the planner call fails outright), so a planning
    hiccup never blocks the batch from being researched."""
    fallback = {
        (topic.category, topic.name): "General up-to-date overview, no particular seasonal emphasis."
        for topic in topics
    }
    if not topics:
        return fallback

    try:
        agent = Agent(
            name="Planner Agent",
            instructions=f"{dated_context()}\n\n{PLANNER_INSTRUCTIONS}",
            model=AGENTS_MODEL,
            output_type=ResearchPlan,
        )
        result = await Runner.run(agent, _build_prompt(topics), max_turns=4)
        plan = result.final_output_as(ResearchPlan)
    except Exception:
        return fallback

    focus_map = dict(fallback)
    for item in plan.items:
        key = (item.category.strip().lower(), item.name.strip().lower())
        for topic in topics:
            if (topic.category, topic.name.lower()) == key:
                focus_map[(topic.category, topic.name)] = item.research_focus
                break
    return focus_map
