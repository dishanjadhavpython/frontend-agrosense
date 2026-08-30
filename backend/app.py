from __future__ import annotations

import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .auth import require_user
from .config import API_KEY, MAX_UPLOAD_BYTES
from . import ratelimit
from .document_service import DocumentService
from .agents import demand, queue as agent_queue, storage as agent_storage
from .agents.topics import find_topic
from .config import AGENTS_ENABLED, AGENTS_INTERVAL_HOURS, CLERK_ENABLED
from .models import MissingInput, ModelsUnavailable, availability, predict_all
from .ingest import (
    HEIC_SUPPORTED,
    UnreadableDocument,
    UnsupportedDocument,
    supported_suffixes,
)
from .ocr import is_ocr_available
from .soil_report import METRIC_KEYS, status_for

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
        # On-demand research runs on its own worker pool, so stopping the
        # scheduler is no longer enough to let the process exit.
        agent_queue.shutdown()


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


def enforce_limit(user: dict, action: str) -> None:
    """Refuse a request that would take this account past its daily ceiling.

    Raises 429 with `Retry-After`. The message is bilingual and says the number
    — "you have used your 20 for today" is actionable; "rate limit exceeded" is
    not, and this page is Marathi first.

    Applied to the three paths that cost money or CPU. Reading a crop page or
    an insights report is not limited: it is a file read, and throttling it
    would punish the browsing this product wants.
    """
    decision = ratelimit.check(user["id"], action)
    if decision.allowed:
        return
    raise HTTPException(
        status_code=429,
        headers={"Retry-After": str(max(1, decision.reset_in))},
        detail={
            "message": (
                f"Daily limit reached ({decision.limit} per day). "
                "Try again tomorrow."
            ),
            "limit": decision.limit,
            "reset_in": decision.reset_in,
        },
    )


class QuestionPayload(BaseModel):
    question: str = Field(..., min_length=3, max_length=1000)
    top_k: int = Field(default=5, ge=1, le=10)
    document_id: str | None = Field(default=None, max_length=255)


@app.get("/api/health")
def health(request: Request) -> dict[str, object]:
    """Two answers, depending on who is asking.

    The public half is what a load balancer needs and what the Next layer
    surfaces so a farmer is told photographs will not work *before* taking one.
    It says what this instance can do and nothing about how it is doing.

    The operational half — the research queue, the demand ledger, the last
    run's error — is behind `X-AgroSense-Key`. That block was added to make an
    exhausted OpenAI key visible instead of silent, and it did: it returned
    `429 ... credit_balance_exhausted` verbatim. To anyone who asked. Which
    names the model provider, confirms there is a paid account behind it, and
    reports that the account is currently out of credit — three facts that are
    useful to exactly one kind of visitor.

    `/api/health` cannot require the key outright: the host's own health check
    has no way to send a header, and a machine that fails its check is a
    machine that gets restarted forever. So the endpoint stays open and the
    interesting half moves behind the key.
    """
    public: dict[str, object] = {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "ocr_available": is_ocr_available(),
        "heic_supported": HEIC_SUPPORTED,
        "accepts": sorted(supported_suffixes()),
        "max_upload_bytes": MAX_UPLOAD_BYTES,
        "metrics": METRIC_KEYS,
        "models": availability(),
        "insights": {"enabled": AGENTS_ENABLED},
    }

    # Constant-time compare: this is a shared secret and a length-sensitive
    # `==` on it is a timing oracle, cheap to close.
    supplied = request.headers.get("x-agrosense-key") or ""
    if API_KEY and secrets.compare_digest(supplied, API_KEY):
        public["insights"] = {
            "enabled": AGENTS_ENABLED,
            **demand.snapshot(),
            "queue": agent_queue.snapshot(),
            "last_run": _last_run_summary(),
            "rate_limit_store": (
                "dynamodb" if ratelimit.configured() else "in-process (dev only)"
            ),
            "auth": "clerk" if CLERK_ENABLED else "disabled (localhost only)",
        }

    return public


def _last_run_summary() -> dict[str, object] | None:
    """The last agent run, condensed to what a human checking on it needs.

    Deliberately includes the first error verbatim. The failure this exists for
    was six topics in a row returning `429 ... credit_balance_exhausted`, which
    was invisible from every surface the product has — the pages just kept
    saying "not researched yet", indefinitely and politely.
    """
    status = agent_storage.load_run_status()
    if not status:
        return None

    topics = status.get("topics") or []
    errors = [t for t in topics if t.get("status") == "error"]
    return {
        "status": status.get("status"),
        "finished_at": status.get("finished_at"),
        "trigger": status.get("trigger", "sweep"),
        "topics": len(topics),
        "errors": len(errors),
        "first_error": errors[0].get("error") if errors else None,
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
    # "Being gathered right now" is a third state, and the page needs it. A
    # farmer who just hit Predict and opened their top crop would otherwise be
    # told the topic has not been researched — true for another ninety seconds,
    # and the exact moment they decide the feature does not work.
    researching = agent_queue.is_researching(topic.category, topic.slug)

    if report is None:
        return {
            "available": False,
            "researching": researching,
            "category": topic.category,
            "name": topic.name,
            "slug": topic.slug,
            "reason": (
                "Being researched now — this page will fill in shortly."
                if researching
                else "This has not been researched yet. It is queued and will "
                "appear after the next research sweep."
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
        # A stored report can be served while a fresher one is being written.
        # The page keeps showing what it has and says an update is coming.
        "researching": researching,
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
    # The four off the card, as the farmer confirmed them. Sent back rather
    # than re-read here on purpose: OCR turns this fixture's nitrogen 245.15
    # into 945.15, which is in range, plausible, and flips the advice from
    # "apply urea" to "apply none". The person holding the paper is the only
    # one who can settle that, so they do, and what they settled is what runs.
    nitrogen: float = Form(...),
    phosphorus: float = Form(...),
    potassium: float = Form(...),
    ph: float = Form(...),
    # The four for the field. Every one of these carried a default until now —
    # 26°C, 68%, 110mm, 34% — and the frontend never sent any of them, so those
    # four numbers are what every prediction this product has made was actually
    # computed from. There is no weather feed that knows somebody's plot.
    temperature: float = Form(...),
    humidity: float = Form(...),
    rainfall: float = Form(...),
    moisture: float = Form(...),
    soil_image: UploadFile = File(...),
    user: dict = Depends(require_user),
) -> dict[str, object]:
    """Soil, crops and fertilizer for one already-ingested card.

    Nothing in this handler supplies a value. Every input is required, and a
    missing one is a 422 naming the field rather than a prediction built on a
    number nobody chose.

    The card is still needed — it is where the printed range for each nutrient
    comes from, and the range is what decides whether a bag is a purchase or a
    hold. What the card no longer does is quietly stand in for a reading it
    failed to extract.
    """
    enforce_limit(user, "predict")

    try:
        # Owner-scoped. A document id belonging to another farmer raises
        # FileNotFoundError here and becomes a 404 — the same answer an id that
        # does not exist gets, so a stranger cannot use this endpoint to
        # discover which ids are real.
        document = documents.get(document_id, owner_id=user["id"])
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Document not found.") from exc

    metrics = {str(m["key"]): m for m in document.get("soil_metrics", [])}
    if not metrics:
        raise HTTPException(
            status_code=422,
            detail={"message": "No readings were extracted from this card, so nothing can be predicted."},
        )

    def status_against_card(key: str, reading: float) -> str | None:
        """Low / normal / high, judged against the range this card printed.

        Recomputed rather than taken from the stored metric, because the farmer
        may have just corrected the reading. A stale `"low"` sitting beside a
        corrected nitrogen would still be steering `_need_score`, which is what
        actually chooses the fertilizer — the correction would appear to have
        been accepted and would change nothing.

        `None` when the card carries no printed range for that nutrient. That
        is a real state and it travels: it means no bag can be ruled in or out
        on this nutrient, which is different from ruling them all out.
        """
        metric = metrics.get(key)
        if not metric:
            return None
        minimum, maximum = metric.get("range_min"), metric.get("range_max")
        if minimum is None or maximum is None:
            return None
        return status_for(reading, float(minimum), float(maximum))[1]

    readings = {
        "N": nitrogen,
        "P": phosphorus,
        "K": potassium,
        "ph": ph,
        "temperature": temperature,
        "humidity": humidity,
        "rainfall": rainfall,
        "moisture": moisture,
        # Carried through so a product whose nutrient is already above the
        # card's own range comes back as a hold rather than a purchase.
        "N_status": status_against_card("available_nitrogen", nitrogen),
        "P_status": status_against_card("available_phosphorus", phosphorus),
        "K_status": status_against_card("available_potassium", potassium),
    }

    image_bytes = soil_image.file.read()
    if not image_bytes:
        raise HTTPException(
            status_code=422,
            detail={"message": "The soil photograph was empty. Send the picture again."},
        )

    try:
        result = predict_all(readings, image_bytes)
    except ModelsUnavailable as exc:
        raise HTTPException(status_code=503, detail={"message": str(exc)}) from exc
    except MissingInput as exc:
        # 422, not 500: the request is incomplete, and the field is named so the
        # caller can say which box to fill rather than "something went wrong".
        raise HTTPException(
            status_code=422, detail={"message": str(exc), "field": exc.field}
        ) from exc

    # Note what was predicted, then go and research it.
    #
    # The ledger write is one small file and stays synchronous. The research
    # request is fire-and-forget: it hands topics to a worker pool and returns,
    # because a farmer waits for a CNN forward pass, never for four agents.
    #
    # Both are inside one `except Exception: pass` for the same reason. This is
    # enrichment of an answer that is already complete — a failure to queue
    # research must not turn a good prediction into a 500.
    predicted = {
        "soil": [result["soil"]["key"]] if result.get("soil") else [],
        "crop": [str(c["name"]) for c in result.get("crops", [])],
        "fertilizer": [str(f["name"]) for f in result.get("fertilizers", [])],
    }
    try:
        demand.record(predicted)
        # Before this, a prediction only left a row for a sweep that runs every
        # thirty minutes — so the farmer looking at the page right now was the
        # one person guaranteed not to see a report for it.
        result["research"] = agent_queue.request_now(predicted)
    except Exception:
        # Never let the ledger or the queue break a prediction — they are
        # bookkeeping for a background job, not part of the answer.
        pass

    result["document_id"] = document_id
    result["readings_used"] = {
        k: v for k, v in readings.items() if not k.endswith("_status")
    }
    result["needs_review"] = bool(document.get("needs_review"))
    return result


@app.post("/api/ingest")
def ingest(
    file: UploadFile = File(...),
    user: dict = Depends(require_user),
) -> dict[str, object]:
    enforce_limit(user, "card")
    try:
        return documents.ingest(
            filename=file.filename or "",
            stream=file.file,
            owner_id=user["id"],
        )
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
def list_documents(user: dict = Depends(require_user)) -> dict[str, object]:
    """This farmer's cards.

    This used to return every card the service had ever stored, in full,
    including the extracted readings — a farmer's name, village and survey
    number, to anyone who asked. The owner argument is required rather than
    optional so the unscoped version cannot be written again by accident.
    """
    return {"documents": documents.list(owner_id=user["id"])}


@app.get("/api/documents/{document_id}")
def get_document(
    document_id: str,
    user: dict = Depends(require_user),
) -> dict[str, object]:
    try:
        return documents.get(document_id, owner_id=user["id"])
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Document not found.") from exc


@app.post("/api/ask")
def ask(
    payload: QuestionPayload,
    user: dict = Depends(require_user),
) -> dict[str, object]:
    enforce_limit(user, "ask")
    try:
        return documents.ask(
            payload.question,
            top_k=payload.top_k,
            document_id=payload.document_id,
            owner_id=user["id"],
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Document not found.") from exc
