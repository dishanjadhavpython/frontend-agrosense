from __future__ import annotations

import unittest
from unittest import mock

from backend.agents import queue
from backend.agents.topics import Topic

"""
The queue that starts when a farmer hits Predict.

It sits in the request path, so the properties that matter are not "does it
research" but "can it hurt the prediction": it must not block, must not raise,
and must not let one click start nine agent runs.
"""

PREDICTED = {
    "soil": ["black"],
    "crop": ["cotton", "maize", "coffee"],
    "fertilizer": ["urea", "28-28"],
}


class RequestNow(unittest.TestCase):
    def setUp(self) -> None:
        queue._inflight.clear()
        queue._last_decline = None

    def tearDown(self) -> None:
        queue._inflight.clear()

    def test_disabled_agents_decline_immediately(self) -> None:
        """The state this repo ships in without a key — and the state it was in
        with an exhausted one. It must return, not raise, and it must say why:
        an out-of-credit account previously looked exactly like an idle queue
        from every surface the product has."""
        with mock.patch.object(queue, "AGENTS_ENABLED", False):
            result = queue.request_now(PREDICTED)

        self.assertEqual(result["started"], [])
        self.assertIn("reason", result)
        self.assertIsNotNone(queue.snapshot()["last_decline"])

    def test_it_never_exceeds_the_inflight_cap(self) -> None:
        """One prediction names nine topics. Without a ceiling that is nine
        concurrent agent runs, each spawning five MCP subprocesses."""
        started: list[Topic] = []
        with mock.patch.object(queue, "AGENTS_ENABLED", True), \
             mock.patch.object(queue.demand, "_age_hours", return_value=float("inf")), \
             mock.patch.object(queue, "_executor") as executor:
            executor.return_value.submit.side_effect = lambda _fn, topic: started.append(topic)
            result = queue.request_now(PREDICTED)

        self.assertLessEqual(len(result["started"]), queue.AGENTS_MAX_INFLIGHT)
        self.assertTrue(any("queue full" in s for s in result["skipped"]))

    def test_the_soil_and_top_crop_go_first(self) -> None:
        """Ordering is the whole point of the cap. What a farmer taps first is
        the soil and their best crop; the rest can wait for the sweep."""
        with mock.patch.object(queue, "AGENTS_ENABLED", True), \
             mock.patch.object(queue.demand, "_age_hours", return_value=float("inf")), \
             mock.patch.object(queue, "_executor"):
            result = queue.request_now(PREDICTED)

        self.assertEqual(result["started"][0], "soil/black")
        self.assertEqual(result["started"][1], "crop/cotton")

    def test_a_fresh_topic_is_not_researched_again(self) -> None:
        """Two farmers predicting cotton within a minute is one run, not two."""
        with mock.patch.object(queue, "AGENTS_ENABLED", True), \
             mock.patch.object(queue.demand, "_age_hours", return_value=0.5), \
             mock.patch.object(queue, "_executor"):
            result = queue.request_now(PREDICTED)

        self.assertEqual(result["started"], [])
        self.assertTrue(all("fresh" in s for s in result["skipped"]))

    def test_an_unknown_name_is_skipped_not_crashed(self) -> None:
        """The crop model can return a label the topic universe has no page
        for. That is a no-op here, not an exception in the request path."""
        with mock.patch.object(queue, "AGENTS_ENABLED", True), \
             mock.patch.object(queue.demand, "_age_hours", return_value=float("inf")), \
             mock.patch.object(queue, "_executor"):
            result = queue.request_now({"crop": ["not-a-real-crop"]})

        self.assertEqual(result["started"], [])

    def test_a_broken_executor_does_not_propagate(self) -> None:
        """This is called from `/api/predict`. Whatever goes wrong here, the
        farmer still gets their prediction."""
        with mock.patch.object(queue, "AGENTS_ENABLED", True), \
             mock.patch.object(queue.demand, "_age_hours", return_value=float("inf")), \
             mock.patch.object(queue, "_executor", side_effect=RuntimeError("pool is gone")):
            result = queue.request_now(PREDICTED)

        self.assertEqual(result["started"], [])
        self.assertTrue(all("could not start" in s for s in result["skipped"]))
        # And nothing is left marked in-flight that will never finish.
        self.assertEqual(queue.snapshot()["inflight"], [])


if __name__ == "__main__":
    unittest.main()
