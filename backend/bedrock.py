"""Amazon Bedrock: the one place this backend talks to a language model on AWS.

Three callers share it — the research agents (through `agents/bedrock_model.py`),
the farmer chat, and the answer step of document Q&A — so retry policy, timeouts
and the treatment of Nova's reasoning tags are decided once.

Credentials are boto3's ordinary chain and nothing else: the ECS task role on
Fargate, the function role on Lambda, a profile or keys locally, or a Bedrock API
key in `AWS_BEARER_TOKEN_BEDROCK`. No secret is read here, which is the point of
moving the model onto the same account as everything else.
"""

from __future__ import annotations

import logging
import re
from functools import lru_cache
from typing import Any, Iterator

from .config import BEDROCK_REGION

logger = logging.getLogger("agrosense.bedrock")


class BedrockUnavailable(RuntimeError):
    """Bedrock could not be reached or refused the request.

    Carries a message fit for a log line, never a stack of botocore internals;
    the API layer turns it into a 503 with its own farmer-facing wording.
    """


@lru_cache(maxsize=1)
def runtime_client() -> Any:
    """A `bedrock-runtime` client, built once per process.

    Adaptive retries because Bedrock throttles per account and per model, and a
    research sweep issues bursts of calls: backing off is the correct answer to
    a 429, not a failed topic. The read timeout is generous because a Converse
    call that writes a full report can legitimately take a minute.
    """
    import boto3
    from botocore.config import Config

    return boto3.client(
        "bedrock-runtime",
        region_name=BEDROCK_REGION,
        config=Config(
            retries={"max_attempts": 8, "mode": "adaptive"},
            connect_timeout=10,
            read_timeout=180,
        ),
    )


#: Nova writes its chain of thought between these tags when it is using tools.
#: It is working, not answer: it never reaches a farmer or a stored report.
_THINKING = re.compile(r"<thinking>.*?</thinking>", re.DOTALL | re.IGNORECASE)


def strip_thinking(text: str) -> str:
    return _THINKING.sub("", text or "").strip()


def text_of(response: dict[str, Any]) -> str:
    """The text blocks of a Converse response, joined, with reasoning removed."""
    blocks = response.get("output", {}).get("message", {}).get("content", [])
    return strip_thinking("\n".join(b["text"] for b in blocks if "text" in b))


def _error_message(exc: Exception) -> str:
    response = getattr(exc, "response", None) or {}
    error = response.get("Error", {})
    code, message = error.get("Code"), error.get("Message")
    return f"{code}: {message}" if code else str(exc)


def converse(**kwargs: Any) -> dict[str, Any]:
    """`bedrock-runtime.converse`, with errors turned into `BedrockUnavailable`."""
    from botocore.exceptions import BotoCoreError, ClientError

    try:
        return runtime_client().converse(**kwargs)
    except (ClientError, BotoCoreError) as exc:
        raise BedrockUnavailable(_error_message(exc)) from exc


def converse_stream(**kwargs: Any) -> Iterator[dict[str, Any]]:
    """`converse_stream`, yielding the raw events.

    The stream is opened before the first yield, so a refused request (bad
    model id, missing permission) raises here rather than after a farmer has
    already been shown a typing indicator.
    """
    from botocore.exceptions import BotoCoreError, ClientError

    try:
        stream = runtime_client().converse_stream(**kwargs)["stream"]
    except (ClientError, BotoCoreError) as exc:
        raise BedrockUnavailable(_error_message(exc)) from exc
    try:
        yield from stream
    except (ClientError, BotoCoreError) as exc:
        raise BedrockUnavailable(_error_message(exc)) from exc


__all__ = [
    "BedrockUnavailable",
    "converse",
    "converse_stream",
    "runtime_client",
    "strip_thinking",
    "text_of",
]
