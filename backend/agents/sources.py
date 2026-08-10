from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlparse

"""
Which sources are allowed to support which claims.

The Research agent's instructions ask it to prefer Indian sources. This is what
makes that stick: every URL gets a tier, and the Reviewer refuses a report whose
government schemes or prices rest on anything below tier 1.

The distinction matters most for the two fields a farmer would actually act on.
A scheme is a promise of money — if it is not on a .gov.in page, it is either
out of date, misremembered, or not a scheme at all. A price is a number someone
sells a crop against. Agronomy is different in kind: a technique described by an
agricultural university is trustworthy whether or not a ministry has blessed it,
so tier 2 is enough there.

Rejection is not a judgement about the site. A perfectly good Australian
extension page is rejected here because an Australian sowing window is wrong
advice in Palghar, not because the page is bad.
"""


class Tier:
    #: Official. Government of India, state governments, national bodies.
    AUTHORITATIVE = 1
    #: Institutional. Universities, ICAR institutes, KVKs.
    INSTITUTIONAL = 2
    #: Indian agricultural media. News and new developments only.
    MEDIA = 3
    #: Everything else, including every non-Indian domain.
    REJECTED = 9


#: Exact hosts and suffixes that are unambiguously Government of India.
AUTHORITATIVE_SUFFIXES = (
    ".gov.in",
    ".nic.in",
)
AUTHORITATIVE_HOSTS = {
    "agmarknet.gov.in",       # mandi prices
    "enam.gov.in",            # national agriculture market
    "fert.nic.in",            # Department of Fertilizers — subsidised MRP
    "pmkisan.gov.in",
    "agricoop.gov.in",        # Ministry of Agriculture
    "soilhealth.dac.gov.in",  # the Soil Health Card scheme itself
    "data.gov.in",
    "icar.org.in",
    "icar.gov.in",
    "krishi.icar.gov.in",
    "mahaagri.gov.in",        # Maharashtra agriculture department
    "krishijagran.com",       # widely used extension media; tier 2 in practice
}

#: Universities and research institutes. `.ac.in` is India's academic suffix.
INSTITUTIONAL_SUFFIXES = (
    ".ac.in",
    ".edu.in",
    ".res.in",
)
INSTITUTIONAL_HOSTS = {
    "kvk.icar.gov.in",
    "vasantdada.org",
    "mpkv.ac.in",             # Mahatma Phule Krishi Vidyapeeth
    "bskkv.ac.in",            # Dr Balasaheb Sawant Konkan Krishi Vidyapeeth
    "pdkv.ac.in",
    "vnmkv.ac.in",
}

#: Indian agricultural media. Fine for "a new variety was released"; not for
#: "this scheme pays Rs 6000".
MEDIA_HOSTS = {
    "krishijagran.com",
    "agrifarming.in",
    "thehindubusinessline.com",
    "downtoearth.org.in",
    "ruralvoice.in",
    "agritimes.co.in",
}

#: YouTube is neither a source nor rejected — it is a separate field with its
#: own display treatment, so it is exempted rather than tiered.
VIDEO_HOSTS = {"youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"}


@dataclass(frozen=True)
class Classification:
    url: str
    host: str
    tier: int

    @property
    def is_video(self) -> bool:
        return self.host in VIDEO_HOSTS

    @property
    def may_support_official_claims(self) -> bool:
        """Schemes, subsidies, MSP, government prices."""
        return self.tier == Tier.AUTHORITATIVE

    @property
    def may_support_agronomy(self) -> bool:
        """Techniques, varieties, management practice."""
        return self.tier in (Tier.AUTHORITATIVE, Tier.INSTITUTIONAL)

    @property
    def usable(self) -> bool:
        return self.tier != Tier.REJECTED


def classify(url: str) -> Classification:
    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return Classification(url, "", Tier.REJECTED)

    if not host:
        return Classification(url, "", Tier.REJECTED)

    bare = host[4:] if host.startswith("www.") else host

    if bare in VIDEO_HOSTS or host in VIDEO_HOSTS:
        return Classification(url, bare, Tier.MEDIA)

    if bare in AUTHORITATIVE_HOSTS or host.endswith(AUTHORITATIVE_SUFFIXES):
        # krishijagran is in both sets; media wins for it, since it is a
        # publisher rather than a ministry.
        if bare in MEDIA_HOSTS and not host.endswith(AUTHORITATIVE_SUFFIXES):
            return Classification(url, bare, Tier.MEDIA)
        return Classification(url, bare, Tier.AUTHORITATIVE)

    if bare in INSTITUTIONAL_HOSTS or host.endswith(INSTITUTIONAL_SUFFIXES):
        return Classification(url, bare, Tier.INSTITUTIONAL)

    if bare in MEDIA_HOSTS:
        return Classification(url, bare, Tier.MEDIA)

    # Everything else, including every non-Indian domain. Not a judgement about
    # the site — a sowing window from a different hemisphere is wrong advice
    # here however good the page is.
    return Classification(url, bare, Tier.REJECTED)


def audit(urls: list[str]) -> dict[str, list[str]]:
    """Group a report's sources by tier, for the Reviewer's prompt."""
    grouped: dict[str, list[str]] = {
        "authoritative": [],
        "institutional": [],
        "media": [],
        "rejected": [],
    }
    names = {
        Tier.AUTHORITATIVE: "authoritative",
        Tier.INSTITUTIONAL: "institutional",
        Tier.MEDIA: "media",
        Tier.REJECTED: "rejected",
    }
    for url in urls:
        grouped[names[classify(url).tier]].append(url)
    return grouped


def has_official_backing(urls: list[str]) -> bool:
    """True when at least one source can carry a scheme or a price."""
    return any(classify(url).may_support_official_claims for url in urls)


SEARCH_HINT = """
Prefer these domains, in this order, and say so in your search queries by
adding `site:` filters when a search returns nothing Indian:

  Official   *.gov.in, *.nic.in — agmarknet.gov.in (mandi prices),
             fert.nic.in (fertilizer MRP), soilhealth.dac.gov.in,
             agricoop.gov.in, pmkisan.gov.in, icar.org.in, mahaagri.gov.in
  Academic   *.ac.in agricultural universities, ICAR institutes, KVK portals
  Media      Indian agricultural media — for news of new varieties only

A government scheme or a price with no *.gov.in / *.nic.in source will be
rejected by the Reviewer and the field dropped, so do not spend turns on one
you cannot source officially. Non-Indian domains are not usable at all.
""".strip()
