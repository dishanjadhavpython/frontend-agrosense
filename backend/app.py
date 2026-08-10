from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .config import API_KEY, MAX_UPLOAD_BYTES
from .document_service import DocumentService
from .agents import demand, storage as agent_storage
from .agents.topics import find_topic
from .config import AGENTS_ENABLED, AGENTS_INTERVAL_HOURS
from .models import ModelsUnavailable, availability, predict_all
from .ingest import (
    HEIC_SUPPORTED,
    UnreadableDocument,
    UnsupportedDocument,
    supported_suffixes,
)
from .ocr import is_ocr_available
from .soil_report import METRIC_KEYS

"""
The reading service.

What this used to be: a 700-line app serving a static HTML frontend, S3
uploads, DynamoDB writes, Clerk sessions, a scheduled OpenAI research pipeline
and a torch soil classifier. All of it referenced files and credentials absent
from this repository, so none of it could start. That code is in `_unwired/`.

What it is now: read a Soil Health Card, return the twelve readings and what
they mean, and answer questions against the indexed document.

There is no CORS middleware and that is deliberate. The Next.js app proxies
through its own route handler (`src/app/api/card/route.ts`), so this service is
only ever called server-to-server and should not be reachable from a browser.
"""

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start the research sweep with the service, stop it with the service.

    A no-op without an OPENAI_API_KEY, so a clone runs the card reader and the
    three models without an account anywhere.
    """
    from .agents.scheduler import start_scheduler, stop_scheduler

    start_scheduler()
    try:
        yield
    finally:
        stop_scheduler()


app = FastAPI(title="AgroSense reading service", version="4.0.0", lifespan=lifespan)


@app.middleware("http")
async def require_key(request: Request, call_next):
    """The network boundary, once the service has a public address.

    See `config.API_KEY`. Unset means open, which is the right default for a
    process bound to 127.0.0.1 and the wrong one for anything else.

    `/api/health` stays open deliberately: the host's own health check has no
    way to send the header, and a machine that fails its check is a machine Fly
    restarts forever. It reports what is loaded, not anything read off a card.
    """
    if API_KEY and request.url.path != "/api/health":
        if request.headers.get("x-agrosense-key") != API_KEY:
            return JSONResponse({"detail": "Not authorised."}, status_code=401)
    return await call_next(request)


documents = DocumentService()


class QuestionPayload(BaseModel):
    question: str = Field(..., min_length=3, max_length=1000)
    top_k: int = Field(default=5, ge=1, le=10)
    document_id: str | None = Field(default=None, max_length=255)


@app.get("/api/health")
def health() -> dict[str, object]:
    """Also reports what this instance can actually do. The Next layer surfaces
    `ocr_available` so a farmer is told photographs will not work *before*
    taking one, rather than after."""
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "ocr_available": is_ocr_available(),
        "heic_supported": HEIC_SUPPORTED,
        "accepts": sorted(supported_suffixes()),
        "max_upload_bytes": MAX_UPLOAD_BYTES,
        "metrics": METRIC_KEYS,
        "models": availability(),
        "insights": {"enabled": AGENTS_ENABLED, **demand.snapshot()},
    }


@app.get("/api/insights/{category}/{slug}")
def insights(category: str, slug: str) -> dict[str, object]:
    """Current Indian information for one crop, soil or fertilizer.

    Always answers from cache. Research takes 30-60 seconds per topic and runs
    on the background sweep, never in a request — a farmer opening a detail
    page waits for a file read, not for four agents.

    `available: false` is a real state, not an error: the first person to be
    predicted a given soil sees the page before its report exists. It fills on
    the next sweep, and the page says so rather than pretending.
    """
    topic = find_topic(category, slug)
    if topic is None:
        raise HTTPException(status_code=404, detail=f"Unknown {category}: {slug}")

    report = agent_storage.load_report(topic.category, topic.slug)
    freshness = demand.report_freshness(topic.category, topic.slug)

    if report is None:
        return {
            "available": False,
            "category": topic.category,
            "name": topic.name,
            "slug": topic.slug,
            "reason": (
                "This has not been researched yet. It is queued and will appear "
                "after the next research sweep."
                if AGENTS_ENABLED
                else "Live information is not configured on this server "
                "(no OPENAI_API_KEY)."
            ),
            "enabled": AGENTS_ENABLED,
            **freshness,
        }

    return {
        "available": True,
        "enabled": AGENTS_ENABLED,
        "category": topic.category,
        "name": topic.name,
        "slug": topic.slug,
        "interval_hours": AGENTS_INTERVAL_HOURS,
        **freshness,
        "report": report,
    }


@app.post("/api/predict")
def predict(
    document_id: str = Form(...),
    temperature: float = Form(26.0),
    humidity: float = Form(68.0),
    rainfall: float = Form(110.0),
    moisture: float = Form(34.0),
    soil_image: UploadFile | None = File(None),
) -> dict[str, object]:
    """Soil, crops and fertilizer for one already-ingested card.

    The card supplies N, P, K and pH; the caller supplies the weather, which
    the frontend already fetches for its own panel. The soil photograph is
    optional and the response says whether it was used — a farmer who sent only
    a card still gets a recommendation, from nutrients alone.
    """
    try:
        document = documents.get(document_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Document not found.") from exc

    metrics = {str(m["key"]): m for m in document.get("soil_metrics", [])}
    if not metrics:
        raise HTTPException(
            status_code=422,
            detail={"message": "No readings were extracted from this card, so nothing can be predicted."},
        )

    def reading(key: str, default: float = 0.0) -> float:
        metric = metrics.get(key)
        return float(metric["reading"]) if metric else default

    readings = {
        "N": reading("available_nitrogen"),
        "P": reading("available_phosphorus"),
        "K": reading("available_potassium"),
        "ph": reading("ph", 6.5),
        "temperature": temperature,
        "humidity": humidity,
        "rainfall": rainfall,
        "moisture": moisture,
        # Carried through so a product whose nutrient is already above the
        # card's own range comes back as a hold rather than a purchase.
        "N_status": (metrics.get("available_nitrogen") or {}).get("status_code"),
        "P_status": (metrics.get("available_phosphorus") or {}).get("status_code"),
        "K_status": (metrics.get("available_potassium") or {}).get("status_code"),
    }

    image_bytes = soil_image.file.read() if soil_image is not None else None

    try:
        result = predict_all(readings, image_bytes)
    except ModelsUnavailable as exc:
        raise HTTPException(status_code=503, detail={"message": str(exc)}) from exc

    # Note what was predicted so the research sweep knows what is worth
    # gathering. One small file write, synchronous and cheap; nothing here
    # waits on an agent.
    try:
        demand.record(
            {
                "soil": [result["soil"]["key"]] if result.get("soil") else [],
                "crop": [str(c["name"]) for c in result.get("crops", [])],
                "fertilizer": [str(f["name"]) for f in result.get("fertilizers", [])],
            }
        )
    except Exception:
        # Never let the ledger break a prediction — it is bookkeeping for a
        # background job, not part of the answer.
        pass

    result["document_id"] = document_id
    result["readings_used"] = {
        k: v for k, v in readings.items() if not k.endswith("_status")
    }
    result["needs_review"] = bool(document.get("needs_review"))
    return result


@app.post("/api/ingest")
def ingest(file: UploadFile = File(...)) -> dict[str, object]:
    try:
        return documents.ingest(filename=file.filename or "", stream=file.file)
    except UnsupportedDocument as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except UnreadableDocument as exc:
        # 422 rather than 400: the file was a legitimate type, we simply could
        # not get readings out of it. The Next layer branches on this to tell
        # the farmer to retake the photo versus to send a different file.
        raise HTTPException(
            status_code=422,
            detail={"message": str(exc), "ocr_available": exc.ocr_available},
        ) from exc
    except ValueError as exc:
        # `chunk_pages` raises this when the text was too thin to index.
        raise HTTPException(status_code=422, detail={"message": str(exc)}) from exc


@app.get("/api/documents")
def list_documents() -> dict[str, object]:
    return {"documents": documents.list()}


@app.get("/api/documents/{document_id}")
def get_document(document_id: str) -> dict[str, object]:
    try:
        return documents.get(document_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Document not found.") from exc


@app.post("/api/ask")
def ask(payload: QuestionPayload) -> dict[str, object]:
    try:
        return documents.ask(
            payload.question,
            top_k=payload.top_k,
            document_id=payload.document_id,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Document not found.") from exc
