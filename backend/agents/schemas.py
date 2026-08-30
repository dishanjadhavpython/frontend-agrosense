from __future__ import annotations

from pydantic import BaseModel, Field


class PriceObservation(BaseModel):
    """One government-recorded market price.

    Populated from the `mandi_prices` tool, which reads the Agmarknet resource
    on data.gov.in -- never typed by the model. A price is the number a farmer
    sells against and it goes stale in days, so it carries its mandi and its
    date or it does not get published.
    """

    commodity: str
    market: str = Field(description="Mandi name.")
    district: str = ""
    state: str = ""
    arrival_date: str = Field(description="Date the price was recorded.")
    min_price: float = 0.0
    max_price: float = 0.0
    modal_price: float = Field(description="The representative price, Rs per quintal.")
    unit: str = "Rs per quintal"


class SourceRef(BaseModel):
    title: str
    url: str


class YoutubeRef(BaseModel):
    title: str
    url: str
    channel: str = ""


class GovernmentScheme(BaseModel):
    name: str
    description: str
    url: str = ""


class SellerLink(BaseModel):
    """One place a farmer can buy this online.

    Populated from the `buy_links` tool and never typed by the model, for the
    same reason `PriceObservation` is not: a wrong shop link takes somebody's
    money. Every field here was read off a page that returned 200 at the time
    of the call, from a domain on the allowlist in `seller_server.py`.
    """

    seller: str = Field(description="The shop's name, from the allowlist.")
    title: str = Field(description="The listing's own page title.")
    url: str


class ResearchFindings(BaseModel):
    """Structured output of the Research agent -- raw gathered material,
    not yet written up as a polished report."""

    summary: str
    key_points: list[str] = Field(default_factory=list)
    new_developments: list[str] = Field(
        default_factory=list,
        description="New crop breeds/varieties, or new fertilizer formulations/variations found during research.",
    )
    government_schemes: list[GovernmentScheme] = Field(default_factory=list)
    market_notes: str = Field(
        default="",
        description="Qualitative price/demand trend notes. Never write a specific numeric price here; numbers belong in `prices`, which comes from the government price API.",
    )
    prices: list[PriceObservation] = Field(
        default_factory=list,
        description="Copied verbatim from the mandi_prices tool. Never hand-written.",
    )
    price_note: str = Field(
        default="",
        description="Set when the price tool returned nothing, explaining why.",
    )
    sources: list[SourceRef] = Field(default_factory=list)
    youtube_links: list[YoutubeRef] = Field(default_factory=list)
    where_to_buy: list[SellerLink] = Field(
        default_factory=list,
        description="Copied verbatim from the buy_links tool. Never hand-written.",
    )
    buy_note: str = Field(
        default="",
        description="Set when the seller tool found nothing, explaining why.",
    )


class TopicReport(BaseModel):
    """Structured output of the Creator agent -- the polished, farmer-facing
    report that gets stored and served to the frontend."""

    title: str
    overview: str
    key_facts: list[str] = Field(default_factory=list)
    new_developments: list[str] = Field(default_factory=list)
    government_schemes: list[GovernmentScheme] = Field(default_factory=list)
    market_notes: str = ""
    #: Straight from the government price API. Empty is a real answer -- it
    #: means the API had nothing or could not be reached, and the page says so
    #: rather than showing a remembered figure.
    prices: list[PriceObservation] = Field(default_factory=list)
    price_note: str = Field(
        default="",
        description="Why prices are absent, when they are. Shown to the farmer.",
    )
    youtube_resources: list[YoutubeRef] = Field(default_factory=list)
    #: Straight from the seller tool, allowlisted and fetch-verified. Empty is
    #: a real answer and the page says so rather than linking somewhere unchecked.
    where_to_buy: list[SellerLink] = Field(default_factory=list)
    buy_note: str = Field(
        default="",
        description="Why there are no links, when there are none. Shown to the farmer.",
    )
    sources: list[SourceRef] = Field(default_factory=list)


class ReviewResult(BaseModel):
    """Structured output of the Reviewer agent -- a quality gate over the
    Creator's report before it's published."""

    approved: bool = Field(description="True if the report is accurate, well-sourced, and safe to publish as-is.")
    concerns: list[str] = Field(
        default_factory=list,
        description="Specific problems found: unsupported claims, missing citations, suspicious specifics, etc.",
    )
