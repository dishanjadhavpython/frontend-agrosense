from __future__ import annotations

import os
from pathlib import Path

"""
Configuration for the reading service.

This file used to carry the whole AWS deployment: S3 buckets, DynamoDB tables,
Clerk keys, OpenAI agent scheduling, model artifact paths. All of that moved to
`_unwired/` along with the code that used it, and this is what is left — where
files go, whether OCR is on, and how to reach Ollama if it happens to be
running.

Two rules this file follows and the old one did not:

  * Nothing raises at import time. The previous version raised a RuntimeError
    when Clerk keys were missing, which made `import backend.config` fail on a
    fresh checkout — the module could not even be inspected without credentials.
  * Every path defaults inside `backend/`, so a clone runs with no environment
    at all.
"""

BACKEND_DIR = Path(__file__).resolve().parent

# Everything the service writes lives under one directory, so clearing state is
# `rm -rf backend/data` and nothing else.
DATA_DIR = Path(os.getenv("AGROSENSE_DATA_DIR", str(BACKEND_DIR / "data"))).resolve()
UPLOAD_DIR = Path(os.getenv("AGROSENSE_UPLOAD_DIR", str(DATA_DIR / "uploads"))).resolve()
VECTOR_STORE_FILE = Path(
    os.getenv("AGROSENSE_VECTOR_STORE", str(DATA_DIR / "vector_store.pkl"))
).resolve()


def _flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


# --- Uploads --------------------------------------------------------------
#
# Matches the 10 MB the upload UI already enforces client-side
# (`MAX_BYTES` in CardUpload.tsx). Kept in sync deliberately: a farmer who gets
# past the browser check should not then be refused by the server.
MAX_UPLOAD_BYTES = int(os.getenv("AGROSENSE_MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))

# --- OCR ------------------------------------------------------------------
#
# Needed for two things: PDFs that are a scan rather than typed text, and
# photographs of a card, which is how most farmers will send one. Requires the
# `tesseract` binary plus a language pack; `ocr.is_ocr_available()` checks for
# both and the service degrades to a clear error rather than crashing.
OCR_ENABLED = _flag("AGROSENSE_OCR_ENABLED", True)
OCR_LANGUAGES = os.getenv("AGROSENSE_OCR_LANGUAGES", "eng+mar").strip() or "eng"
OCR_DPI = int(os.getenv("AGROSENSE_OCR_DPI", "300"))

# --- Ollama (optional) ----------------------------------------------------
#
# Only used to phrase RAG answers. When it is not running, `rag_pipeline` falls
# back to extractive answers built from the retrieved chunks, which is why this
# is not a hard dependency and has no key to configure.
_ollama_host = os.getenv("OLLAMA_HOST", "127.0.0.1:11434").strip()
if _ollama_host.startswith(("http://", "https://")):
    _default_ollama_base_url = _ollama_host.rstrip("/")
else:
    _default_ollama_base_url = f"http://{_ollama_host}"

OLLAMA_BASE_URL = os.getenv("AGROSENSE_OLLAMA_BASE_URL", _default_ollama_base_url).rstrip("/")
OLLAMA_MODEL = os.getenv("AGROSENSE_OLLAMA_MODEL", "llama3.2:3b").strip() or "llama3.2:3b"
OLLAMA_ENABLED = _flag("AGROSENSE_OLLAMA_ENABLED", True)
OLLAMA_REQUEST_TIMEOUT_SECONDS = float(os.getenv("AGROSENSE_OLLAMA_TIMEOUT_SECONDS", "90"))
OLLAMA_TEMPERATURE = float(os.getenv("AGROSENSE_OLLAMA_TEMPERATURE", "0.2"))

DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
