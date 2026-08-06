from __future__ import annotations

import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from .chunking import chunk_pages
from .embeddings import embed_chunks
from .keyword_extractor import extract_keywords
from .pdf_processor import extract_text
from .prediction_engine import predict_from_metrics
from .rag_pipeline import generate_answer
from .soil_report import extract_soil_metrics, summarize_soil_metrics
from .vector_store import load_store, query_embeddings, store_document_details, store_embeddings

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", BASE_DIR / "uploads"))
LEGACY_UPLOAD_DIR = BASE_DIR / "aws p3" / "uploads"


def ensure_runtime_directories() -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    store_path = Path(os.getenv("VECTOR_STORE_PATH", BASE_DIR / "data" / "vector_store.pkl"))
    store_path.parent.mkdir(parents=True, exist_ok=True)


def _safe_name(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip("-._")
    return cleaned or "soil-report"


def _build_document_id(filename: str, owner_id: int | None) -> tuple[str, str]:
    source = Path(filename)
    extension = source.suffix.lower() or ".pdf"
    base_name = _safe_name(source.stem.lower())
    owner_prefix = f"user-{owner_id}" if owner_id is not None else "guest"
    token = uuid4().hex[:10]
    stored_name = f"{owner_prefix}-{token}-{base_name}{extension}"
    return stored_name, source.name


def _resolve_document_path(record: dict[str, object]) -> Path:
    candidates = [
        str(record.get("stored_name") or ""),
        str(record.get("id") or ""),
        str(record.get("filename") or ""),
    ]
    for base_dir in (UPLOAD_DIR, LEGACY_UPLOAD_DIR):
        for candidate in candidates:
            if not candidate:
                continue
            path = base_dir / candidate
            if path.exists():
                return path
    raise FileNotFoundError("Stored PDF file was not found on disk.")


def _normalize_document_record(document_id: str, record: dict[str, object] | None) -> dict[str, object]:
    document = dict(record or {})
    metrics = [
        item
        for item in document.get("soil_metrics", [])
        if isinstance(item, dict)
    ]
    document["id"] = document_id
    document["stored_name"] = str(document.get("stored_name") or document_id)
    document["filename"] = str(document.get("filename") or document.get("name") or document_id)
    document["name"] = document["filename"]
    document["soil_metrics"] = metrics
    document["keywords"] = [
        str(item)
        for item in document.get("keywords", [])
        if isinstance(item, str)
    ]
    document["metric_count"] = int(document.get("metric_count") or len(metrics))
    document["out_of_range_count"] = int(
        document.get("out_of_range_count")
        or sum(1 for metric in metrics if metric.get("status_code") != "normal")
    )
    document["summary"] = str(document.get("summary") or "")
    document["predictions"] = document.get("predictions") or predict_from_metrics(metrics)
    document["updated_at"] = str(
        document.get("updated_at")
        or document.get("uploaded_at")
        or datetime.now(timezone.utc).isoformat()
    )
    return document


def _document_response(document_id: str, store_data: dict[str, object] | None = None) -> dict[str, object]:
    store = store_data or load_store()
    record = _normalize_document_record(
        document_id,
        store.get("documents", {}).get(document_id),
    )
    path = _resolve_document_path(record)
    stat = path.stat()
    response = {
        "id": document_id,
        "name": record["name"],
        "filename": record["filename"],
        "stored_name": record["stored_name"],
        "size": int(record.get("size") or stat.st_size),
        "updated_at": record["updated_at"],
        **record,
    }
    response["chunk_count"] = int(record.get("chunk_count") or 0)
    return response


def _matches_owner(record: dict[str, object], owner_id: int | None) -> bool:
    if owner_id is None:
        return True
    return int(record.get("owner_id") or -1) == int(owner_id)


def _find_document_id(store: dict[str, object], selector: str) -> str | None:
    documents = store.get("documents", {})
    if selector in documents:
        return selector

    for document_id, record in documents.items():
        aliases = {
            str(document_id),
            str(record.get("filename") or ""),
            str(record.get("name") or ""),
            str(record.get("stored_name") or ""),
        }
        if selector in aliases:
            return document_id
    return None


def save_document(file_storage, owner_id: int | None = None) -> dict[str, object]:
    ensure_runtime_directories()

    original_name = Path(file_storage.filename or "").name
    if not original_name.lower().endswith(".pdf"):
        raise ValueError("Only PDF files are supported.")

    document_id, display_name = _build_document_id(original_name, owner_id)
    target_path = UPLOAD_DIR / document_id

    try:
        with target_path.open("wb") as buffer:
            shutil.copyfileobj(file_storage.stream, buffer)

        text, pages = extract_text(target_path)
        chunks = chunk_pages(pages)
        keywords = extract_keywords(text)
        soil_metrics = extract_soil_metrics(text)
        summary = summarize_soil_metrics(soil_metrics)
        predictions = predict_from_metrics(soil_metrics)
        out_of_range_count = sum(
            1 for metric in soil_metrics if metric["status_code"] != "normal"
        )
        embeddings = embed_chunks(chunks)
        timestamp = datetime.now(timezone.utc).isoformat()
        details = {
            "id": document_id,
            "filename": display_name,
            "name": display_name,
            "stored_name": document_id,
            "owner_id": owner_id,
            "uploaded_at": timestamp,
            "updated_at": timestamp,
            "size": target_path.stat().st_size,
            "page_count": len(pages),
            "chunk_count": len(chunks),
            "keywords": keywords,
            "metric_count": len(soil_metrics),
            "out_of_range_count": out_of_range_count,
            "summary": summary,
            "soil_metrics": soil_metrics,
            "predictions": predictions,
        }
        store_embeddings(
            chunks,
            embeddings,
            document_id,
            keywords,
            document_details=details,
        )
    except ValueError:
        target_path.unlink(missing_ok=True)
        raise
    except Exception:
        target_path.unlink(missing_ok=True)
        raise

    response = _document_response(document_id)
    response["message"] = "PDF processed successfully."
    return response


def list_documents(owner_id: int | None = None) -> list[dict[str, object]]:
    ensure_runtime_directories()
    store = load_store()
    documents: list[dict[str, object]] = []
    for document_id, record in store.get("documents", {}).items():
        normalized = _normalize_document_record(document_id, record)
        if not _matches_owner(normalized, owner_id):
            continue
        try:
            documents.append(_document_response(document_id, store))
        except FileNotFoundError:
            continue

    documents.sort(key=lambda item: item.get("updated_at", ""), reverse=True)
    return documents


def get_document(document_selector: str, owner_id: int | None = None) -> dict[str, object]:
    store = load_store()
    document_id = _find_document_id(store, document_selector)
    if document_id is None:
        raise FileNotFoundError("Document not found.")

    record = _normalize_document_record(document_id, store.get("documents", {}).get(document_id))
    if not _matches_owner(record, owner_id):
        raise PermissionError("Document not accessible for this user.")

    if not record.get("soil_metrics") or not record.get("predictions"):
        path = _resolve_document_path(record)
        text, pages = extract_text(path)
        soil_metrics = extract_soil_metrics(text)
        keywords = extract_keywords(text)
        refreshed = {
            **record,
            "page_count": len(pages),
            "keywords": keywords,
            "metric_count": len(soil_metrics),
            "out_of_range_count": sum(
                1 for metric in soil_metrics if metric["status_code"] != "normal"
            ),
            "summary": summarize_soil_metrics(soil_metrics),
            "soil_metrics": soil_metrics,
            "predictions": predict_from_metrics(soil_metrics),
            "updated_at": str(record.get("updated_at") or datetime.now(timezone.utc).isoformat()),
        }
        store_document_details(document_id, refreshed)

    return _document_response(document_id)


def answer_question(
    question: str,
    top_k: int = 5,
    document_selector: str | None = None,
    owner_id: int | None = None,
) -> dict[str, object]:
    normalized_question = question.strip()
    if len(normalized_question) < 3:
        raise ValueError("Question must contain at least 3 characters.")

    store = load_store()
    document_id = None
    if document_selector:
        document_id = _find_document_id(store, document_selector)
        if document_id is None:
            raise FileNotFoundError("Document not found.")

    results = query_embeddings(
        normalized_question,
        top_k=max(1, min(top_k, 10)),
        document_id=document_id,
        owner_id=owner_id,
    )
    if not results:
        return {
            "answer": "No indexed content is available yet. Upload a PDF first.",
            "sources": [],
        }

    answer = generate_answer(normalized_question, results)
    sources = []
    for item in results:
        source_document = store.get("documents", {}).get(str(item.get("document_id") or item.get("file")), {})
        sources.append(
            {
                "document_id": str(item.get("document_id") or item.get("file") or ""),
                "file": str(source_document.get("filename") or item.get("document_id") or item.get("file") or ""),
                "page": item.get("page"),
                "score": item["score"],
                "snippet": str(item["text"])[:240].strip(),
            }
        )

    return {"answer": answer, "sources": sources}
