"""Which model the research agents run on — decided once, here.

Every agent asks `agent_model()` rather than naming a model itself, so moving the
pipeline between providers is one environment variable (`AGROSENSE_LLM_PROVIDER`)
and not five edits that could disagree with each other.
"""

from __future__ import annotations

from typing import Any

from ..config import AGENTS_MODEL, BEDROCK_MODEL_ID, LLM_PROVIDER

#: The name recorded on every stored report, so a report says what wrote it.
AGENT_MODEL_NAME = BEDROCK_MODEL_ID if LLM_PROVIDER == "bedrock" else AGENTS_MODEL


def agent_model() -> Any:
    """A model instance for Bedrock, or the model name the SDK resolves for OpenAI."""
    if LLM_PROVIDER == "bedrock":
        from .bedrock_model import BedrockConverseModel

        return BedrockConverseModel(BEDROCK_MODEL_ID)
    return AGENTS_MODEL


if LLM_PROVIDER == "bedrock":
    # The SDK exports every run's trace to OpenAI's platform by default. On
    # Bedrock there is no OpenAI key to export with, and the prompts — which
    # crops a farmer was told to grow — have no business leaving AWS anyway.
    from agents import set_tracing_disabled

    set_tracing_disabled(True)
