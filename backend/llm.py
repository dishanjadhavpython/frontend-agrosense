from __future__ import annotations

import re
from typing import Any

import httpx

from .config import (
    OLLAMA_BASE_URL,
    OLLAMA_ENABLED,
    OLLAMA_MODEL,
    OLLAMA_REQUEST_TIMEOUT_SECONDS,
    OLLAMA_TEMPERATURE,
)


class OllamaGenerationError(RuntimeError):
    """Raised when the local Ollama-backed Llama model cannot answer."""


def _normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _clip_text(text: str, limit: int) -> str:
    normalized = _normalize_whitespace(text)
    if len(normalized) <= limit:
        return normalized
    return normalized[: max(0, limit - 3)].rstrip() + "..."


def _format_metric(metric: dict[str, Any]) -> str:
    label = str(metric.get("label") or metric.get("key") or "Reading")
    reading = metric.get("reading")
    if reading is None:
        return ""

    value = str(reading)
    unit = _normalize_whitespace(str(metric.get("unit") or ""))
    status = str(metric.get("status") or metric.get("status_code") or "").strip().replace("_", " ")

    if unit:
        value = f"{value} {unit}"
    if status:
        value = f"{value} ({status})"
    return f"- {label}: {value}"


def _format_document_context(document_context: dict[str, Any] | None) -> str:
    if not document_context:
        return "No soil report is currently selected."

    lines = [
        f"Selected report: {document_context.get('name') or document_context.get('filename') or 'Unknown report'}",
        f"Report summary: {_clip_text(str(document_context.get('summary') or 'No report summary is available.'), 500)}",
    ]

    keywords = [
        str(item).strip()
        for item in list(document_context.get("keywords") or [])[:8]
        if str(item).strip()
    ]
    if keywords:
        lines.append("Report keywords: " + ", ".join(keywords))

    metric_lines = [
        formatted
        for formatted in (
            _format_metric(item)
            for item in list(document_context.get("soil_metrics") or [])[:8]
            if isinstance(item, dict)
        )
        if formatted
    ]
    if metric_lines:
        lines.append("Extracted soil readings:")
        lines.extend(metric_lines)

    return "\n".join(lines)


def _format_retrieved_context(retrieved_chunks: list[dict[str, Any]]) -> str:
    if not retrieved_chunks:
        return "No retrieved report passages were available for this question."

    sections: list[str] = []
    for index, chunk in enumerate(retrieved_chunks[:4], start=1):
        snippet = _clip_text(str(chunk.get("text") or ""), 900)
        if not snippet:
            continue

        file_name = str(chunk.get("file") or "Document")
        page = chunk.get("page") or "n/a"
        score = float(chunk.get("score") or 0.0)
        sections.append(
            f"[Snippet {index} | File: {file_name} | Page: {page} | Relevance: {score:.2f}]\n{snippet}"
        )

    if not sections:
        return "No retrieved report passages were available for this question."
    return "\n\n".join(sections)


def _format_conversation_history(conversation_history: list[dict[str, Any]] | None) -> str:
    if not conversation_history:
        return "No previous conversation."

    lines: list[str] = []
    for message in conversation_history[-6:]:
        role = str(message.get("role") or "user").strip().lower()
        if role not in {"user", "assistant"}:
            role = "user"
        content = _clip_text(str(message.get("content") or ""), 600)
        if not content:
            continue
        speaker = "Farmer" if role == "user" else "AgroSense"
        lines.append(f"{speaker}: {content}")

    if not lines:
        return "No previous conversation."
    return "\n".join(lines)


def _build_prompt(
    question: str,
    retrieved_chunks: list[dict[str, Any]],
    document_context: dict[str, Any] | None,
    conversation_history: list[dict[str, Any]] | None,
) -> str:
    return f"""
Farmer question:
{question.strip()}

Recent conversation:
{_format_conversation_history(conversation_history)}

Document context:
{_format_document_context(document_context)}

Retrieved report excerpts:
{_format_retrieved_context(retrieved_chunks)}

Answer for the farmer:
- Prefer practical, simple guidance.
- Reply in the same language as the question when possible.
- If report evidence is relevant, explicitly ground the answer in it.
- If the answer goes beyond the report, clearly say it is general farming guidance.
- Keep the answer concise and action-oriented.
- Format clearly with short paragraphs and compact bullet points when giving steps.
- If the farmer asks a follow-up question, use the recent conversation to resolve references like "this", "that", or "the report".
""".strip()


def _clean_model_output(answer: str) -> str:
    cleaned = re.sub(r"<think>.*?</think>", " ", answer, flags=re.IGNORECASE | re.DOTALL)
    cleaned = cleaned.replace("\r\n", "\n").replace("\r", "\n")

    normalized_lines = [re.sub(r"[ \t]+", " ", line).strip() for line in cleaned.split("\n")]
    compact_lines: list[str] = []
    blank_pending = False

    for line in normalized_lines:
        if not line:
            if compact_lines and not blank_pending:
                compact_lines.append("")
                blank_pending = True
            continue
        compact_lines.append(line)
        blank_pending = False

    return "\n".join(compact_lines).strip()


def generate_farmer_answer(
    question: str,
    retrieved_chunks: list[dict[str, Any]],
    document_context: dict[str, Any] | None = None,
    conversation_history: list[dict[str, Any]] | None = None,
) -> str:
    if not OLLAMA_ENABLED:
        raise OllamaGenerationError("Local Llama support is disabled.")

    timeout = httpx.Timeout(OLLAMA_REQUEST_TIMEOUT_SECONDS, connect=min(10.0, OLLAMA_REQUEST_TIMEOUT_SECONDS))
    payload = {
        "model": OLLAMA_MODEL,
        "system": (
            "You are AgroSense, a practical agriculture assistant for farmers. "
            "Answer clearly, avoid hallucinating soil readings, say when advice is general guidance, "
            "and structure replies so they are easy to scan in a chat UI."
        ),
        "prompt": _build_prompt(question, retrieved_chunks, document_context, conversation_history),
        "stream": False,
        "options": {
            "temperature": OLLAMA_TEMPERATURE,
        },
    }

    try:
        with httpx.Client(timeout=timeout) as client:
            response = client.post(f"{OLLAMA_BASE_URL}/api/generate", json=payload)
            response.raise_for_status()
    except httpx.ConnectError as exc:
        raise OllamaGenerationError(
            f"Couldn't reach Ollama at {OLLAMA_BASE_URL}. Start `ollama serve` and try again."
        ) from exc
    except httpx.HTTPStatusError as exc:
        detail = _normalize_whitespace(exc.response.text)
        if exc.response.status_code == 404 and "model" in detail.lower():
            raise OllamaGenerationError(
                f"The Ollama model `{OLLAMA_MODEL}` is not installed. Run `ollama pull {OLLAMA_MODEL}`."
            ) from exc
        raise OllamaGenerationError(
            f"Ollama returned HTTP {exc.response.status_code}. {detail or 'The request failed.'}"
        ) from exc
    except httpx.HTTPError as exc:
        raise OllamaGenerationError(f"Ollama request failed: {exc}") from exc

    try:
        body = response.json()
    except ValueError as exc:
        raise OllamaGenerationError("Ollama returned an invalid JSON response.") from exc

    if body.get("error"):
        detail = _normalize_whitespace(str(body["error"]))
        if "model" in detail.lower() and "not found" in detail.lower():
            raise OllamaGenerationError(
                f"The Ollama model `{OLLAMA_MODEL}` is not installed. Run `ollama pull {OLLAMA_MODEL}`."
            )
        raise OllamaGenerationError(detail)

    answer = _clean_model_output(str(body.get("response") or ""))
    if not answer:
        raise OllamaGenerationError("Ollama returned an empty answer.")
    return answer
