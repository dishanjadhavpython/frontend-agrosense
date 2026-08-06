from __future__ import annotations

import pickle
from typing import Any

import numpy as np

from .config import VECTOR_STORE_FILE
from .embeddings import VECTOR_SIZE, embed_query


def _empty_store() -> dict[str, Any]:
    return {
        "embeddings": np.empty((0, VECTOR_SIZE), dtype=np.float32),
        "metadata": [],
        "documents": {},
    }


def _save_store(store: dict[str, Any]) -> None:
    VECTOR_STORE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with VECTOR_STORE_FILE.open("wb") as handle:
        pickle.dump(store, handle)


def load_store() -> dict[str, Any]:
    if not VECTOR_STORE_FILE.exists():
        return _empty_store()

    with VECTOR_STORE_FILE.open("rb") as handle:
        store = pickle.load(handle)

    embeddings = np.asarray(store.get("embeddings", []), dtype=np.float32)
    metadata = list(store.get("metadata", []))
    documents = store.get("documents", {})
    if not isinstance(documents, dict):
        documents = {}

    if embeddings.size == 0:
        embeddings = np.empty((0, VECTOR_SIZE), dtype=np.float32)
    elif embeddings.ndim != 2:
        raise ValueError("Stored embeddings are corrupted.")

    if embeddings.shape[0] != len(metadata):
        raise ValueError("Stored metadata does not match stored embeddings.")

    return {"embeddings": embeddings, "metadata": metadata, "documents": documents}


def _remove_existing_document(store: dict[str, Any], filename: str) -> dict[str, Any]:
    metadata = store["metadata"]
    documents = dict(store.get("documents", {}))
    documents.pop(filename, None)
    keep_indices = [index for index, item in enumerate(metadata) if item["file"] != filename]

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
    filename: str,
    keywords: list[str],
    document_details: dict[str, object] | None = None,
) -> None:
    if embeddings.ndim != 2:
        raise ValueError("Embeddings must be a 2D array.")
    if len(chunks) != embeddings.shape[0]:
        raise ValueError("Each chunk must have a matching embedding.")

    store = _remove_existing_document(load_store(), filename)
    embeddings = embeddings.astype("float32")
    metadata = store["metadata"]
    documents = dict(store.get("documents", {}))

    new_entries = [
        {
            "text": chunk["text"],
            "file": filename,
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
        details.setdefault("filename", filename)
        details.setdefault("keywords", list(keywords))
        documents[filename] = details

    _save_store(
        {
            "embeddings": combined_embeddings,
            "metadata": metadata,
            "documents": documents,
        }
    )


def store_document_details(filename: str, document_details: dict[str, object]) -> None:
    store = load_store()
    documents = dict(store.get("documents", {}))
    details = dict(document_details)
    details.setdefault("filename", filename)
    documents[filename] = details
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
    filename: str | None = None,
) -> list[dict[str, object]]:
    store = load_store()
    if not store["metadata"]:
        return []

    metadata = store["metadata"]
    embeddings = store["embeddings"]
    if filename:
        keep_indices = [index for index, item in enumerate(metadata) if item["file"] == filename]
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
