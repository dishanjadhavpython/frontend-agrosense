from __future__ import annotations

from pathlib import Path

import fitz


def extract_text(file_path: str | Path) -> tuple[str, list[dict[str, object]]]:
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"PDF not found: {path}")

    pages: list[dict[str, object]] = []
    full_text: list[str] = []

    with fitz.open(path) as document:
        if document.page_count == 0:
            raise ValueError("The PDF has no pages.")

        for page_number, page in enumerate(document, start=1):
            text = " ".join(page.get_text("text").split())
            if not text:
                continue
            pages.append({"page": page_number, "text": text})
            full_text.append(text)

    if not pages:
        raise ValueError("No extractable text was found in the PDF.")

    return "\n\n".join(full_text), pages
