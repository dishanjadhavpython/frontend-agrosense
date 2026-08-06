from __future__ import annotations

from pydantic import BaseModel, Field


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
        description="Qualitative price/demand trend notes. Never invent specific numeric prices; only report figures actually found in a source.",
    )
    sources: list[SourceRef] = Field(default_factory=list)
    youtube_links: list[YoutubeRef] = Field(default_factory=list)


class TopicReport(BaseModel):
    """Structured output of the Creator agent -- the polished, farmer-facing
    report that gets stored and served to the frontend."""

    title: str
    overview: str
    key_facts: list[str] = Field(default_factory=list)
    new_developments: list[str] = Field(default_factory=list)
    government_schemes: list[GovernmentScheme] = Field(default_factory=list)
    market_notes: str = ""
    youtube_resources: list[YoutubeRef] = Field(default_factory=list)
    sources: list[SourceRef] = Field(default_factory=list)


class ReviewResult(BaseModel):
    """Structured output of the Reviewer agent -- a quality gate over the
    Creator's report before it's published."""

    approved: bool = Field(description="True if the report is accurate, well-sourced, and safe to publish as-is.")
    concerns: list[str] = Field(
        default_factory=list,
        description="Specific problems found: unsupported claims, missing citations, suspicious specifics, etc.",
    )
