from __future__ import annotations

import unittest

from backend.agents.reviewer import strip_process_talk
from backend.agents.schemas import TopicReport

"""
What the agents say about their own run never reaches the farmer.

The sentence this exists for was live, on the groundnut page: "Due to tool
errors, specific market prices, varieties, and seed purchase links could not
be retrieved." The page states empty sections itself, in Marathi first.
"""


class ProcessTalk(unittest.TestCase):
    def test_run_narration_is_removed_and_the_topic_is_kept(self) -> None:
        report = TopicReport(
            title="Groundnut",
            overview=(
                "Groundnut is a popular Kharif crop in Maharashtra. "
                "Due to tool errors, specific market prices, varieties, and seed "
                "purchase links could not be retrieved."
            ),
            market_notes="Market prices could not be retrieved due to a tool error.",
            key_facts=[
                "Sow groundnut with the onset of the monsoon.",
                "Government price data was unavailable.",
            ],
        )
        cleaned, removed = strip_process_talk(report)
        self.assertEqual(cleaned.overview, "Groundnut is a popular Kharif crop in Maharashtra.")
        self.assertEqual(cleaned.market_notes, "")
        self.assertEqual(cleaned.key_facts, ["Sow groundnut with the onset of the monsoon."])
        self.assertEqual(len(removed), 3)

    def test_ordinary_agronomy_is_untouched(self) -> None:
        text = (
            "Apply gypsum at pegging. Water stress at flowering cuts yield sharply. "
            "Choose a variety tolerant of leaf spot."
        )
        cleaned, removed = strip_process_talk(TopicReport(title="t", overview=text))
        self.assertEqual(cleaned.overview, text)
        self.assertEqual(removed, [])


if __name__ == "__main__":
    unittest.main()
