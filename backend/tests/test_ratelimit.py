from __future__ import annotations

import unittest
from unittest import mock

from backend import ratelimit

"""
The ceiling on what one account can spend.

`/api/predict` starts research agents against a paid OpenAI key and `/api/card`
runs OCR. Both were unlimited. The limiter is per Clerk user rather than per IP
on purpose — a signed-in user on a mobile network changes address every few
minutes, and several farmers in one village share a CGNAT address, so an
IP-based ceiling would both miss the abuse and block the village.
"""


class TheLocalFallback(unittest.TestCase):
    """What runs on a developer machine, and in production only if the table
    was never configured — which `configured()` reports so `/api/health` can
    say so out loud."""

    def setUp(self) -> None:
        ratelimit._local = ratelimit._LocalCounter()

    def test_it_allows_up_to_the_limit_then_refuses(self) -> None:
        limit = ratelimit.LIMITS["predict"]
        for _ in range(limit):
            self.assertTrue(ratelimit.check("user_a", "predict").allowed)
        self.assertFalse(ratelimit.check("user_a", "predict").allowed)

    def test_remaining_counts_down(self) -> None:
        first = ratelimit.check("user_b", "card")
        self.assertEqual(first.remaining, ratelimit.LIMITS["card"] - 1)

    def test_users_are_counted_separately(self) -> None:
        """The whole point. One farmer exhausting their day must not lock out
        the next farmer."""
        for _ in range(ratelimit.LIMITS["predict"]):
            ratelimit.check("user_heavy", "predict")
        self.assertFalse(ratelimit.check("user_heavy", "predict").allowed)
        self.assertTrue(ratelimit.check("user_light", "predict").allowed)

    def test_actions_are_counted_separately(self) -> None:
        """Reading twenty cards must not also spend the day's predictions."""
        for _ in range(ratelimit.LIMITS["card"]):
            ratelimit.check("user_c", "card")
        self.assertFalse(ratelimit.check("user_c", "card").allowed)
        self.assertTrue(ratelimit.check("user_c", "predict").allowed)

    def test_an_unknown_action_is_not_limited(self) -> None:
        """Only the paths that cost something are capped. Reading a crop page
        is a file read and throttling it would punish the browsing this
        product wants."""
        self.assertTrue(ratelimit.check("user_d", "browse").allowed)

    def test_a_refusal_carries_a_retry_time(self) -> None:
        """`Retry-After` is what turns "no" into "tomorrow"."""
        for _ in range(ratelimit.LIMITS["ask"]):
            ratelimit.check("user_e", "ask")
        refused = ratelimit.check("user_e", "ask")
        self.assertFalse(refused.allowed)
        self.assertGreater(refused.reset_in, 0)


class TheStoreFailingOpen(unittest.TestCase):
    """A rate limiter that takes the product down with it has done more damage
    than the abuse it guards against — and the WAF layer is still in front."""

    def test_a_broken_store_allows_rather_than_blocks(self) -> None:
        with mock.patch.object(ratelimit, "TABLE_NAME", "agrosense-ratelimit"), \
             mock.patch.object(ratelimit, "_hit_dynamo", side_effect=RuntimeError("no table")):
            decision = ratelimit.check("user_f", "predict")
        self.assertTrue(decision.allowed)

    def test_configured_reports_which_store_is_in_force(self) -> None:
        """The local counter is per-process and resets on deploy. Fine for
        `npm run api`, not fine in production — so it must be visible."""
        with mock.patch.object(ratelimit, "TABLE_NAME", ""):
            self.assertFalse(ratelimit.configured())
        with mock.patch.object(ratelimit, "TABLE_NAME", "agrosense-ratelimit"):
            self.assertTrue(ratelimit.configured())


if __name__ == "__main__":
    unittest.main()
