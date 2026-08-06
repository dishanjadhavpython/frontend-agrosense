"""MCP server #3: find YouTube video resources for a topic.

If YOUTUBE_API_KEY is configured (YouTube Data API v3, free tier), this
returns real video results (title, channel, url, thumbnail). Without a
key it degrades to a single YouTube search-results link for the query, so
report generation still works end to end with nothing but the required
OPENAI_API_KEY -- the Data API key only upgrades link quality.
"""
from __future__ import annotations

from urllib.parse import quote_plus

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("agrosense-youtube")

_SEARCH_ENDPOINT = "https://www.googleapis.com/youtube/v3/search"


@mcp.tool()
def search_youtube(query: str, max_results: int = 3) -> list[dict[str, str]]:
    """Find YouTube videos relevant to `query`. Returns a list of
    {title, url, channel} dicts. If no YouTube Data API key is configured,
    returns a single generic search-results link instead of specific
    videos -- still usable as a "watch more" resource in a report."""
    # Imported lazily so this module can be listed/introspected even before
    # the rest of the backend package (and its heavier deps) is available.
    from ...config import YOUTUBE_API_KEY

    max_results = max(1, min(int(max_results), 5))

    if not YOUTUBE_API_KEY:
        return [
            {
                "title": f"YouTube search results for: {query}",
                "url": f"https://www.youtube.com/results?search_query={quote_plus(query)}",
                "channel": "",
                "note": "YOUTUBE_API_KEY not configured; showing a search link instead of specific videos.",
            }
        ]

    import httpx

    try:
        response = httpx.get(
            _SEARCH_ENDPOINT,
            params={
                "part": "snippet",
                "q": query,
                "type": "video",
                "maxResults": max_results,
                "safeSearch": "strict",
                "relevanceLanguage": "en",
                "key": YOUTUBE_API_KEY,
            },
            timeout=10,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception as exc:
        return [{"error": f"YouTube search failed: {exc}"}]

    results = []
    for item in payload.get("items", []):
        video_id = item.get("id", {}).get("videoId")
        snippet = item.get("snippet", {})
        if not video_id:
            continue
        results.append(
            {
                "title": str(snippet.get("title", "")),
                "url": f"https://www.youtube.com/watch?v={video_id}",
                "channel": str(snippet.get("channelTitle", "")),
            }
        )
    return results


if __name__ == "__main__":
    mcp.run(transport="stdio")
