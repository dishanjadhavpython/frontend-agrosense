from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from .config import MAX_UPLOAD_BYTES
from .document_service import DocumentService
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

app = FastAPI(title="AgroSense reading service", version="3.0.0")

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
    }


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
