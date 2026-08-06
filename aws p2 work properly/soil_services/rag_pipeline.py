from __future__ import annotations

import re

STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "for",
    "from",
    "how",
    "in",
    "is",
    "of",
    "on",
    "or",
    "the",
    "to",
    "what",
    "when",
    "where",
    "which",
    "who",
    "why",
}


def _question_terms(question: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[A-Za-z0-9']+", question.lower())
        if len(token) > 2 and token not in STOP_WORDS
    }


def _score_sentence(sentence: str, terms: set[str], source_score: float) -> float:
    lowered = sentence.lower()
    overlap = sum(1 for term in terms if term in lowered)
    length_bonus = min(len(sentence.split()) / 40, 1.0)
    return overlap + source_score + length_bonus


def generate_answer(question: str, retrieved_chunks: list[dict[str, object]]) -> str:
    if not retrieved_chunks:
        return "No relevant information found."

    terms = _question_terms(question)
    candidates: list[tuple[float, str]] = []
    seen_sentences: set[str] = set()

    for chunk in retrieved_chunks:
        for sentence in re.split(r"(?<=[.!?])\s+", str(chunk["text"])):
            cleaned = " ".join(sentence.split()).strip()
            if len(cleaned) < 30:
                continue
            lowered = cleaned.lower()
            if lowered in seen_sentences:
                continue
            seen_sentences.add(lowered)
            score = _score_sentence(cleaned, terms, float(chunk.get("score", 0)))
            candidates.append((score, cleaned))

    candidates.sort(key=lambda item: item[0], reverse=True)
    selected = [sentence for _, sentence in candidates[:3] if sentence]
    if selected:
        return " ".join(selected)

    fallback = str(retrieved_chunks[0]["text"]).strip()
    return fallback[:600] + ("..." if len(fallback) > 600 else "")
