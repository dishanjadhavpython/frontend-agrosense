from __future__ import annotations

import logging
import os
import threading
import time
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger("agrosense.ratelimit")

"""
A ceiling on what one account can spend.

The threat this exists for is specific and was live: `/api/predict` starts
research agents against a paid OpenAI key, and `/api/card` runs OCR. Both were
reachable by anyone, without limit. A single script could have emptied the
account overnight — which is close to what the exhausted-credit state in
`_run_status.json` looked like, though that one was ordinary use.

Two layers guard this, and they stop different things:

  * **AWS WAF**, at CloudFront, is volumetric — it stops a flood before it
    reaches any compute, and it counts per IP.
  * **This**, per Clerk user id, is the one that matters for cost. The
    expensive path is per *account*, not per address: a signed-in user on a
    mobile network can change IP every few minutes, and several farmers in one
    village share a CGNAT address. Limiting by IP alone would both miss the
    abuse and block the village.

Storage is DynamoDB with a TTL attribute, so an expired counter deletes itself
at no cost and there is nothing to sweep. With no table configured it falls
back to an in-process counter — the same "degrade honestly rather than fail
closed on a developer machine" rule `mandi_price_server` follows. That fallback
is per-process and resets on deploy, which is fine for `npm run api` and is not
fine in production; `configured()` reports which one is in force so
`/api/health` can say so.
"""

#: Requests per rolling day, per user, per path. Deliberately generous for a
#: real farmer — a card gets read once, maybe twice if the first photo was bad
#: — and far below what a script needs to be worth writing.
LIMITS: dict[str, int] = {
    "predict": 20,
    "card": 20,
    "ask": 50,
}

WINDOW_SECONDS = 24 * 60 * 60

TABLE_NAME = os.getenv("AGROSENSE_RATELIMIT_TABLE", "").strip()
AWS_REGION = os.getenv("AWS_REGION", "ap-south-1").strip()


@dataclass(frozen=True)
class Decision:
    allowed: bool
    limit: int
    remaining: int
    #: Seconds until the window resets. Sent as `Retry-After`.
    reset_in: int


class _LocalCounter:
    """In-process fallback. Correct for one worker, useless across many."""

    def __init__(self) -> None:
        self._hits: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def hit(self, key: str, limit: int) -> Decision:
        now = time.time()
        cutoff = now - WINDOW_SECONDS
        with self._lock:
            times = [t for t in self._hits.get(key, []) if t > cutoff]
            if len(times) >= limit:
                oldest = min(times)
                self._hits[key] = times
                return Decision(False, limit, 0, int(oldest + WINDOW_SECONDS - now))
            times.append(now)
            self._hits[key] = times
            return Decision(True, limit, limit - len(times), WINDOW_SECONDS)


_local = _LocalCounter()
_table: Any | None = None


def configured() -> bool:
    """True when counters are shared across workers rather than per-process."""
    return bool(TABLE_NAME)


def _dynamo() -> Any | None:
    global _table
    if not TABLE_NAME:
        return None
    if _table is None:
        import boto3

        _table = boto3.resource("dynamodb", region_name=AWS_REGION).Table(TABLE_NAME)
    return _table


def _hit_dynamo(key: str, limit: int) -> Decision:
    """One conditional atomic increment. No read-then-write race.

    The condition is the limit itself: DynamoDB refuses the update when the
    counter is already at the ceiling, so two simultaneous requests cannot both
    see 19 and both write 20.
    """
    from botocore.exceptions import ClientError

    table = _dynamo()
    assert table is not None
    now = int(time.time())
    expires = now + WINDOW_SECONDS

    try:
        response = table.update_item(
            Key={"pk": key},
            UpdateExpression="SET expires_at = if_not_exists(expires_at, :e) ADD hits :one",
            ConditionExpression="attribute_not_exists(hits) OR hits < :limit",
            ExpressionAttributeValues={":one": 1, ":limit": limit, ":e": expires},
            ReturnValues="ALL_NEW",
        )
    except ClientError as error:
        if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return Decision(False, limit, 0, WINDOW_SECONDS)
        # A DynamoDB outage must not lock every farmer out of their own card.
        # Failing open is the deliberate choice: the WAF layer is still in
        # front of this, and a rate limiter that takes the product down with it
        # has done more damage than the abuse it was guarding against.
        logger.warning("Rate limit store unavailable, allowing: %s", error)
        return Decision(True, limit, limit, WINDOW_SECONDS)

    used = int(response["Attributes"].get("hits", 1))
    return Decision(True, limit, max(0, limit - used), WINDOW_SECONDS)


def check(user_id: str, action: str) -> Decision:
    """Count one use of `action` by `user_id`, and say whether to allow it."""
    limit = LIMITS.get(action)
    if limit is None:
        return Decision(True, 0, 0, 0)

    key = f"{user_id}#{action}#{int(time.time()) // WINDOW_SECONDS}"

    if configured():
        try:
            return _hit_dynamo(key, limit)
        except Exception as exc:  # noqa: BLE001 - never break a request on this
            logger.warning("Rate limit check failed, allowing: %s", exc)
            return Decision(True, limit, limit, WINDOW_SECONDS)

    return _local.hit(key, limit)


__all__ = ["check", "configured", "Decision", "LIMITS"]
