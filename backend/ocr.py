from __future__ import annotations

import io
import warnings
from collections.abc import Callable, Iterator
from dataclasses import dataclass

from PIL import Image, ImageOps

from .config import OCR_ENABLED, OCR_LANGUAGES

try:
    import pytesseract
    from pytesseract import TesseractError, TesseractNotFoundError
except ImportError:  # pragma: no cover - pytesseract ships with requirements.txt
    pytesseract = None
    TesseractError = TesseractNotFoundError = Exception  # type: ignore[assignment,misc]

"""
Reading a photographed card.

One OCR pass is not enough, and the difference is not marginal. Measured
against the transcription of `tests/fixtures/soil_health_card_marathi.pdf`:

    default settings (PSM 3, no scaling)      3 / 12 readings, two of them wrong
    PSM 6 + upscaling                        12 / 12 readings, all exact

The cause is page segmentation. Tesseract's default mode tries to work out the
document's layout for itself and treats the bilingual readings table as several
competing blocks, which shreds the rows. PSM 6 — "assume a single uniform block
of text" — reads the table as the table it is.

Which configuration wins still varies with the image, so this module does not
pick one. It offers a ranked series of attempts and lets the caller score them
on what actually matters: how many of the twelve readings came out. That scorer
lives in `document_service`, because only it knows what a good result looks
like.

Ordering matters — the first attempt to reach a perfect score wins and the rest
are skipped, so the common case costs one pass, not six.
"""

_availability_checked = False
_available = False

# Below this, Tesseract is reading letterforms too small to be sure of. Phone
# photos are usually well above it; a downscaled screenshot or a render at
# 150 dpi is not, and those are exactly the cases that failed before.
TARGET_WIDTH = 2400
MAX_UPSCALE = 4.0
BOOST_FACTOR = 1.6
#: Past this, another pass costs seconds and buys nothing.
MAX_WIDTH = 5200


@dataclass(frozen=True)
class OcrAttempt:
    """One way of asking. `psm` is Tesseract's page segmentation mode."""

    name: str
    prepare: str
    psm: int
    languages: str | None = None


def attempts(languages: str | None = None) -> list[OcrAttempt]:
    """Ranked best-first, from a sweep of DPI x preprocessing x language x PSM
    against the fixture.

    The list is deliberately diverse rather than tuned. Sweeping scale against
    input resolution produced no single winner — normalising every image to one
    width read 12 of 12 at some resolutions and 7 of 12 at others, with no
    monotonic trend. Tesseract's accuracy on a dense bilingual table is simply
    not a smooth function of scale, so the useful response is to give the
    search several genuinely different things to try and let the scorer pick,
    not to pick a constant that happens to suit one fixture.

    The last entry is the old default, kept as a floor rather than because it
    is good.
    """
    primary = languages or OCR_LANGUAGES
    return [
        OcrAttempt("scaled/psm6", "scaled", 6, primary),
        OcrAttempt("plain/psm6", "plain", 6, primary),
        OcrAttempt("boost/psm6", "boost", 6, primary),
        OcrAttempt("scaled/psm4", "scaled", 4, primary),
        OcrAttempt("boost/psm4", "boost", 4, primary),
        # English alone: when the Devanagari model is what is mangling the
        # Latin labels, dropping it recovers them. The numbers are script-free.
        OcrAttempt("scaled/psm6/eng", "scaled", 6, "eng"),
        OcrAttempt("binary/psm6", "binary", 6, primary),
        OcrAttempt("plain/psm3", "plain", 3, primary),
    ]


def is_ocr_available() -> bool:
    """Whether OCR can actually run: pytesseract is importable, the feature is
    enabled, and the tesseract binary itself is callable. The binary check is
    cached since it shells out to `tesseract --version`."""
    global _availability_checked, _available

    if not OCR_ENABLED or pytesseract is None:
        return False

    if not _availability_checked:
        try:
            pytesseract.get_tesseract_version()
            _available = True
        except Exception:
            _available = False
        _availability_checked = True

    return _available


def _prepare(image: Image.Image, mode: str) -> Image.Image:
    """Soil health cards are a flat-lit photo of a printed table, so grayscale
    plus autocontrast does most of the work without dragging in opencv."""
    prepared = ImageOps.autocontrast(ImageOps.grayscale(image))

    if mode == "scaled" and prepared.width < TARGET_WIDTH:
        # Bring a small image up to something Tesseract can resolve letterforms
        # in. Never shrinks: downscaling a high-resolution scan measured far
        # worse than leaving it alone.
        prepared = _resize(prepared, min(TARGET_WIDTH / prepared.width, MAX_UPSCALE))
    elif mode == "boost":
        # A modest upscale applied whatever the size. Covers the middle ground
        # where an image is already past TARGET_WIDTH — so "scaled" is a no-op
        # and duplicates "plain" — but still reads better slightly larger.
        prepared = _resize(prepared, BOOST_FACTOR)
    elif mode == "binary":
        prepared = prepared.point(lambda pixel: 255 if pixel > 160 else 0, mode="L")

    return prepared


def _resize(image: Image.Image, factor: float) -> Image.Image:
    if factor <= 1.0:
        return image
    # Guard against a huge input becoming an enormous one: Tesseract slows
    # roughly with pixel count, and a farmer is waiting.
    width = min(int(image.width * factor), MAX_WIDTH)
    height = int(image.height * (width / image.width))
    return image.resize((width, height), Image.LANCZOS)


def _run(image: Image.Image, attempt: OcrAttempt) -> str:
    languages = attempt.languages or OCR_LANGUAGES
    config = f"--psm {attempt.psm}"
    try:
        text = pytesseract.image_to_string(image, lang=languages, config=config)
    except (TesseractError, TesseractNotFoundError) as exc:
        if languages == "eng":
            warnings.warn(
                f"OCR failed even with the base 'eng' language pack: {exc}", RuntimeWarning
            )
            return ""
        # Usually a language pack that is not installed on this machine. Retry
        # in English rather than losing the page.
        warnings.warn(
            f"OCR with languages '{languages}' failed ({exc}); retrying with 'eng' only. "
            "Install the missing tessdata language pack to OCR non-English text.",
            RuntimeWarning,
        )
        try:
            text = pytesseract.image_to_string(image, lang="eng", config=config)
        except Exception:
            return ""

    return text.strip()


def _normalize(text: str) -> str:
    return "\n".join(" ".join(line.split()) for line in text.splitlines() if line.strip())


def recognize_variants(
    image_bytes: bytes, *, languages: str | None = None
) -> Iterator[tuple[str, str]]:
    """Yield `(attempt name, text)`, best configuration first."""
    if not is_ocr_available():
        return

    try:
        source = Image.open(io.BytesIO(image_bytes))
        source.load()
    except Exception:
        return

    # Phones write orientation into EXIF rather than rotating the pixels. A
    # card read sideways is a card not read at all.
    try:
        source = ImageOps.exif_transpose(source) or source
    except Exception:
        pass

    prepared_cache: dict[str, Image.Image] = {}
    for attempt in attempts(languages):
        if attempt.prepare not in prepared_cache:
            try:
                prepared_cache[attempt.prepare] = _prepare(source, attempt.prepare)
            except Exception:
                continue
        text = _normalize(_run(prepared_cache[attempt.prepare], attempt))
        if text:
            yield attempt.name, text


def recognize_all(
    image_bytes: bytes,
    *,
    score: Callable[[str], int] | None = None,
    perfect: int | None = None,
    languages: str | None = None,
) -> list[tuple[str, str, int]]:
    """Every attempt worth keeping, as `(name, text, score)`, best first.

    All of them, not just the winner, because no single attempt is reliably
    complete and — the measurement that decided this — **different attempts
    drop different rows**. On a 300-dpi render of the fixture:

        scaled/psm6       8/12   missing nitrogen, organic carbon, sulphur, copper
        scaled/psm6/eng  11/12   missing copper
        binary/psm6      10/12   missing organic carbon, copper
        boost/psm6        9/12   missing organic carbon, sulphur, copper
        ------------------------------------------------------------------
        union            12/12

    The best single attempt reads 11. Merging them reads 12. Each row is
    independently anchored to its own label, range and plausibility check
    before it is accepted, so combining rows across attempts cannot invent one
    that no attempt saw — it can only recover rows that a given pass missed.

    Stops early only when one attempt is already `perfect`, so a clean card
    still costs a single pass.
    """
    results: list[tuple[str, str, int]] = []

    for name, text in recognize_variants(image_bytes, languages=languages):
        value = score(text) if score else 0
        results.append((name, text, value))
        if perfect is not None and value >= perfect:
            break

    results.sort(key=lambda item: item[2], reverse=True)
    return results


def recognize_best(
    image_bytes: bytes,
    *,
    score: Callable[[str], int] | None = None,
    perfect: int | None = None,
    languages: str | None = None,
) -> tuple[str, str]:
    """The single best reading of this image, as `(attempt name, text)`."""
    if score is None:
        for name, text in recognize_variants(image_bytes, languages=languages):
            return name, text
        return "", ""

    results = recognize_all(
        image_bytes, score=score, perfect=perfect, languages=languages
    )
    return (results[0][0], results[0][1]) if results else ("", "")


def recognize_text_from_image_bytes(
    image_bytes: bytes, *, languages: str | None = None
) -> str:
    """Single-pass OCR. Returns "" if OCR is unavailable or finds nothing, and
    never raises for the caller's normal control flow — a page that fails OCR
    should be treated like a page with no extractable text, not abort the
    whole upload."""
    return recognize_best(image_bytes, languages=languages)[1]
