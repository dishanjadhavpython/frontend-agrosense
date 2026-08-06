from __future__ import annotations

from typing import Sequence


def chunk_pages(
    pages: Sequence[dict[str, object]],
    chunk_size: int = 180,
    overlap: int = 30,
) -> list[dict[str, object]]:
    if chunk_size <= 0:
        raise ValueError("chunk_size must be greater than zero.")
    if overlap < 0 or overlap >= chunk_size:
        raise ValueError("overlap must be between 0 and chunk_size - 1.")

    chunks: list[dict[str, object]] = []
    for page in pages:
        page_number = int(page["page"])
        words = str(page["text"]).split()
        if not words:
            continue

        start = 0
        chunk_index = 0
        while start < len(words):
            end = min(start + chunk_size, len(words))
            chunk_text = " ".join(words[start:end]).strip()
            if chunk_text:
                chunks.append(
                    {
                        "page": page_number,
                        "chunk_id": f"{page_number}-{chunk_index}",
                        "text": chunk_text,
                    }
                )

            if end >= len(words):
                break

            start = end - overlap
            chunk_index += 1

    if not chunks:
        raise ValueError("Unable to create chunks from the extracted PDF text.")

    return chunks
