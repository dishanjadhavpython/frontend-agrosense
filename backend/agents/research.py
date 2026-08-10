from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from typing import AsyncIterator

from agents import Agent, Runner
from agents.mcp import MCPServerStdio
from agents.run_error_handlers import RunErrorHandlerInput

from ..config import AGENTS_MODEL, ROOT_DIR
from .briefs import brief_for, kind_of
from .context import dated_context
from .schemas import ResearchFindings
from .sources import SEARCH_HINT
from .topics import Topic

RESEARCH_INSTRUCTIONS = """
You are the Research Agent for AgroSense, an Indian agriculture decision-support
platform. You investigate ONE topic per run (a crop, a soil type, or a
fertilizer) and gather current, real, sourced information for Indian farmers.

You have four tools:
- web_search: find current articles, news, and government pages.
- fetch_url: read the full text of a specific URL found via web_search.
- search_youtube: find a farmer-relevant instructional video.
- mandi_prices: government-recorded market prices, straight from data.gov.in.
  Call it ONCE for a crop. Never write a price you did not get from this tool
  or read on a *.gov.in page. If it answers `available: false`, that is the
  final answer on prices for this run: leave the price fields empty, note that
  government price data was unavailable, and move on. Do NOT go looking for a
  price on the web instead — a price you find that way cannot be published.

Process:
1. Run 2-4 targeted web_search queries covering: general agronomy facts,
   any relevant Indian government scheme or subsidy, and any recent news
   about new varieties/breeds (for crops) or new formulations (for
   fertilizers).
2. fetch_url on the 1-3 most promising results to confirm details before
   citing them.
3. search_youtube once for a short instructional/educational video.

Budget — this matters as much as the content:
- Around 10 tool calls, and never more than 20. When you reach that, write the
  report from what you already have.
- A fetch_url that fails (403, 404, timeout) is answered, not retried. Never
  fetch the same URL twice, and drop the source rather than working around a
  site that will not serve you.
- An empty field is a normal, publishable outcome. A partial report is worth
  far more than a thorough one you never finish — running out of turns
  publishes nothing at all.

Rules:
- Every factual claim must be traceable to a URL you actually fetched or
  saw in search results. Put those URLs in `sources`.
- If you cannot find a government scheme, new development, or price/market
  information, leave that field empty rather than inventing one.
- Never state a specific numeric price/cost unless you saw that exact
  number in a fetched source; otherwise keep `market_notes` qualitative
  ("prices have trended up this season due to...") or leave it blank.
- The source policy is enforced downstream, not merely preferred: a
  government scheme or price whose only support is a non-government domain
  WILL be deleted from the published report by the Reviewer. Do not spend
  turns on a scheme you cannot source from *.gov.in or *.nic.in.
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
        # 30 was not enough and cost whole topics. Every tool here is network
        # bound — `web_search` polls several search backends in sequence and
        # `fetch_url` allows 12s per page — and blowing this budget does not
        # fail one tool call, it tears down the session and takes the topic
        # with it. Each tool already has its own inner timeout, so this is the
        # backstop for a hung subprocess, not the thing meant to fire first.
        client_session_timeout_seconds=90,
    )


@asynccontextmanager
async def _research_mcp_servers() -> AsyncIterator[list[MCPServerStdio]]:
    """The Research agent's four MCP servers, connected together. Kept as
    one context manager so callers get all-or-nothing setup/teardown."""
    async with _mcp_server("web_search_server", "web-search") as web_search:
        async with _mcp_server("fetch_server", "fetch") as fetch:
            async with _mcp_server("youtube_server", "youtube") as youtube:
                async with _mcp_server("mandi_price_server", "mandi-prices") as prices:
                    yield [web_search, fetch, youtube, prices]


_WRITE_UP_INSTRUCTIONS = """
You are the Research Agent for AgroSense, finishing a run that used up its
tool budget before writing anything.

Everything above is your own research on this topic. You have no tools now;
write the report from what is already there and nothing else. Same rules as
before: every claim traceable to a URL that appears in the transcript, no
price you did not read in a fetched source, empty fields where you found
nothing. Do not soften the gaps into vague statements to make the report look
complete — an empty field is honest, a padded one is not.
""".strip()


async def _write_up_what_we_have(
    handler_input: RunErrorHandlerInput[None],
) -> ResearchFindings:
    """Turn a blown turn budget into the report the research already supports.

    Research is the expensive half of this pipeline — twenty-odd page fetches
    behind one topic. Letting `MaxTurnsExceeded` propagate threw all of it away
    and left the topic with no report at all, which is the worst of both: the
    money is spent and the farmer's page still says "not researched yet".

    The model is genuinely bad at stopping (it was told a ten-call budget and
    a twenty-call ceiling, and sailed past thirty turns anyway), so the ceiling
    is enforced here instead of asked for there. The transcript carries every
    tool result, so this second pass has the same material the agent had — it
    simply has no way to go looking for more.
    """
    agent = Agent(
        name="Research Agent (write-up)",
        instructions=f"{dated_context()}\n\n{_WRITE_UP_INSTRUCTIONS}",
        model=AGENTS_MODEL,
        output_type=ResearchFindings,
    )
    result = await Runner.run(
        agent,
        list(handler_input.run_data.output)
        + [{"role": "user", "content": "Write the report now, from the research above."}],
        max_turns=2,
    )
    return result.final_output_as(ResearchFindings)


def _build_prompt(topic: Topic, research_focus: str | None) -> str:
    prompt = (
        f"Research the {kind_of(topic)} '{topic.name}' for an Indian farmer "
        f"audience.\n\n{brief_for(topic)}"
    )
    if research_focus:
        prompt += f"\n\nThis cycle's planner guidance for this topic: {research_focus}"
    return prompt


async def research_topic(topic: Topic, research_focus: str | None = None) -> ResearchFindings:
    async with _research_mcp_servers() as servers:
        agent = Agent(
            name="Research Agent",
            # The shared India block first, then the role. Every agent in
            # this pipeline gets the same block, so none of them can drift
            # into writing for a different country or a different calendar.
            instructions=f"{dated_context()}\n\n{RESEARCH_INSTRUCTIONS}\n\n{SEARCH_HINT}",
            model=AGENTS_MODEL,
            mcp_servers=servers,
            output_type=ResearchFindings,
        )
        # The brief asks for 2-4 searches, 1-3 fetches, a video and a price
        # lookup — around ten calls when everything answers first time. It
        # often doesn't: government portals return 403 to a non-browser agent,
        # and each retry costs a turn. At 20 the ceiling was landing on real
        # topics ("Max turns (20) exceeded" on crop/coffee), which throws away
        # the research already done rather than settling for it.
        result = await Runner.run(
            agent,
            _build_prompt(topic, research_focus),
            max_turns=30,
            # Reaching the ceiling is now a write-up, not a lost topic.
            error_handlers={"max_turns": _write_up_what_we_have},
        )
        return result.final_output_as(ResearchFindings)
