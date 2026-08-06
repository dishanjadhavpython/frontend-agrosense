from __future__ import annotations

import re

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer


def _sentence_windows(text: str) -> list[str]:
    sentences = [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])\s+|\n+", text)
        if sentence.strip()
    ]
    return sentences or [text]


def extract_keywords(text: str, top_n: int = 12) -> list[str]:
    normalized = " ".join(text.split())
    if not normalized:
        return []

    windows = _sentence_windows(normalized)
    vectorizer = TfidfVectorizer(
        stop_words="english",
        ngram_range=(1, 2),
        max_features=256,
    )
    matrix = vectorizer.fit_transform(windows)
    if matrix.shape[1] == 0:
        return []

    scores = np.asarray(matrix.sum(axis=0)).ravel()
    feature_names = vectorizer.get_feature_names_out()
    ranked_indices = scores.argsort()[::-1]

    keywords: list[str] = []
    for index in ranked_indices:
        keyword = feature_names[index]
        if scores[index] <= 0:
            continue
        keywords.append(keyword)
        if len(keywords) == top_n:
            break

    return keywords
