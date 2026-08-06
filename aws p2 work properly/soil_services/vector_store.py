from __future__ import annotations

import os
import pickle
from pathlib import Path
from typing import Any

import numpy as np

from .embeddings import VECTOR_SIZE, embed_query

BASE_DIR = Path(__file__).resolve().parent.parent
STORE_FILE = Path(os.getenv("VECTOR_STORE_PATH", BASE_DIR / "data" / "vector_store.pkl"))
DATA_DIR = STORE_FILE.parent


def _empty_store() -> dict[str, Any]:
    return {
        "embeddings": np.empty((0, VECTOR_SIZE), dtype=np.float32),
        "metadata": [],
        "documents": {},
    }


def _normalize_metadata(items: list[object]) -> list[dict[str, object]]:
    normalized: list[dict[str, object]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        entry = dict(item)
        document_id = str(
            entry.get("document_id")
            or entry.get("file")
            or entry.get("filename")
            or ""
        )
        if not document_id:
            continue
        entry["document_id"] = document_id
        entry.setdefault("file", document_id)
        normalized.append(entry)
    return normalized


def _normalize_documents(documents: object) -> dict[str, dict[str, object]]:
    if not isinstance(documents, dict):
        return {}

    normalized: dict[str, dict[str, object]] = {}
    for key, value in documents.items():
        if not isinstance(value, dict):
            continue
        record = dict(value)
        document_id = str(record.get("id") or key)
        record["id"] = document_id
        record.setdefault("stored_name", str(record.get("stored_name") or key))
        record.setdefault(
            "filename",
            str(record.get("filename") or record.get("name") or record.get("stored_name") or key),
        )
        record.setdefault("name", record["filename"])
        normalized[document_id] = record
    return normalized


def _save_store(store: dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with STORE_FILE.open("wb") as handle:
        pickle.dump(store, handle)


def load_store() -> dict[str, Any]:
    if not STORE_FILE.exists():
        return _empty_store()

    with STORE_FILE.open("rb") as handle:
        store = pickle.load(handle)

    embeddings = np.asarray(store.get("embeddings", []), dtype=np.float32)
    metadata = _normalize_metadata(list(store.get("metadata", [])))
    documents = _normalize_documents(store.get("documents", {}))

    if embeddings.size == 0:
        embeddings = np.empty((0, VECTOR_SIZE), dtype=np.float32)
    elif embeddings.ndim != 2:
        raise ValueError("Stored embeddings are corrupted.")

    if embeddings.shape[0] != len(metadata):
        raise ValueError("Stored metadata does not match stored embeddings.")

    return {"embeddings": embeddings, "metadata": metadata, "documents": documents}


def _remove_existing_document(store: dict[str, Any], document_id: str) -> dict[str, Any]:
    metadata = store["metadata"]
    documents = dict(store.get("documents", {}))
    documents.pop(document_id, None)
    keep_indices = [
        index for index, item in enumerate(metadata)
        if str(item.get("document_id") or item.get("file")) != document_id
    ]

    if keep_indices:
        filtered_embeddings = store["embeddings"][keep_indices]
        filtered_metadata = [metadata[index] for index in keep_indices]
    else:
        filtered_embeddings = np.empty((0, VECTOR_SIZE), dtype=np.float32)
        filtered_metadata = []

    return {
        "embeddings": filtered_embeddings,
        "metadata": filtered_metadata,
        "documents": documents,
    }


def store_embeddings(
    chunks: list[dict[str, object]],
    embeddings: np.ndarray,
    document_id: str,
    keywords: list[str],
    document_details: dict[str, object] | None = None,
) -> None:
    if embeddings.ndim != 2:
        raise ValueError("Embeddings must be a 2D array.")
    if len(chunks) != embeddings.shape[0]:
        raise ValueError("Each chunk must have a matching embedding.")

    store = _remove_existing_document(load_store(), document_id)
    embeddings = embeddings.astype("float32")
    metadata = store["metadata"]
    documents = dict(store.get("documents", {}))

    new_entries = [
        {
            "text": chunk["text"],
            "file": document_id,
            "document_id": document_id,
            "page": chunk.get("page"),
            "chunk_id": chunk.get("chunk_id"),
            "keywords": list(keywords),
        }
        for chunk in chunks
    ]

    combined_embeddings = (
        embeddings
        if store["embeddings"].size == 0
        else np.vstack([store["embeddings"], embeddings]).astype("float32")
    )
    metadata.extend(new_entries)
    if document_details is not None:
        details = dict(document_details)
        details.setdefault("id", document_id)
        details.setdefault("keywords", list(keywords))
        documents[document_id] = details

    _save_store(
        {
            "embeddings": combined_embeddings,
            "metadata": metadata,
            "documents": documents,
        }
    )


def store_document_details(document_id: str, document_details: dict[str, object]) -> None:
    store = load_store()
    documents = dict(store.get("documents", {}))
    details = dict(document_details)
    details.setdefault("id", document_id)
    documents[document_id] = details
    _save_store(
        {
            "embeddings": store["embeddings"],
            "metadata": store["metadata"],
            "documents": documents,
        }
    )


def query_embeddings(
    query: str,
    top_k: int = 5,
    document_id: str | None = None,
    owner_id: int | None = None,
) -> list[dict[str, object]]:
    store = load_store()
    if not store["metadata"]:
        return []

    metadata = store["metadata"]
    embeddings = store["embeddings"]
    documents = store["documents"]

    keep_indices = list(range(len(metadata)))
    if document_id:
        keep_indices = [
            index for index, item in enumerate(metadata)
            if str(item.get("document_id") or item.get("file")) == document_id
        ]

    if owner_id is not None:
        owner_filtered = []
        for index in keep_indices:
            item = metadata[index]
            document = documents.get(str(item.get("document_id") or item.get("file")), {})
            if int(document.get("owner_id") or -1) == int(owner_id):
                owner_filtered.append(index)
        keep_indices = owner_filtered

    if not keep_indices:
        return []

    embeddings = embeddings[keep_indices]
    metadata = [metadata[index] for index in keep_indices]

    query_vector = embed_query(query).astype("float32")
    scores = embeddings @ query_vector
    top_k = min(top_k, len(metadata))
    ranked_indices = np.argsort(scores)[::-1][:top_k]

    results: list[dict[str, object]] = []
    for index in ranked_indices:
        item = dict(metadata[index])
        item["score"] = round(float(scores[index]), 4)
        results.append(item)

    return results
