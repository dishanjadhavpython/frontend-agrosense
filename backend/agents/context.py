from __future__ import annotations

from datetime import date

"""
The context every agent shares.

One constant, prepended to all four agents' instructions, because Planner,
Research, Creator and Reviewer working from four different ideas of the
audience is how a pipeline produces a report about Iowa maize for a farmer in
Palghar. The Planner already reasons about India's cropping calendar; this puts
the same calendar in front of the other three.

It is written as constraints rather than preferences on purpose. "Prefer Indian
sources" is a suggestion, and a model under pressure to fill a
`government_schemes` field will satisfy a suggestion with a US extension page.
What actually holds the line is `sources.py`, which classifies domains and lets
the Reviewer reject a report — but the instruction has to agree with the gate,
or the model spends its turns producing things that will be thrown away.
"""

INDIA_CONTEXT = """
AUDIENCE AND SCOPE — this applies to everything you produce.

AUDIENCE   Smallholder farmers in India, typically 1-5 acres, often reading
           through a translator or an extension worker. Maharashtra first:
           this product is Marathi-first and its reference Soil Health Card
           comes from Palghar district.

GEOGRAPHY  India only. A technique that needs machinery, credit, subsidies or
           a climate an Indian smallholder does not have is not relevant here,
           however well it works elsewhere. If the only material you can find
           is non-Indian, leave the field empty and say so — an empty section
           is honest, a foreign one is misleading.

SEASONS    Anchor all timing to India's cropping calendar:
             Kharif  ~June-October   (monsoon sown)
             Rabi    ~October-March  (winter sown)
             Zaid    ~March-June     (summer, irrigated)
           Never to Northern-hemisphere temperate seasons.

UNITS      Hectare and acre. Quintal (100 kg) and tonne. kg/ha for nutrients.
           Rupees, written as Rs. or INR. Never lb/acre, never bushels, never
           dollars.

BODIES     ICAR and its institutes, Krishi Vigyan Kendras (KVK), state
           agricultural universities, ATMA, state agriculture departments,
           Agmarknet, e-NAM, the Department of Fertilizers.

LANGUAGE   Plain English a translator can carry into Marathi. Short sentences.
           No academic hedging, no marketing copy. Name the thing and say what
           to do about it.

EXCLUDE    US/EU agronomy, non-Indian subsidy programmes, imperial units,
           any scheme an Indian farmer cannot actually apply for, and any
           product recommendation that reads as advertising.
""".strip()


def dated_context() -> str:
    """The shared block plus today's date and the current season, so every
    agent agrees on what "this season" means without being told separately."""
    today = date.today()
    return f"{INDIA_CONTEXT}\n\nTODAY      {today.isoformat()} — {current_season(today)}."


def current_season(today: date | None = None) -> str:
    """Which of India's three cropping seasons we are in, plainly stated.

    Approximate by design: the boundaries shift with the monsoon's arrival and
    vary by region, and a farmer reading "Kharif (monsoon sowing)" is being
    told the useful thing. A precise date range would be precisely wrong in
    half the country.
    """
    month = (today or date.today()).month
    if 6 <= month <= 10:
        return "Kharif season (monsoon sowing, ~June-October)"
    if month >= 11 or month <= 3:
        return "Rabi season (winter sowing, ~October-March)"
    return "Zaid season (summer, irrigated, ~March-June)"
