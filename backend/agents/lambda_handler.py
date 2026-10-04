from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger("agrosense.agents")
logging.getLogger().setLevel(logging.INFO)

"""
The research sweep, as a Lambda entrypoint.

EventBridge fires this every thirty minutes. It is the *catch-up* half of the
pipeline: on-demand research already started for whatever the last prediction
returned (see `queue.py`), and this picks up what that capped, skipped, or
never saw because nobody was signed in at the time.

Deliberately thin. Everything it does is `run_pipeline_sync`, which is the same
function the in-process scheduler calls — one code path, so a topic researched
on the timer cannot differ from one researched on demand.
"""


# Optional tool keys (YouTube, data.gov.in) are read from Secrets Manager when
# `backend.config` is first imported — inside `run_pipeline_sync` below — so
# this entrypoint and the Fargate service share one loader.


def handler(event: dict[str, Any] | None = None, context: Any = None) -> dict[str, Any]:
    # Imported inside the handler, not at module scope. A Lambda that fails to
    # import shows up as an opaque `Runtime.ImportModuleError` with no
    # traceback in the logs; failing inside the handler gives a real one.
    from .pipeline import run_pipeline_sync

    batch = int(os.getenv("AGROSENSE_AGENTS_BATCH_SIZE", "6"))
    logger.info("Scheduled research sweep starting (batch=%s)", batch)

    result = run_pipeline_sync(batch_size=batch)

    # Returned as well as logged: EventBridge discards it, but it is what shows
    # in a manual `aws lambda invoke` when somebody is working out why a topic
    # has no report.
    logger.info(
        "Sweep finished: %s (%s topics)",
        result.get("status"),
        len(result.get("topics") or []),
    )
    return result
