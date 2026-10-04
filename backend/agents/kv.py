"""Where the research agents keep their state: files locally, DynamoDB on AWS.

Three kinds of document live here — one report per topic, the demand ledger
(which topics farmers have actually been shown), and the last run's status. On a
laptop they are JSON files under `AGENT_REPORTS_DIR`, exactly where they always
were. On AWS they have to be shared: the scheduled sweep runs in Lambda and the
reading service runs on Fargate, and a report a Lambda writes to its own `/tmp`
is a report the farmer's page can never read — research paid for and thrown
away. With `AGROSENSE_REPORTS_TABLE` set, every document is one item in that
DynamoDB table instead, keyed by the same string the file path is built from.

The value is stored as a JSON string rather than a DynamoDB map. Reports carry
floats (prices, confidences), which DynamoDB will only take as `Decimal`; a
string round-trips them unchanged, and an item is a few kilobytes against a
400 KB limit.
"""

from __future__ import annotations

import json
import os
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Any

from ..config import AGENT_REPORTS_DIR

TABLE_NAME = os.getenv("AGROSENSE_REPORTS_TABLE", "").strip()
_REGION = (os.getenv("AWS_REGION") or os.getenv("AWS_REGION_NAME") or "ap-south-1").strip()


def backend_name() -> str:
    return "dynamodb" if TABLE_NAME else "files"


def _path(key: str) -> Path:
    # "crop/mothbeans" -> <dir>/crop/mothbeans.json; "_demand" -> <dir>/_demand.json
    return AGENT_REPORTS_DIR / f"{key}.json"


@lru_cache(maxsize=1)
def _table() -> Any:
    import boto3

    return boto3.resource("dynamodb", region_name=_REGION).Table(TABLE_NAME)


def get(key: str) -> dict[str, Any] | None:
    if TABLE_NAME:
        item = _table().get_item(Key={"topic": key}).get("Item")
        if not item or "body" not in item:
            return None
        try:
            value = json.loads(item["body"])
        except json.JSONDecodeError:
            return None
        return value if isinstance(value, dict) else None

    path = _path(key)
    if not path.exists():
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    return value if isinstance(value, dict) else None


def put(key: str, value: dict[str, Any]) -> None:
    body = json.dumps(value, indent=2, ensure_ascii=False)
    if TABLE_NAME:
        _table().put_item(Item={"topic": key, "body": body})
        return

    # Write-then-rename, so a reader never sees half a file.
    path = _path(key)
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as file:
            file.write(body)
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


__all__ = ["TABLE_NAME", "backend_name", "get", "put"]
