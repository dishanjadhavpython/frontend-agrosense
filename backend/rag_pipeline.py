from __future__ import annotations

import re
from typing import Any

from .config import OLLAMA_MODEL
from .llm import OllamaGenerationError, generate_farmer_answer

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


def _generate_extractive_answer(question: str, retrieved_chunks: list[dict[str, object]]) -> str:
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


# Which reading a question is about, in either language a farmer might use.
# Keyed to `soil_report.SOIL_METRICS`.
METRIC_SYNONYMS: dict[str, tuple[str, ...]] = {
    "available_nitrogen": ("nitrogen", "urea", "n level", "नत्र", "नायट्रोजन", "युरिया"),
    "available_phosphorus": ("phosphorus", "phosphorous", "phosphate", "dap", "स्फुरद"),
    "available_potassium": ("potassium", "potash", "mop", "पालाश", "पोटॅश"),
    "ph": ("ph", "acidity", "alkaline", "acidic", "सामू", "आम्ल", "विम्ल"),
    "ec": ("ec", "salinity", "salt", "क्षारता", "क्षार"),
    "organic_carbon": ("organic carbon", "carbon", "organic matter", "सेंद्रिय", "कर्ब"),
    "available_sulphur": ("sulphur", "sulfur", "gypsum", "गंधक", "जिप्सम"),
    "available_zinc": ("zinc", "जस्त", "झिंक"),
    "available_iron": ("iron", "ferrous", "लोह"),
    "available_manganese": ("manganese", "मंगल", "मॅंगनीज"),
    "available_copper": ("copper", "तांबे"),
    "available_boron": ("boron", "borax", "बोरॉन"),
}

STATUS_PHRASING = {
    "low": "below the range printed on your card",
    "high": "above the range printed on your card",
    "normal": "within the range printed on your card",
}


def _metrics_the_question_is_about(
    question: str, document_context: dict[str, Any] | None
) -> list[dict[str, Any]]:
    if not document_context:
        return []

    lowered = question.lower()
    wanted = {
        key
        for key, synonyms in METRIC_SYNONYMS.items()
        if any(synonym in lowered for synonym in synonyms)
    }
    if not wanted:
        return []

    return [
        metric
        for metric in document_context.get("soil_metrics") or []
        if str(metric.get("key")) in wanted
    ]


def _answer_from_readings(metrics: list[dict[str, Any]], needs_review: bool) -> str:
    """Answer a reading question from the extracted table rather than from
    retrieved prose.

    Retrieval alone cannot do this on a real card. The extractive scorer splits
    candidate sentences on `.!?`, and Marathi uses neither — so the whole page
    scores as one sentence and "what is my nitrogen?" comes back as the
    farmer's name and address. The numbers were already parsed at ingest; using
    them is both more accurate and more honest than quoting the page at someone.
    """
    lines = []
    for metric in metrics:
        status = STATUS_PHRASING.get(str(metric.get("status_code")), "recorded")
        lines.append(
            f"{metric.get('label')}: {metric.get('reading_display')} — {status} "
            f"({metric.get('range_display')})."
        )

    answer = " ".join(lines)
    if needs_review:
        answer += (
            " These figures were read from a photograph rather than a PDF, so check "
            "them against the card before acting on them."
        )
    return answer


def _fallback_source_note(has_sources: bool) -> str:
    if has_sources:
        return "Llama was unavailable, so AgroSense used a fallback answer from indexed report snippets."
    return "No report snippets were available for fallback."


def _llama_source_note(
    *,
    has_sources: bool,
    document_context: dict[str, Any] | None,
) -> str:
    document_name = ""
    if document_context:
        document_name = str(document_context.get("name") or document_context.get("filename") or "").strip()

    if has_sources and document_name:
        return f"Generated with {OLLAMA_MODEL} using retrieved context from {document_name}."
    if has_sources:
        return f"Generated with {OLLAMA_MODEL} using indexed report context."
    if document_name:
        return f"Generated with {OLLAMA_MODEL} using the selected report summary plus general farming guidance."
    return f"Generated with {OLLAMA_MODEL} using general farming knowledge."


def generate_answer(
    question: str,
    retrieved_chunks: list[dict[str, object]],
    document_context: dict[str, Any] | None = None,
    conversation_history: list[dict[str, str]] | None = None,
) -> dict[str, str]:
    # Asked about a specific reading, and we parsed that reading at ingest.
    # Answer from the table before reaching for either the model or the prose:
    # it is the one path here that cannot invent or misquote a number.
    readings = _metrics_the_question_is_about(question, document_context)
    if readings:
        return {
            "answer": _answer_from_readings(
                readings, bool((document_context or {}).get("needs_review"))
            ),
            "answer_mode": "extracted_readings",
            "source_note": "Answered directly from the readings extracted from your card.",
        }

    llm_error = ""
    try:
        answer = generate_farmer_answer(
            question,
            retrieved_chunks,
            document_context,
            conversation_history=conversation_history,
        )
        return {
            "answer": answer,
            "answer_mode": "llama_rag" if retrieved_chunks else "llama_general",
            "source_note": _llama_source_note(
                has_sources=bool(retrieved_chunks),
                document_context=document_context,
            ),
        }
    except OllamaGenerationError as exc:
        llm_error = str(exc)

    if retrieved_chunks:
        return {
            "answer": _generate_extractive_answer(question, retrieved_chunks),
            "answer_mode": "extractive_fallback",
            "source_note": _fallback_source_note(True),
        }

    if llm_error:
        return {
            "answer": (
                "I couldn't use the local Llama model right now. "
                f"{llm_error}"
            ),
            "answer_mode": "llm_unavailable",
            "source_note": _fallback_source_note(False),
        }

    return {
        "answer": (
            "No indexed report content is available yet. Upload a PDF for report-based answers, "
            "or start the local Llama service for general farming questions."
        ),
        "answer_mode": "no_context",
        "source_note": _fallback_source_note(False),
    }
