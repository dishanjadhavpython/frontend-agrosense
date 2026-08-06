from __future__ import annotations

import numpy as np
from sklearn.feature_extraction.text import HashingVectorizer

VECTOR_SIZE = 1536

_VECTORIZER = HashingVectorizer(
    n_features=VECTOR_SIZE,
    alternate_sign=False,
    norm="l2",
    stop_words="english",
)


def _to_text_list(items: list[dict[str, object]] | list[str]) -> list[str]:
    texts: list[str] = []
    for item in items:
        if isinstance(item, dict):
            texts.append(str(item.get("text", "")))
        else:
            texts.append(str(item))
    return texts


def embed_chunks(chunks: list[dict[str, object]] | list[str]) -> np.ndarray:
    texts = _to_text_list(chunks)
    if not texts:
        return np.empty((0, VECTOR_SIZE), dtype=np.float32)
    return _VECTORIZER.transform(texts).toarray().astype("float32")


def embed_query(query: str) -> np.ndarray:
    normalized = query.strip()
    if not normalized:
        raise ValueError("Question must not be empty.")
    return embed_chunks([normalized])[0]
