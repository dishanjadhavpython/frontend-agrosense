"""MCP server #1: general web search (no API key required).

Wraps DuckDuckGo text search via the `ddgs` package so the Research agent
can discover current articles, news, and government pages for a topic
before deciding what to read in full with the fetch server.
"""
from __future__ import annotations

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("agrosense-web-search")


@mcp.tool()
def web_search(query: str, max_results: int = 5) -> list[dict[str, str]]:
    """Search the web and return up to `max_results` results, each with
    a title, url, and short snippet. Use this to discover current sources
    (news, government portals, agricultural extension sites) before
    fetching any of them in full."""
    from ddgs import DDGS  # imported lazily so a missing/broken install of
    # this optional dependency doesn't prevent the rest of the app from
    # importing this module.

    max_results = max(1, min(int(max_results), 10))
    try:
        # `timeout` is per HTTP request, and ddgs tries several search backends
        # in turn, so the worst case is a multiple of this rather than this.
        # Kept modest for that reason: the caller's MCP session timeout is the
        # only other thing standing between a wedged backend and a lost topic.
        raw_results = DDGS(timeout=8).text(query, max_results=max_results)
    except Exception as exc:
        return [{"error": f"Web search failed: {exc}"}]

    return [
        {
            "title": str(item.get("title", "")),
            "url": str(item.get("href", "")),
            "snippet": str(item.get("body", "")),
        }
        for item in raw_results
    ]


if __name__ == "__main__":
    mcp.run(transport="stdio")
