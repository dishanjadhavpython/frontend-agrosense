from __future__ import annotations

import unittest
from unittest import mock

"""
`POST /api/research` — the door the recommendation board and the detail pages
use to start the agents now rather than at the next sweep.

The queue's own rules (cap, freshness, ordering) are covered in
`test_research_queue.py`. What this file holds is the endpoint's half: it is
rate-limited before anything is started, names the topic list does not know
are dropped rather than passed on, and a ledger failure cannot stop the
research it was only bookkeeping for.
"""

USER = {"id": "user_test"}


class ResearchEndpoint(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        # Imported here so a missing optional dependency fails this class, not
        # the whole test run's collection.
        from backend import app as app_module

        cls.app = app_module

    def call(self, **payload: list[str]) -> dict[str, object]:
        return self.app.research(self.app.ResearchPayload(**payload), user=USER)

    def test_the_limit_is_checked_before_anything_starts(self) -> None:
        with mock.patch.object(self.app, "enforce_limit", side_effect=RuntimeError("429")) as limit, \
             mock.patch.object(self.app.agent_queue, "request_now") as start:
            with self.assertRaises(RuntimeError):
                self.call(crop=["wheat"])
        limit.assert_called_once_with(USER, "research")
        start.assert_not_called()

    def test_unknown_names_are_dropped_and_known_ones_queued(self) -> None:
        with mock.patch.object(self.app, "enforce_limit"), \
             mock.patch.object(self.app.demand, "record") as record, \
             mock.patch.object(
                 self.app.agent_queue, "request_now",
                 return_value={"started": ["crop/wheat"], "skipped": []},
             ) as start:
            result = self.call(crop=["wheat", "not-a-crop"], fertilizer=["urea"])

        asked = start.call_args.args[0]
        self.assertEqual(asked["crop"], ["wheat"])
        self.assertEqual(asked["fertilizer"], ["urea"])
        self.assertEqual(asked["soil"], [])
        record.assert_called_once_with(asked)
        self.assertEqual(result["started"], ["crop/wheat"])
        self.assertIn("enabled", result)

    def test_a_ledger_failure_does_not_stop_the_research(self) -> None:
        with mock.patch.object(self.app, "enforce_limit"), \
             mock.patch.object(self.app.demand, "record", side_effect=OSError("disk")), \
             mock.patch.object(
                 self.app.agent_queue, "request_now",
                 return_value={"started": ["crop/wheat"], "skipped": []},
             ) as start:
            result = self.call(crop=["wheat"])

        start.assert_called_once()
        self.assertEqual(result["started"], ["crop/wheat"])

    def test_a_page_cannot_ask_for_an_unbounded_list(self) -> None:
        from pydantic import ValidationError

        with self.assertRaises(ValidationError):
            self.app.ResearchPayload(crop=[f"crop{i}" for i in range(20)])


if __name__ == "__main__":
    unittest.main()
