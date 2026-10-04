"""MCP server #5: where a farmer can actually buy this, online.

The other four servers hand the agent things to read. This one hands it places
to spend money, and that difference is the whole design.

A wrong scheme link wastes somebody's afternoon. A wrong *shop* link takes
their money — and "where can I buy urea online" is a query whose search results
are full of expired listings, drop-shippers and outright counterfeits. A
language model asked to find a shop will find one; it has no way to tell you it
found a bad one.

So the model does not choose the shop. This does:

  * **An allowlist, not a search.** Every result comes from a domain named in
    `ALLOWED` below — established Indian agri-commerce and the two large
    general marketplaces. A URL from anywhere else is dropped, not ranked
    lower. The agent cannot talk its way past this because it never sees the
    rejects.
  * **Verified before returned.** Each candidate is fetched. A 404, a redirect
    off the allowlist, or a page with no title does not get published. A dead
    product link is worse than no link: it reads as neglect.
  * **`available: false` is an answer.** Same contract as
    `mandi_price_server`: "we could not find a listing" and "we did not look"
    are different facts, and the farmer is told which.

Nothing here endorses a seller, and the UI says so next to every link. This
lists places that exist and stock the item; it does not compare prices, rank by
trust, or take a commission — and if any of those ever change, this docstring
is the first thing that should.
"""
from __future__ import annotations

from urllib.parse import urlparse

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("agrosense-sellers")

#: Domain -> the name shown to the farmer. Subdomains are allowed; anything
#: else is not.
#:
#: Each entry is a judgement and should carry its reason:
ALLOWED: dict[str, str] = {
    "bighaat.com": "BigHaat",            # large Indian agri-input marketplace
    "agribegri.com": "AgriBegri",        # agri-input retailer, nationwide
    "iffcobazar.in": "IFFCO eBazar",     # IFFCO's own store — cooperative, subsidised grades
    "dehaat.com": "DeHaat",              # farmer-services network with an input store
    "bharatagri.com": "BharatAgri",      # agronomy app with an input store
    "amazon.in": "Amazon",               # general marketplace; wide stock, variable sellers
    "flipkart.com": "Flipkart",          # general marketplace, same caveat
}

_USER_AGENT = "Mozilla/5.0 (compatible; AgroSenseResearchBot/1.0)"

#: Verification is a HEAD-like GET per candidate and the agent is waiting on
#: it, so the budget is tight. Better to return three checked links than to
#: spend the topic's remaining turns checking eight.
_MAX_CANDIDATES = 8
_MAX_RESULTS = 4


def seller_of(url: str) -> str | None:
    """The allowlisted seller this URL belongs to, or None.

    Matches the registrable domain and its subdomains, and nothing else.
    `notbighaat.com` and `bighaat.com.evil.ru` both fail, which is the point of
    doing this with `urlparse` rather than a substring test.
    """
    try:
        host = (urlparse(url).hostname or "").lower().removeprefix("www.")
    except ValueError:
        return None
    if not host:
        return None
    for domain, name in ALLOWED.items():
        if host == domain or host.endswith(f".{domain}"):
            return name
    return None


def _verify(url: str) -> dict[str, str] | None:
    """Fetch it. A link that does not resolve today does not get published."""
    import httpx
    from lxml import html as lhtml

    try:
        response = httpx.get(
            url,
            timeout=10,
            follow_redirects=True,
            headers={"User-Agent": _USER_AGENT},
        )
    except Exception:
        return None

    if response.status_code != 200:
        return None

    # A redirect can land anywhere. Re-check the *final* URL, not the one we
    # asked for — a shortener or an affiliate hop could otherwise carry the
    # farmer off the allowlist with the allowlist's blessing.
    final_url = str(response.url)
    seller = seller_of(final_url)
    if seller is None:
        return None

    try:
        tree = lhtml.fromstring(response.text)
        titles = tree.xpath("//title/text()")
        title = titles[0].strip() if titles else ""
    except Exception:
        title = ""

    if not title:
        return None

    return {"seller": seller, "title": title[:160], "url": final_url}


@mcp.tool()
def buy_links(item: str, category: str = "fertilizer") -> dict:
    """Find places a farmer can buy this item online in India.

    `item` is a fertilizer grade ("urea", "10-26-26") or a crop whose seed is
    being sought ("cotton"). `category` is "fertilizer" or "crop" and only
    changes the search wording — seed rather than the product itself.

    Returns `{available, links, reason}`. Every link is from an allowlisted
    Indian seller and was fetched successfully at the time of the call. Never
    write a shop URL that did not come from this tool: one that did not is one
    nobody checked.
    """
    from .search_backends import search

    item = (item or "").strip()
    if not item:
        return {"available": False, "links": [], "reason": "No item was given."}

    what = "seeds" if category == "crop" else "fertilizer"
    sites = " OR ".join(f"site:{domain}" for domain in ALLOWED)
    query = f"{item} {what} buy online India ({sites})"

    try:
        raw = search(query, _MAX_CANDIDATES)
    except Exception as exc:
        return {
            "available": False,
            "links": [],
            "reason": f"Seller search failed: {exc}",
        }

    seen: set[str] = set()
    links: list[dict[str, str]] = []

    for result in raw or []:
        url = str(result.get("href", ""))
        if seller_of(url) is None:
            continue  # off the allowlist — dropped, not demoted

        verified = _verify(url)
        if verified is None:
            continue

        # One link per seller. Four listings from the same marketplace is a
        # search result, not a recommendation.
        if verified["seller"] in seen:
            continue
        seen.add(verified["seller"])
        links.append(verified)

        if len(links) >= _MAX_RESULTS:
            break

    if not links:
        return {
            "available": False,
            "links": [],
            "reason": (
                f"No listing for '{item}' could be verified on a known Indian "
                "seller today. Suggest the local agri-input dealer instead."
            ),
        }

    return {
        "available": True,
        "links": links,
        "note": (
            "Verified as reachable, not endorsed. Prices and stock change "
            "daily and were not checked."
        ),
    }


if __name__ == "__main__":
    mcp.run(transport="stdio")
