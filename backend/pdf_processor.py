from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import fitz

from .config import OCR_DPI
from .ocr import is_ocr_available, recognize_best


def _normalize_page_text(raw_text: str) -> str:
    lines: list[str] = []
    for line in raw_text.splitlines():
        cleaned = " ".join(line.split())
        if cleaned:
            lines.append(cleaned)
    return "\n".join(lines)


def _ocr_page(page: fitz.Page, score: Callable[[str], int] | None) -> str:
    """A page with no text layer, rendered and read.

    Rendered at `OCR_DPI` and handed to the multi-pass reader, which tries
    several page-segmentation and preprocessing configurations and keeps
    whichever recovers the most readings. A single default pass recovered 3 of
    12 on the test card; the search recovers all 12.
    """
    pixmap = page.get_pixmap(dpi=OCR_DPI)
    _attempt, text = recognize_best(
        pixmap.tobytes("png"),
        score=score,
        # A scanned card may legitimately span pages, so a page that yields
        # fewer than twelve is not necessarily a bad read. Twelve is still the
        # point at which no further attempt can improve on this page.
        perfect=12 if score else None,
    )
    return _normalize_page_text(text)


def extract_text(
    file_path: str | Path, *, score: Callable[[str], int] | None = None
) -> tuple[str, list[dict[str, object]], list[int]]:
    """Extract text per page. Pages with no embedded/selectable text (e.g. a
    scanned or photographed soil health card) fall back to OCR on a rendered
    image of that page. Returns (full_text, pages, ocr_page_numbers) so callers
    can tell which pages needed OCR recovery.

    `score` rates a candidate OCR text so the reader can choose between
    configurations; see `ocr.recognize_best`.
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"PDF not found: {path}")

    pages: list[dict[str, object]] = []
    full_text: list[str] = []
    ocr_page_numbers: list[int] = []
    ocr_available = is_ocr_available()

    with fitz.open(path) as document:
        if document.page_count == 0:
            raise ValueError("The PDF has no pages.")

        for page_number, page in enumerate(document, start=1):
            text = _normalize_page_text(page.get_text("text"))
            source = "native"

            if not text and ocr_available:
                text = _ocr_page(page, score)
                source = "ocr"

            if not text:
                continue

            pages.append({"page": page_number, "text": text, "source": source})
            full_text.append(text)
            if source == "ocr":
                ocr_page_numbers.append(page_number)

    if not pages:
        if ocr_available:
            raise ValueError("No extractable text was found in the PDF, even after attempting OCR.")
        raise ValueError(
            "No extractable text was found in the PDF. This looks like a scanned document; "
            "install Tesseract OCR to enable automatic text recovery for scanned reports."
        )

    return "\n\n".join(full_text), pages, ocr_page_numbers
