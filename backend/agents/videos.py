from __future__ import annotations

from .schemas import YoutubeRef
from .topics import Topic

"""
A video for every report, found by code when the agent brings none.

The research agent is told to call `search_youtube` once, and on Nova Pro it
often doesn't: three crop reports in a row came back with sources, schemes and
shops and no video at all, though the tool answers in under a second. A
farmer opening a crop page is more likely to watch two minutes of a KVK field
demonstration than read anything else on it, so the gap is filled here —
the same rule as `seller_server`: where the model can be skipped without loss,
the code does the choosing.

What it returns is exactly what the tool would have: the YouTube Data API's own
results for a plain query, safe-search strict, Indian region first. Nothing is
ranked or rewritten. Without an API key the tool can only offer a link to a
search page, which is not a video, so that is dropped rather than published as
one.
"""

#: The names a farmer searches by. The topic list keeps one word per crop
#: ("pearlmillet"), which is a fine key and a poor search.
_COMMON: dict[str, str] = {
    "pearlmillet": "pearl millet bajra",
    "fingermillet": "finger millet ragi",
    "sorghum": "sorghum jowar",
    "pigeonpeas": "pigeon pea tur",
    "chickpea": "chickpea gram harbhara",
    "kidneybeans": "rajma kidney beans",
    "mungbean": "moong green gram",
    "blackgram": "urad black gram",
    "mothbeans": "moth bean matki",
    "mustard": "mustard sarson",
    "linseed": "linseed flax",
    "sesame": "sesame til",
    "safflower": "safflower kardai",
}

_WATCH = "https://www.youtube.com/watch?v="


def video_query(topic: Topic) -> str:
    if topic.category == "crop":
        return f"{_COMMON.get(topic.name, topic.name)} farming cultivation India"
    if topic.category == "soil":
        return f"{topic.name} soil management farming India"
    return f"{topic.name.upper()} fertilizer how to use farmers India"


def fallback_videos(topic: Topic, limit: int = 2) -> list[YoutubeRef]:
    """Up to `limit` real videos for this topic, or none. Never raises."""
    from .mcp_servers.youtube_server import search_youtube

    try:
        found = search_youtube(video_query(topic), limit)
    except Exception:  # noqa: BLE001 - a missing video is not a failed report
        return []

    videos: list[YoutubeRef] = []
    for item in found:
        url = str(item.get("url", ""))
        if "error" in item or not url.startswith(_WATCH):
            continue
        videos.append(
            YoutubeRef(
                title=str(item.get("title", "")),
                url=url,
                channel=str(item.get("channel", "")),
            )
        )
    return videos


__all__ = ["fallback_videos", "video_query"]
