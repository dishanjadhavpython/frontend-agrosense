from __future__ import annotations

import json
import os
from pathlib import Path

# ---------------------------------------------------------------------------
# This has to run before numpy, scikit-learn, xgboost or torch are imported,
# which is why it sits at the top of the module every other module imports
# first.
#
# torch and scikit-learn each ship their own copy of `libomp.dylib`. Loading
# both into one process and letting them each spin up a thread pool segfaults
# on macOS — the reading service died with SIGSEGV the first time a single
# request touched the soil classifier and the crop model together. Pinning
# OpenMP to one thread avoids it.
#
# It costs nothing here in any case: this process serves one request at a time
# and every model is small, so the thread pools were oversubscription rather
# than speed. `KMP_DUPLICATE_LIB_OK` is the more commonly cited fix and it did
# *not* hold — it survived the classifier and still crashed on the crop model.
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

# ---------------------------------------------------------------------------
# Next.js loads `.env.local` then `.env` on its own; this process does not get
# that for free, and without it every key below reads as absent. The agent
# pipeline then disabled itself on a machine whose `.env` had a perfectly good
# OPENAI_API_KEY in it — silently, because "no key" is a supported state.
#
# Same precedence as Next so one file means one thing in both halves of the
# app: `.env.local` wins over `.env`, and a variable already exported into the
# environment wins over both (`override=False` is the default), so
# `AGROSENSE_DATA_DIR=... uvicorn ...` still works.
from dotenv import load_dotenv  # noqa: E402

_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_ROOT / ".env.local")
load_dotenv(_ROOT / ".env")

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
ROOT_DIR = BACKEND_DIR.parent

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


# --- Access ---------------------------------------------------------------
#
# This service has no user accounts and never did: it trusted the network, on
# the assumption written at the top of `app.py` that only the Next server can
# reach it. Hosting it means that assumption stops holding — a public URL is
# reachable by everyone, and `/api/ingest` accepts a 10 MB file and spends CPU
# on OCR for anyone who asks.
#
# So: one shared secret, sent by the Next route handlers as `X-AgroSense-Key`.
# Not a user identity, and not trying to be — it is the network boundary that
# was lost, put back in a header.
#
# Empty means open, which keeps `git clone && npm run api` working with no
# configuration. That default is only safe because it is also the default for
# binding to 127.0.0.1; set this before the service has a public address.
API_KEY = os.getenv("AGROSENSE_API_KEY", "").strip()

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

# --- Research agents ------------------------------------------------------
#
# Four agents (Planner -> Research -> Creator -> Reviewer) that gather current
# Indian information — schemes, techniques, government prices, video — for the
# crops, soils and fertilizers the models actually predicted. See AGENTS_PLAN.md.
#
# The whole subsystem is a no-op without an OpenAI key, which is deliberate: a
# fresh checkout should run the card reader and the three models without
# needing an account anywhere.
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
AGENTS_MODEL = os.getenv("AGROSENSE_AGENTS_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"

#: Optional. YouTube Data API v3 (free tier). With it the research agent's
#: `search_youtube` tool returns real videos — title, channel, thumbnail;
#: without it, one link to a YouTube search page for the topic. The MCP server
#: imports this name, so its absence here was not a missing feature but an
#: ImportError on every call to the tool.
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "").strip()

_agents_enabled_raw = os.getenv("AGROSENSE_AGENTS_ENABLED")
AGENTS_ENABLED = (
    bool(OPENAI_API_KEY)
    if _agents_enabled_raw is None
    else _agents_enabled_raw.strip().lower() in {"1", "true", "yes", "on"}
)

#: How long a topic's report stays fresh. A farmer opening the same crop page
#: twice in an afternoon must not trigger two research runs.
AGENTS_INTERVAL_HOURS = float(os.getenv("AGROSENSE_AGENTS_INTERVAL_HOURS", "8"))

#: Topics refreshed per cycle. Each costs roughly four LLM calls, so this is
#: the ceiling on spend per cycle rather than a performance tuning knob.
AGENTS_BATCH_SIZE = int(os.getenv("AGROSENSE_AGENTS_BATCH_SIZE", "6"))

#: How often the scheduler looks for work. Shorter than the refresh interval on
#: purpose: a topic predicted for the first time should not wait up to 8 hours
#: for its first report, it should be picked up at the next sweep.
AGENTS_SWEEP_MINUTES = float(os.getenv("AGROSENSE_AGENTS_SWEEP_MINUTES", "30"))

AGENTS_RUN_ON_STARTUP_IF_STALE = _flag("AGROSENSE_AGENTS_RUN_ON_STARTUP", True)

AGENT_REPORTS_DIR = Path(
    os.getenv("AGROSENSE_AGENT_REPORTS_DIR", str(DATA_DIR / "agent_reports"))
).resolve()

#: Government price data. Free key from https://data.gov.in — without it the
#: price section is reported as unavailable rather than filled in by a language
#: model, which is the point of sourcing prices from an API at all.
DATA_GOV_IN_API_KEY = os.getenv("DATA_GOV_IN_API_KEY", "").strip()

#: This product is Marathi-first and its reference card is from Palghar
#: district, so mandi prices default to Maharashtra.
DEFAULT_PRICE_STATE = os.getenv("AGROSENSE_PRICE_STATE", "Maharashtra").strip()


def soil_classes() -> list[str]:
    """The soil types the classifier can actually return.

    Read from the trained model's own metadata rather than hard-coded. The
    previous constant said four while the model had been retrained to eight,
    which would have left half the soil detail pages with no research topic and
    therefore no content — a silent gap, since nothing errors when a topic
    simply does not exist.
    """
    classes_file = ROOT_DIR / "ML" / "models" / "soil_classes.json"
    if classes_file.exists():
        try:
            return list(json.loads(classes_file.read_text()))
        except (json.JSONDecodeError, OSError):
            pass
    # Only reached before the first training run.
    return ["alluvial", "black", "cinder", "clay", "laterite", "peat", "red", "yellow"]


DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
AGENT_REPORTS_DIR.mkdir(parents=True, exist_ok=True)
