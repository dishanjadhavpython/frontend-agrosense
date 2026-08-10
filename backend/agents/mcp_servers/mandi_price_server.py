"""MCP server #4: government mandi prices, from data.gov.in.

The other three servers hand the agent web pages to read. This one hands it
numbers, and that difference is deliberate.

A price is the most consequential figure on a crop page — it is what a farmer
decides to sell against — and it is the figure a language model is least
equipped to produce. It goes stale in days, it varies by mandi, and a model
reading a price off an HTML table has no way to signal that it read the wrong
column. The Research agent's own instructions already forbid it from writing a
number it did not see in a source, which is the right instinct; this makes that
instruction easy to follow by giving it real numbers.

Source: the Agmarknet daily market price resource published on data.gov.in by
the Directorate of Marketing & Inspection. Records carry the mandi, the date and
min/max/modal price in Rs per quintal.

Needs a free API key (`DATA_GOV_IN_API_KEY`). Without one this returns a clear
`available: false` rather than an empty list, so the agent can state that
government price data was unavailable instead of quietly omitting the section —
"no prices found" and "we could not ask" are different facts.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("agrosense-mandi-prices")

#: Agmarknet "Current Daily Price of Various Commodities from Various Markets"
RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070"
API_ROOT = "https://api.data.gov.in/resource"

#: The crop model's labels are not always what a mandi calls the commodity.
COMMODITY_ALIASES = {
    "rice": "Paddy(Dhan)(Common)",
    "maize": "Maize",
    "chickpea": "Bengal Gram(Gram)(Whole)",
    "pigeonpeas": "Arhar (Tur/Red Gram)(Whole)",
    "mungbean": "Green Gram (Moong)(Whole)",
    "blackgram": "Black Gram (Urd Beans)(Whole)",
    "lentil": "Lentil (Masur)(Whole)",
    "kidneybeans": "Rajmash Kholar",
    "mothbeans": "Moth Beans",
    "cotton": "Cotton",
    "jute": "Jute",
    "banana": "Banana",
    "mango": "Mango",
    "grapes": "Grapes",
    "pomegranate": "Pomegranate",
    "orange": "Orange",
    "papaya": "Papaya",
    "apple": "Apple",
    "coconut": "Coconut",
    "coffee": "Coffee",
    "watermelon": "Water Melon",
    "muskmelon": "Musk Melon",
}


def _resolve(commodity: str) -> str:
    key = commodity.strip().lower()
    return COMMODITY_ALIASES.get(key, commodity.strip().title())


@mcp.tool()
def mandi_prices(
    commodity: str,
    state: str = "Maharashtra",
    limit: int = 20,
) -> dict[str, Any]:
    """Government-recorded mandi prices for a crop.

    Returns records with the market name, arrival date, and min/max/modal
    price in Rs per quintal, straight from the Agmarknet resource on
    data.gov.in. Use this for every crop rather than searching the web for a
    price — these are dated, attributable and current.

    `available: false` means the price API could not be reached or no key is
    configured. Say so in the report; do not substitute a remembered figure.
    """
    # Read through config, not `os.environ`. This module runs as an MCP stdio
    # *subprocess*, and the MCP client hands a child only HOME, LOGNAME, PATH,
    # SHELL and USER — a key exported into the service's environment never
    # arrives here. config reads the `.env` file itself, so it does.
    #
    # Imported lazily, like the YouTube server does, so the module stays
    # introspectable without the rest of the backend package loaded.
    from ...config import DATA_GOV_IN_API_KEY

    import httpx

    api_key = DATA_GOV_IN_API_KEY
    if not api_key:
        return {
            "available": False,
            "reason": (
                "DATA_GOV_IN_API_KEY is not configured on this server, so "
                "government price data could not be requested."
            ),
            "records": [],
        }

    resolved = _resolve(commodity)
    params = {
        "api-key": api_key,
        "format": "json",
        "limit": max(1, min(int(limit), 100)),
        "filters[State.keyword]": state,
        "filters[Commodity.keyword]": resolved,
    }

    try:
        response = httpx.get(f"{API_ROOT}/{RESOURCE_ID}", params=params, timeout=20.0)
        response.raise_for_status()
        payload = response.json()
    except Exception as exc:
        return {
            "available": False,
            "reason": f"Government price API request failed: {exc}",
            "records": [],
        }

    records = []
    for row in payload.get("records", []):
        try:
            records.append(
                {
                    "commodity": str(row.get("Commodity", resolved)),
                    "variety": str(row.get("Variety", "")),
                    "market": str(row.get("Market", "")),
                    "district": str(row.get("District", "")),
                    "state": str(row.get("State", state)),
                    "arrival_date": str(row.get("Arrival_Date", "")),
                    "min_price": float(row.get("Min_Price") or 0),
                    "max_price": float(row.get("Max_Price") or 0),
                    "modal_price": float(row.get("Modal_Price") or 0),
                    "unit": "Rs per quintal",
                }
            )
        except (TypeError, ValueError):
            continue

    if not records:
        # A real answer, not a failure: this crop genuinely may not have traded
        # in this state recently. Widening to all-India is the agent's call.
        return {
            "available": True,
            "records": [],
            "note": (
                f"No recent Agmarknet arrivals for '{resolved}' in {state}. "
                "The crop may not be traded there, or the mandi name may differ."
            ),
            "source_url": "https://agmarknet.gov.in/",
            "queried": {"commodity": resolved, "state": state},
        }

    return {
        "available": True,
        "records": records,
        "source_url": "https://agmarknet.gov.in/",
        "resource": f"data.gov.in resource {RESOURCE_ID}",
        "queried": {"commodity": resolved, "state": state},
        "as_of": date.today().isoformat(),
    }


@mcp.tool()
def fertilizer_price_sources() -> dict[str, Any]:
    """Where subsidised fertilizer MRP is published.

    Deliberately not a scraper. Fertilizer MRP is set nationally under the
    Nutrient Based Subsidy scheme and changes by notification, not daily, so
    the right move is to read the current notification rather than poll an
    endpoint. This points the agent at the official pages to fetch_url.
    """
    return {
        "note": (
            "Subsidised MRP for P&K fertilizers is fixed under Nutrient Based "
            "Subsidy and changes by notification. Urea MRP is statutorily "
            "controlled. Fetch these pages for the current figure and cite the "
            "notification date alongside any price you report."
        ),
        "sources": [
            {"title": "Department of Fertilizers", "url": "https://www.fert.nic.in/"},
            {
                "title": "Department of Fertilizers - notifications",
                "url": "https://www.fert.nic.in/notifications",
            },
            {"title": "Ministry of Chemicals and Fertilizers", "url": "https://chemicals.nic.in/"},
        ],
        "as_of": date.today().isoformat(),
    }


if __name__ == "__main__":
    mcp.run(transport="stdio")
