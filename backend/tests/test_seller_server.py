from __future__ import annotations

import unittest

from backend.agents.mcp_servers.seller_server import ALLOWED, seller_of
from backend.agents.reviewer import strip_unsourced_claims
from backend.agents.schemas import SellerLink, TopicReport

"""
The allowlist, and the two places it is enforced.

A wrong government-scheme link wastes somebody's afternoon. A wrong *shop* link
takes their money, and "buy urea online india" is a query whose results are
full of expired listings and outright fakes. So the model never chooses the
shop: `seller_server` searches a fixed list of domains and the reviewer checks
the same list again on the way out.

These tests are the guard on that. They are deliberately hostile — the
interesting cases are not "does bighaat.com pass" but the four ways a
substring check would have let something through.
"""


class TheAllowlistIsNotASubstringCheck(unittest.TestCase):
    def test_known_sellers_pass(self) -> None:
        for domain, name in ALLOWED.items():
            with self.subTest(domain=domain):
                self.assertEqual(seller_of(f"https://{domain}/products/urea"), name)

    def test_www_and_subdomains_pass(self) -> None:
        self.assertEqual(seller_of("https://www.bighaat.com/x"), "BigHaat")
        self.assertEqual(seller_of("https://seller.amazon.in/x"), "Amazon")

    def test_a_lookalike_domain_is_rejected(self) -> None:
        """`bighaat.com.evil.ru` contains an allowlisted domain as a substring
        and is controlled by whoever owns evil.ru."""
        self.assertIsNone(seller_of("https://bighaat.com.evil.ru/urea"))

    def test_a_prefixed_domain_is_rejected(self) -> None:
        """`notbighaat.com` likewise — the check is on the label boundary."""
        self.assertIsNone(seller_of("https://notbighaat.com/urea"))

    def test_an_unknown_shop_is_rejected(self) -> None:
        self.assertIsNone(seller_of("https://randomshop.in/urea"))

    def test_garbage_does_not_raise(self) -> None:
        for value in ("", "not a url", "javascript:alert(1)", "http://"):
            with self.subTest(value=value):
                self.assertIsNone(seller_of(value))


class TheReviewerEnforcesItAgain(unittest.TestCase):
    """Belt and braces, and worth having: `strip_unsourced_claims` is the last
    code that touches a report before it is published. A shop link reaching it
    from anywhere but the tool is a bug, and it should die there."""

    def test_an_off_allowlist_link_is_stripped(self) -> None:
        report = TopicReport(
            title="Urea",
            overview="",
            where_to_buy=[
                SellerLink(seller="BigHaat", title="Urea 45kg", url="https://www.bighaat.com/p/urea"),
                SellerLink(seller="Anywhere", title="Cheap urea", url="https://scam.example/urea"),
            ],
        )
        cleaned, removed = strip_unsourced_claims(report)

        self.assertEqual([link.url for link in cleaned.where_to_buy],
                         ["https://www.bighaat.com/p/urea"])
        # Removals are reported, never silent — a farmer sees a shorter list
        # and the run records why.
        self.assertTrue(any("unapproved domain" in note for note in removed))

    def test_the_government_rule_still_applies_to_schemes(self) -> None:
        """Shop links get their own gate; schemes must not inherit it. A
        `*.gov.in` test would delete every seller — no ministry sells urea —
        and the reverse, letting a shop domain support a scheme claim, is how
        an expired subsidy reaches somebody."""
        report = TopicReport(
            title="Urea",
            overview="",
            government_schemes=[
                {"name": "NBS", "description": "Subsidy", "url": "https://www.bighaat.com/blog/nbs"},
            ],
        )
        cleaned, removed = strip_unsourced_claims(report)
        self.assertEqual(cleaned.government_schemes, [])
        self.assertTrue(any("Dropped scheme" in note for note in removed))


if __name__ == "__main__":
    unittest.main()
