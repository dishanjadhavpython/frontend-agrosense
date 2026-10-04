"""Web search that copes with being run from a data centre.

`ddgs` scrapes public search engines, and those treat an AWS address very
differently from a home connection. Probed from the Fargate task in
ap-south-1 (2026-10-04):

    google, mojeek    403 on every request
    brave             429
    duckduckgo        202 (a challenge page), almost always
    yahoo             `site:` queries answer; plain ones often come back empty
    auto              plain queries answer (ddgs's own rotation); `site:`
                      queries come back empty

So the seller search — the one with `site:` filters — failed from AWS far more
often than not, and the reports said so. This walks an explicit order per kind
of query and returns the first non-empty result, within a time budget so a run
of refusals cannot eat the caller's MCP timeout.

(Not bing: this ddgs release has no bing text engine, and asking for one
quietly falls back to "auto" — which is what an earlier probe really measured.)
"""
from __future__ import annotations

import time
from typing import Any

#: Plain queries: ddgs's own rotation answered them from AWS; yahoo and
#: duckduckgo are the fallbacks.
PLAIN_ORDER = ("auto", "yahoo", "duckduckgo")

#: `site:` queries (the seller search): yahoo answered them from AWS when the
#: rotation did not.
SITE_ORDER = ("yahoo", "auto", "duckduckgo")

#: Well inside the MCP session's 90-second timeout.
BUDGET_SECONDS = 30.0


def search(query: str, max_results: int) -> list[dict[str, Any]]:
    """The first engine's results that are not empty.

    Raises the last engine's error when every engine failed outright, so the
    tool can say the search failed rather than that nothing exists; returns
    `[]` when they answered and simply found nothing.
    """
    from ddgs import DDGS

    order = SITE_ORDER if "site:" in query else PLAIN_ORDER
    started = time.monotonic()
    last: Exception | None = None
    for backend in order:
        if time.monotonic() - started > BUDGET_SECONDS:
            break
        try:
            found = DDGS(timeout=8).text(query, max_results=max_results, backend=backend)
        except Exception as exc:  # noqa: BLE001 - "No results found", 403, timeout
            last = exc
            continue
        if found:
            return found
    if last is not None:
        raise last
    return []
