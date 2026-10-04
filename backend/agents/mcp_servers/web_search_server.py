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
    # Imported lazily so a missing or broken install of `ddgs` doesn't stop
    # the rest of the app importing this module.
    from .search_backends import search

    max_results = max(1, min(int(max_results), 10))
    try:
        # An explicit engine order with a time budget, not ddgs's own
        # rotation — see `search_backends.py` for what AWS addresses get back.
        raw_results = search(query, max_results)
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
