"""MCP server #2: fetch a specific URL and return its readable text
(no API key required).

Complements web_search_server: search finds candidate URLs, this pulls
their actual content so the Research agent can cite specifics rather than
just a search-result snippet. Note: this does plain HTTP GET + HTML text
extraction, so it works well for server-rendered pages (articles, blogs,
most government portals) but will return little or nothing useful for
JavaScript-rendered single-page apps, since there's no headless browser
involved.
"""
from __future__ import annotations

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("agrosense-fetch")

_USER_AGENT = "Mozilla/5.0 (compatible; AgroSenseResearchBot/1.0)"
_MAX_CHARS = 6000


@mcp.tool()
def fetch_url(url: str) -> dict[str, str]:
    """Fetch a URL and return its title and readable text content
    (truncated to a few thousand characters). Use this after web_search to
    read a specific promising result in full."""
    import httpx
    from lxml import html as lhtml

    if not (url.startswith("http://") or url.startswith("https://")):
        return {"url": url, "error": "Only http/https URLs are supported."}

    try:
        response = httpx.get(
            url,
            timeout=12,
            follow_redirects=True,
            headers={"User-Agent": _USER_AGENT},
        )
        response.raise_for_status()
    except Exception as exc:
        return {"url": url, "error": f"Fetch failed: {exc}"}

    try:
        tree = lhtml.fromstring(response.text)
    except Exception as exc:
        return {"url": url, "error": f"Could not parse page: {exc}"}

    for unwanted in tree.xpath("//script|//style|//noscript|//nav|//footer"):
        unwanted.drop_tree()

    title_nodes = tree.xpath("//title/text()")
    title = title_nodes[0].strip() if title_nodes else ""
    text = " ".join(tree.text_content().split())

    return {
        "url": url,
        "title": title,
        "text": text[:_MAX_CHARS],
        "truncated": str(len(text) > _MAX_CHARS).lower(),
    }


if __name__ == "__main__":
    mcp.run(transport="stdio")
