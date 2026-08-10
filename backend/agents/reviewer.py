from __future__ import annotations

from agents import Agent, Runner

from ..config import AGENTS_MODEL
from .context import dated_context
from .schemas import ReviewResult, TopicReport
from .sources import audit, classify
from .topics import Topic

REVIEWER_INSTRUCTIONS = """
You are the Reviewer Agent for AgroSense, a quality gate over farmer-facing
agriculture content before it's published. You did not write this report
and have no other information beyond what's given to you -- you're
checking internal consistency and sourcing discipline, not verifying facts
against the live internet.

A source audit is included with the report. It classifies every URL:

  authoritative  *.gov.in / *.nic.in and named national bodies. Only these
                 may support a government scheme, a subsidy, an MSP or a price.
  institutional  Agricultural universities, ICAR institutes, KVKs. These may
                 support agronomy: techniques, varieties, management practice.
  media          Indian agricultural media. News of a new variety only.
  rejected       Everything else, including every non-Indian domain.

Reject (approved=false) if any of these are true:
- A government scheme is listed and the audit shows NO authoritative source.
- A specific price, MSP or subsidy figure appears anywhere and the audit shows
  no authoritative source, or the figure has no date attached.
- A named variety, breed or formulation has no source at all.
- `market_notes` states a specific number that is not also in `prices`.
- `key_facts` or `overview` contain suspiciously specific claims -- exact
  dates, exact statistics -- that aren't grounded in `sources`.
- Advice is not applicable in India: a sowing window from the wrong
  hemisphere, imperial units, a subsidy programme from another country, or a
  technique requiring equipment an Indian smallholder would not have.
- The report is generic filler that doesn't actually mention the topic.

Otherwise approve. List every concern you find, even on an approved report,
in `concerns`. Be specific about which field is at fault -- a downstream
revision pass has to act on what you write.
""".strip()


def _build_prompt(topic: Topic, report: TopicReport) -> str:
    urls = [source.url for source in report.sources]
    grouped = audit(urls)

    lines = ["Source audit:"]
    for tier in ("authoritative", "institutional", "media", "rejected"):
        entries = grouped[tier] or ["(none)"]
        lines.append(f"  {tier}:")
        lines.extend(f"    - {entry}" for entry in entries)

    scheme_urls = [scheme.url for scheme in report.government_schemes if scheme.url]
    if scheme_urls:
        lines.append("\nGovernment scheme links, with tier:")
        for url in scheme_urls:
            lines.append(f"    - [{_tier_name(url)}] {url}")

    return (
        f"Topic: {topic.label} ({topic.category})\n\n"
        f"{chr(10).join(lines)}\n\n"
        f"Report to review (JSON):\n{report.model_dump_json(indent=2)}"
    )


def _tier_name(url: str) -> str:
    classification = classify(url)
    return {1: "authoritative", 2: "institutional", 3: "media", 9: "rejected"}[
        classification.tier
    ]


def strip_unsourced_claims(report: TopicReport) -> tuple[TopicReport, list[str]]:
    """Delete what the source policy does not allow, before a human sees it.

    The agent gets the last word on wording; it does not get the last word on
    whether an unsourced government scheme is published. A model asked to
    self-censor will sometimes decide a scheme is well known enough to keep,
    and "well known" is exactly how an expired subsidy reaches a farmer.

    Returns the cleaned report and a note of everything removed, so the
    removal shows up in `concerns` rather than happening silently.
    """
    removed: list[str] = []

    kept_schemes = []
    for scheme in report.government_schemes:
        if scheme.url and classify(scheme.url).may_support_official_claims:
            kept_schemes.append(scheme)
        else:
            removed.append(
                f"Dropped scheme '{scheme.name}': no *.gov.in / *.nic.in source "
                f"({scheme.url or 'no URL'})."
            )

    kept_sources = []
    for source in report.sources:
        if classify(source.url).usable:
            kept_sources.append(source)
        else:
            removed.append(f"Dropped source outside India: {source.url}")

    if not removed:
        return report, []

    cleaned = report.model_copy(
        update={"government_schemes": kept_schemes, "sources": kept_sources}
    )
    return cleaned, removed


async def review_report(topic: Topic, report: TopicReport) -> ReviewResult:
    result = await Runner.run(
        Agent(
            name="Reviewer Agent",
            instructions=f"{dated_context()}\n\n{REVIEWER_INSTRUCTIONS}",
            model=AGENTS_MODEL,
            output_type=ReviewResult,
        ),
        _build_prompt(topic, report),
        max_turns=6,
    )
    return result.final_output_as(ReviewResult)
