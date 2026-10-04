from __future__ import annotations

import asyncio
import unittest
from unittest import mock

from backend.agents import pipeline, videos
from backend.agents.schemas import ResearchFindings, ReviewResult, TopicReport, YoutubeRef
from backend.agents.topics import Topic

"""
Every stored report carries a video when one exists.

On Nova Pro the research agent often skips `search_youtube`, so three crop
reports in a row were published with sources and shops and no video. The
pipeline now fills the gap from the YouTube API itself — and must not invent
one, or publish a search-results link as though it were a video.
"""

TOPIC = Topic("crop", "sorghum")
VIDEO = YoutubeRef(title="Rabi jowar sowing", url="https://www.youtube.com/watch?v=abc123", channel="KVK")


def _report() -> TopicReport:
    return TopicReport(title="Sorghum", overview="…")


def _run(findings: ResearchFindings, report: TopicReport, fallback: list[YoutubeRef]):
    saved: dict = {}
    with mock.patch.object(pipeline, "research_topic", mock.AsyncMock(return_value=findings)), \
         mock.patch.object(pipeline, "create_report", mock.AsyncMock(return_value=report)), \
         mock.patch.object(pipeline, "review_report", mock.AsyncMock(return_value=ReviewResult(approved=True, concerns=[]))), \
         mock.patch.object(pipeline, "fallback_videos", return_value=fallback) as fb, \
         mock.patch.object(pipeline.storage, "save_report", side_effect=lambda _t, p: saved.update(p)):
        result = asyncio.run(pipeline.process_topic(TOPIC, None))
    return result, saved, fb


class VideosOnEveryReport(unittest.TestCase):
    def test_the_api_fills_a_report_the_agent_left_without_one(self) -> None:
        result, saved, fb = _run(ResearchFindings(summary="s"), _report(), [VIDEO])
        self.assertEqual(result["status"], "ok")
        fb.assert_called_once_with(TOPIC)
        self.assertEqual(saved["youtube_resources"][0]["url"], VIDEO.url)

    def test_the_agents_own_video_is_kept_and_no_search_is_made(self) -> None:
        mine = YoutubeRef(title="Agent's pick", url="https://www.youtube.com/watch?v=zzz", channel="")
        report = _report()
        report.youtube_resources = [mine]
        _, saved, fb = _run(ResearchFindings(summary="s", youtube_links=[mine]), report, [VIDEO])
        fb.assert_not_called()
        self.assertEqual(saved["youtube_resources"][0]["url"], mine.url)

    def test_a_video_the_creator_dropped_comes_back_from_the_findings(self) -> None:
        found = YoutubeRef(title="Found by research", url="https://www.youtube.com/watch?v=r1", channel="")
        _, saved, fb = _run(ResearchFindings(summary="s", youtube_links=[found]), _report(), [VIDEO])
        fb.assert_not_called()
        self.assertEqual(saved["youtube_resources"][0]["url"], found.url)

    def test_a_search_page_link_is_not_published_as_a_video(self) -> None:
        keyless = [{"title": "YouTube search results for: x", "url": "https://www.youtube.com/results?search_query=x", "channel": ""}]
        with mock.patch("backend.agents.mcp_servers.youtube_server.search_youtube", return_value=keyless):
            self.assertEqual(videos.fallback_videos(TOPIC), [])

    def test_the_query_uses_the_name_a_farmer_searches_by(self) -> None:
        self.assertIn("jowar", videos.video_query(TOPIC))
        self.assertIn("DAP", videos.video_query(Topic("fertilizer", "dap")))


class SamplingFaultsAreRetried(unittest.TestCase):
    def test_a_malformed_tool_call_is_retried_and_others_are_not(self) -> None:
        from backend.agents import bedrock_model
        from backend.bedrock import BedrockUnavailable

        model = bedrock_model.BedrockConverseModel.__new__(bedrock_model.BedrockConverseModel)
        fault = BedrockUnavailable("ModelErrorException: Model produced invalid sequence as part of ToolUse.")
        calls = {"n": 0}

        def flaky(**_kwargs):
            calls["n"] += 1
            if calls["n"] == 1:
                raise fault
            return {"ok": True}

        with mock.patch.object(bedrock_model, "converse", side_effect=flaky), \
             mock.patch.object(bedrock_model.asyncio, "sleep", mock.AsyncMock()):
            self.assertEqual(asyncio.run(model._call({"messages": []})), {"ok": True})
        self.assertEqual(calls["n"], 2)

        denied = BedrockUnavailable("AccessDeniedException: not authorised")
        with mock.patch.object(bedrock_model, "converse", side_effect=denied), \
             mock.patch.object(bedrock_model.asyncio, "sleep", mock.AsyncMock()) as slept:
            with self.assertRaises(BedrockUnavailable):
                asyncio.run(model._call({"messages": []}))
            slept.assert_not_called()


if __name__ == "__main__":
    unittest.main()
