from __future__ import annotations

import unittest
from unittest import mock

from backend.agents.mcp_servers import search_backends

"""
The research agent's web search, from a data-centre address.

Probed from the AWS task: ddgs's own rotation answers plain queries and not
`site:` ones, yahoo the other way round, and google and mojeek refuse
outright. The search walks an explicit order and returns the first engine
that finds something.
"""


class FakeDDGS:
    """Stands in for `ddgs.DDGS`, answering per engine."""

    calls: list[str] = []
    answers: dict[str, object] = {}

    def __init__(self, timeout: int = 8) -> None:
        pass

    def text(self, query: str, max_results: int = 5, backend: str = "auto"):
        FakeDDGS.calls.append(backend)
        answer = FakeDDGS.answers.get(backend, [])
        if isinstance(answer, Exception):
            raise answer
        return answer


def run(query: str, answers: dict[str, object]):
    FakeDDGS.calls, FakeDDGS.answers = [], answers
    with mock.patch("ddgs.DDGS", FakeDDGS):
        return search_backends.search(query, 5), list(FakeDDGS.calls)


HIT = [{"title": "t", "href": "https://farmer.in/x", "body": "b"}]


class SearchOrder(unittest.TestCase):
    def test_plain_queries_go_to_the_rotation_first(self) -> None:
        found, calls = run("groundnut sowing window", {"auto": HIT})
        self.assertEqual(found, HIT)
        self.assertEqual(calls, ["auto"])

    def test_site_queries_go_to_yahoo_first(self) -> None:
        found, calls = run("urea buy (site:bighaat.com)", {"yahoo": HIT})
        self.assertEqual(calls[0], "yahoo")
        self.assertEqual(found, HIT)

    def test_a_refusal_falls_through_to_the_next_engine(self) -> None:
        found, calls = run(
            "groundnut sowing window",
            {"auto": RuntimeError("No results found."), "yahoo": [], "duckduckgo": HIT},
        )
        self.assertEqual(found, HIT)
        self.assertEqual(calls, ["auto", "yahoo", "duckduckgo"])

    def test_engines_that_always_refuse_aws_are_never_asked_for(self) -> None:
        _, plain = run("anything", {})
        _, site = run("x (site:bighaat.com)", {})
        for calls in (plain, site):
            self.assertNotIn("google", calls)
            self.assertNotIn("mojeek", calls)
            self.assertNotIn("bing", calls)  # not a text engine in this ddgs

    def test_every_engine_failing_raises_so_the_tool_can_say_so(self) -> None:
        refusals = {b: RuntimeError("403") for b in search_backends.PLAIN_ORDER}
        with self.assertRaises(RuntimeError):
            run("anything", refusals)

    def test_nothing_found_is_an_empty_answer_not_an_error(self) -> None:
        found, _ = run("anything", {})
        self.assertEqual(found, [])


if __name__ == "__main__":
    unittest.main()
