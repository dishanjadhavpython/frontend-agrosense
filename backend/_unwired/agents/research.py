from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from typing import AsyncIterator

from agents import Agent, Runner
from agents.mcp import MCPServerStdio

from ..config import AGENTS_MODEL, ROOT_DIR
from .schemas import ResearchFindings
from .topics import Topic

RESEARCH_INSTRUCTIONS = """
You are the Research Agent for AgroSense, an Indian agriculture decision-support
platform. You investigate ONE topic per run (a crop, a soil type, or a
fertilizer) and gather current, real, sourced information for Indian farmers.

You have three tools:
- web_search: find current articles, news, and government pages.
- fetch_url: read the full text of a specific URL found via web_search.
- search_youtube: find a farmer-relevant instructional video.

Process:
1. Run 2-4 targeted web_search queries covering: general agronomy facts,
   any relevant Indian government scheme or subsidy, and any recent news
   about new varieties/breeds (for crops) or new formulations (for
   fertilizers).
2. fetch_url on the 1-3 most promising results to confirm details before
   citing them.
3. search_youtube once for a short instructional/educational video.

Rules:
- Every factual claim must be traceable to a URL you actually fetched or
  saw in search results. Put those URLs in `sources`.
- If you cannot find a government scheme, new development, or price/market
  information, leave that field empty rather than inventing one.
- Never state a specific numeric price/cost unless you saw that exact
  number in a fetched source; otherwise keep `market_notes` qualitative
  ("prices have trended up this season due to...") or leave it blank.
- Prefer Indian sources (.gov.in, ICAR, Krishi Vigyan Kendra, agri
  universities) when researching government schemes.
- Write `summary` and `key_points` in clear, plain English for a farmer
  audience, not academic jargon.
""".strip()


def _mcp_server(module_name: str, name: str) -> MCPServerStdio:
    return MCPServerStdio(
        name=name,
        params={
            "command": sys.executable,
            "args": ["-m", f"backend.agents.mcp_servers.{module_name}"],
            "cwd": str(ROOT_DIR),
        },
        client_session_timeout_seconds=30,
    )


@asynccontextmanager
async def _research_mcp_servers() -> AsyncIterator[list[MCPServerStdio]]:
    """The Research agent's three MCP servers, connected together. Kept as
    one context manager so callers get all-or-nothing setup/teardown."""
    async with _mcp_server("web_search_server", "web-search") as web_search:
        async with _mcp_server("fetch_server", "fetch") as fetch:
            async with _mcp_server("youtube_server", "youtube") as youtube:
                yield [web_search, fetch, youtube]


def _build_prompt(topic: Topic, research_focus: str | None) -> str:
    kind = {
        "crop": "crop",
        "soil": "soil type",
        "fertilizer": "fertilizer/nutrient blend",
    }[topic.category]
    prompt = (
        f"Research the {kind} '{topic.name}' for an Indian farmer audience. "
        "Cover: key agronomic facts, any current Indian government scheme or "
        "subsidy relevant to it, any newly released variety/breed or "
        "formulation, and general market/price trend notes if you can find "
        "genuinely current information. Find one relevant YouTube video."
    )
    if research_focus:
        prompt += f"\n\nThis cycle's planner guidance for this topic: {research_focus}"
    return prompt


async def research_topic(topic: Topic, research_focus: str | None = None) -> ResearchFindings:
    async with _research_mcp_servers() as servers:
        agent = Agent(
            name="Research Agent",
            instructions=RESEARCH_INSTRUCTIONS,
            model=AGENTS_MODEL,
            mcp_servers=servers,
            output_type=ResearchFindings,
        )
        result = await Runner.run(agent, _build_prompt(topic, research_focus), max_turns=20)
        return result.final_output_as(ResearchFindings)
