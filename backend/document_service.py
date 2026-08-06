from __future__ import annotations

import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from .chunking import chunk_pages
from .config import MAX_UPLOAD_BYTES, UPLOAD_DIR
from .embeddings import embed_chunks
from .ingest import UnreadableDocument, UnsupportedDocument, classify, extract_document
from .keyword_extractor import extract_keywords
from .prediction_engine import predict_from_metrics
from .rag_pipeline import generate_answer
from .soil_report import (
    extract_soil_metrics,
    merge_extractions,
    missing_metric_keys,
    summarize_soil_metrics,
)
from .vector_store import (
    load_store,
    query_embeddings,
    store_document_details,
    store_embeddings,
)

"""
Ingest a card, and everything that follows from it.

Replaces `pdf_pipeline.py`, which was named for the only format it could take.
Two things it did were deliberately dropped:

  * `PREDICTION_INPUT_NORMALIZATION_RULES`, which divided nitrogen and potassium
    by ten to squeeze card readings into the range the XGBoost model was trained
    on. That model is in `_unwired/`; the rule-based engine that replaced it
    scores against kg/ha directly, so re-scaling now would corrupt the input
    rather than fix it.
  * `extract_prediction_inputs`, which existed to feed that same model.
"""

# Bumped whenever extraction changes shape or gets better, so cached documents
# re-read instead of serving a stale parse. 3 was the row-based-only extractor.
EXTRACTION_VERSION = 8


def _safe_stem(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip("-._")
    return cleaned or "soil-card"


def _document_id(original_name: str) -> str:
    source = Path(original_name)
    suffix = source.suffix.lower() or ".pdf"
    return f"{uuid4().hex[:10]}-{_safe_stem(source.stem.lower())}{suffix}"


class DocumentService:
    # ---- reading -------------------------------------------------------

    def _read(self, path: Path, original_name: str) -> dict[str, Any]:
        """Everything derived from the file, in one place, so upload and
        re-extraction cannot drift apart."""
        # How good is a candidate OCR text? By the only measure that matters:
        # how many of the twelve readings come out of it. Handing this to the
        # reader turns OCR from a single guess into a search over
        # configurations, which is the difference between 3 of 12 and 12 of 12
        # on a photographed card.
        document = extract_document(
            path,
            filename=original_name,
            score=lambda text: len(extract_soil_metrics(text)),
        )

        # Merge readings across every OCR pass, not just the best one. No
        # single pass is reliably complete and they drop different rows, so the
        # union recovers what any one of them missed — 11 of 12 becomes 12 of
        # 12 on a high-resolution photo. A PDF with a text layer has one
        # candidate and this collapses to a plain extraction.
        candidates = document.candidates or [document.text]
        metrics = merge_extractions(
            # Implausible rows are included on purpose: they never reach the
            # farmer, but their ranges are the evidence that decides which of
            # two disagreeing passes is telling the truth.
            [extract_soil_metrics(text, include_implausible=True) for text in candidates]
        )

        # A number recovered from pixels is not the same fact as a number read
        # out of a PDF's text layer, and the difference is not academic. On a
        # clean render of the test card Tesseract reads nitrogen 245.15 as
        # 945.15 — plausible, in range, and the wrong side of the threshold: it
        # turns "low, apply urea" into "high, apply none". Nothing downstream
        # can detect that from the text, so every OCR-derived reading is
        # stamped unconfirmed and the UI asks the farmer to check it against
        # the paper. See BACKEND_PLAN.md §9.
        confidence = "unconfirmed" if document.used_ocr else "high"
        for metric in metrics:
            metric["confidence"] = confidence

        return {
            "needs_review": document.used_ocr,
            "text": document.text,
            "pages": document.pages,
            "ocr_pages": document.ocr_pages,
            "source": document.source,
            "soil_metrics": metrics,
            "missing_metrics": missing_metric_keys(metrics),
            "metric_count": len(metrics),
            "out_of_range_count": sum(
                1 for metric in metrics if metric["status_code"] != "normal"
            ),
            "summary": summarize_soil_metrics(metrics),
            "keywords": extract_keywords(document.text),
            "predictions": predict_from_metrics(metrics),
            "extraction_version": EXTRACTION_VERSION,
        }

    # ---- upload --------------------------------------------------------

    def ingest(self, *, filename: str, stream) -> dict[str, Any]:
        """Store the card, read it, index it. Raises `UnsupportedDocument` or
        `UnreadableDocument`; the caller turns those into 400/422."""
        original_name = Path(filename or "").name
        classify(original_name)  # raises UnsupportedDocument before anything is written

        document_id = _document_id(original_name)
        target = UPLOAD_DIR / document_id

        try:
            with target.open("wb") as buffer:
                shutil.copyfileobj(stream, buffer, length=1024 * 1024)

            size = target.stat().st_size
            if size == 0:
                raise UnsupportedDocument("That file is empty.")
            if size > MAX_UPLOAD_BYTES:
                raise UnsupportedDocument(
                    f"That file is over {MAX_UPLOAD_BYTES // (1024 * 1024)} MB."
                )

            record = self._read(target, original_name)
            chunks = chunk_pages(record["pages"])
            timestamp = datetime.now(timezone.utc).isoformat()

            details = {
                key: value
                for key, value in record.items()
                # The full text and page list are the RAG index's job; keeping
                # a second copy in the document record would double the pickle
                # for no reader.
                if key not in {"text", "pages"}
            }
            details.update(
                {
                    "id": document_id,
                    "filename": original_name,
                    "stored_name": document_id,
                    "size": size,
                    "page_count": len(record["pages"]),
                    "chunk_count": len(chunks),
                    "uploaded_at": timestamp,
                    "updated_at": timestamp,
                }
            )

            store_embeddings(
                chunks,
                embed_chunks(chunks),
                document_id,
                record["keywords"],
                document_details=details,
            )
        except Exception:
            # A card we could not read is a card we do not keep.
            target.unlink(missing_ok=True)
            raise

        return self.get(document_id)

    # ---- retrieval -----------------------------------------------------

    def _path(self, document_id: str) -> Path:
        path = UPLOAD_DIR / Path(document_id).name
        if not path.exists():
            raise FileNotFoundError("Document not found.")
        return path

    def get(self, document_id: str) -> dict[str, Any]:
        safe_id = Path(document_id).name
        path = self._path(safe_id)

        store = load_store()
        record = store.get("documents", {}).get(safe_id)

        if record is None or int(record.get("extraction_version") or 0) < EXTRACTION_VERSION:
            # Re-read rather than serve a parse from an older extractor.
            refreshed = self._read(path, str((record or {}).get("filename") or safe_id))
            record = {
                **(record or {}),
                **{k: v for k, v in refreshed.items() if k not in {"text", "pages"}},
                "id": safe_id,
                "page_count": len(refreshed["pages"]),
            }
            store_document_details(safe_id, record)

        stat = path.stat()
        return {
            "id": safe_id,
            "filename": str(record.get("filename") or safe_id),
            "size": int(record.get("size") or stat.st_size),
            "updated_at": str(
                record.get("updated_at")
                or datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
            ),
            "source": str(record.get("source") or "native"),
            "ocr_pages": list(record.get("ocr_pages") or []),
            "page_count": int(record.get("page_count") or 1),
            "chunk_count": int(record.get("chunk_count") or 0),
            "keywords": list(record.get("keywords") or []),
            "soil_metrics": list(record.get("soil_metrics") or []),
            "missing_metrics": list(record.get("missing_metrics") or []),
            "metric_count": int(record.get("metric_count") or 0),
            "out_of_range_count": int(record.get("out_of_range_count") or 0),
            "summary": str(record.get("summary") or ""),
            "needs_review": bool(record.get("needs_review")),
            "predictions": record.get("predictions") or predict_from_metrics([]),
        }

    def list(self) -> list[dict[str, Any]]:
        documents = []
        for path in sorted(
            UPLOAD_DIR.iterdir(), key=lambda item: item.stat().st_mtime, reverse=True
        ):
            if path.is_file() and not path.name.startswith("."):
                try:
                    documents.append(self.get(path.name))
                except (FileNotFoundError, UnreadableDocument, UnsupportedDocument):
                    continue
        return documents

    # ---- retrieval-augmented answering ---------------------------------

    def ask(
        self,
        question: str,
        *,
        top_k: int = 5,
        document_id: str | None = None,
        history: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        context = None
        safe_id = Path(document_id).name if document_id else None
        if safe_id:
            context = self.get(safe_id)

        results = query_embeddings(question, top_k=top_k, filename=safe_id) if safe_id else []
        answer = generate_answer(
            question, results, document_context=context, conversation_history=history
        )

        return {
            **answer,
            "sources": [
                {
                    "document_id": item["file"],
                    "page": item.get("page"),
                    "score": item["score"],
                    "snippet": str(item["text"])[:240].strip(),
                }
                for item in results
            ],
            "selected_document": safe_id,
        }
