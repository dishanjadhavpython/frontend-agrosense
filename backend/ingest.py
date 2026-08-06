from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

from .config import OCR_LANGUAGES
from .ocr import is_ocr_available, recognize_all
from .pdf_processor import extract_text as extract_pdf_text

"""
One door for every way a card arrives.

Farmers photograph the card far more often than they export a PDF of it, so the
upload UI has always accepted JPG and PNG — but the pipeline behind it was
PDF-only, which left the primary path broken. This module is the join: bytes
and a filename go in, the same `(text, pages, ocr_pages)` shape that
`soil_report` already consumes comes out, whichever form it was.

A photograph is entirely dependent on OCR, so `UnreadableDocument` distinguishes
"OCR is not installed on this server" from "OCR ran and this image had no legible
text". Those need different things from the person holding the phone — one is
ours to fix, the other is a retake — and collapsing them into one error message
is how you get a farmer re-photographing a card twelve times against a server
that was never going to read it.
"""

#: All twelve readings recovered — no configuration can do better, so stop.
PERFECT_SCORE = 12

PDF_SUFFIXES = {".pdf"}
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".bmp"}
HEIC_SUFFIXES = {".heic", ".heif"}

def supported_suffixes() -> set[str]:
    """What this instance can actually take, which is not a constant: HEIC
    depends on an optional library. Advertising a format we would then reject
    is how a farmer ends up blaming their photo for our missing dependency."""
    supported = PDF_SUFFIXES | IMAGE_SUFFIXES
    if HEIC_SUPPORTED:
        supported |= HEIC_SUFFIXES
    return supported

# iPhones shoot HEIC. Safari transcodes to JPEG for ordinary file uploads, so
# this only bites on a file dragged straight out of the macOS Photos library —
# which is why the dependency is optional rather than in requirements.txt.
try:  # pragma: no cover - depends on an optional system library
    import pillow_heif

    pillow_heif.register_heif_opener()
    HEIC_SUPPORTED = True
except Exception:  # pragma: no cover
    HEIC_SUPPORTED = False


class UnsupportedDocument(ValueError):
    """The file is not something we can even attempt to read."""


class UnreadableDocument(ValueError):
    """We tried and recovered no text. `ocr_available` says whose problem it is."""

    def __init__(self, message: str, *, ocr_available: bool) -> None:
        super().__init__(message)
        self.ocr_available = ocr_available


@dataclass
class ExtractedDocument:
    text: str
    pages: list[dict[str, object]]
    ocr_pages: list[int] = field(default_factory=list)
    #: "native" when the text was already in the file, "ocr" when it was
    #: recovered from pixels. Drives the "check these against your card"
    #: warning the UI shows, so it has to be honest.
    source: str = "native"
    #: Which OCR configuration won, for diagnosing a card that read badly.
    ocr_attempt: str = ""
    #: Every OCR pass's text, best first. `text` is the best single one and is
    #: what gets indexed; these exist so the caller can merge readings across
    #: passes, which recovers rows any one pass dropped.
    candidates: list[str] = field(default_factory=list)

    @property
    def used_ocr(self) -> bool:
        return bool(self.ocr_pages)


def classify(filename: str) -> str:
    """"pdf" | "image" — or raise. Extension-based on purpose: browsers report
    `""` for HEIC often enough that trusting the MIME type loses real files."""
    suffix = Path(filename or "").suffix.lower()

    if suffix in PDF_SUFFIXES:
        return "pdf"
    if suffix in IMAGE_SUFFIXES:
        return "image"
    if suffix in HEIC_SUFFIXES:
        if not HEIC_SUPPORTED:
            raise UnsupportedDocument(
                "HEIC photos need the optional pillow-heif package on the server "
                "(brew install libheif && pip install pillow-heif). Send a JPG or "
                "PNG instead."
            )
        return "image"

    raise UnsupportedDocument(
        f"'{suffix or filename}' is not a supported card. Send a PDF, JPG or PNG."
    )


def _extract_image(path: Path, score: Callable[[str], int] | None) -> ExtractedDocument:
    if not is_ocr_available():
        raise UnreadableDocument(
            "This server cannot read photographs of cards: Tesseract OCR is not "
            "installed. Send the PDF version of the card, or install Tesseract "
            "(brew install tesseract tesseract-lang).",
            ocr_available=False,
        )

    # `perfect=12` is what lets the common case cost a single OCR pass: the
    # first configuration that recovers all twelve readings wins and the rest
    # are never run.
    results = recognize_all(
        path.read_bytes(),
        score=score,
        perfect=PERFECT_SCORE if score else None,
        languages=OCR_LANGUAGES,
    )

    if not results:
        raise UnreadableDocument(
            "No text could be read from this photo. Retake it straight on, in "
            "good light, with the whole card in frame.",
            ocr_available=True,
        )

    attempt, text, _score = results[0]
    return ExtractedDocument(
        # The best single pass is what gets indexed for retrieval: it reads as
        # a document. The others are only useful a row at a time.
        text=text,
        pages=[{"page": 1, "text": text, "source": "ocr"}],
        ocr_pages=[1],
        source="ocr",
        ocr_attempt=attempt,
        candidates=[candidate for _name, candidate, _value in results],
    )


def _extract_pdf(path: Path, score: Callable[[str], int] | None) -> ExtractedDocument:
    try:
        text, pages, ocr_pages = extract_pdf_text(path, score=score)
    except ValueError as exc:
        # `pdf_processor` raises this for a PDF that yielded no text at all,
        # having already attempted OCR if it was available.
        raise UnreadableDocument(str(exc), ocr_available=is_ocr_available()) from exc

    return ExtractedDocument(
        text=text,
        pages=pages,
        ocr_pages=ocr_pages,
        source="ocr" if ocr_pages else "native",
    )


def extract_document(
    path: Path,
    *,
    filename: str | None = None,
    score: Callable[[str], int] | None = None,
) -> ExtractedDocument:
    """Read a stored card. `filename` overrides the path's own name when the
    upload was saved under a generated id.

    `score` rates a candidate text — how many of the twelve readings it yields
    — and is what turns OCR from one guess into a search. Ingest stays free of
    soil knowledge; the scorer is supplied by `document_service`.
    """
    kind = classify(filename or path.name)
    return _extract_pdf(path, score) if kind == "pdf" else _extract_image(path, score)
