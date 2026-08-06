from __future__ import annotations

import io
import unittest
from pathlib import Path

import fitz

from backend.document_service import DocumentService
from backend.ocr import is_ocr_available
from backend.soil_report import extract_soil_metrics, merge_extractions

FIXTURE = Path(__file__).parent / "fixtures" / "soil_health_card_marathi.pdf"

TRUTH = {
    "available_boron": 0.68,
    "available_nitrogen": 245.15,
    "available_phosphorus": 18.40,
    "available_potassium": 352.75,
    "ph": 8.12,
    "ec": 1.06,
    "organic_carbon": 0.19,
    "available_sulphur": 21.95,
    "available_zinc": 0.31,
    "available_iron": 2.88,
    "available_manganese": 10.42,
    "available_copper": 2.47,
}


def row(key: str, reading: float, low: float, high: float) -> dict[str, object]:
    """One extracted row, as a pass would produce it."""
    return extract_soil_metrics(
        f"SOIL SAMPLE DETAILS {LABELS[key]} {reading} {low} - {high} RECOMMENDATION",
        include_implausible=True,
    )[0]


LABELS = {
    "available_copper": "AVAILABLE COPPER (Cu)",
    "available_zinc": "AVAILABLE ZINC (Zn)",
    "available_nitrogen": "AVAILABLE NITROGEN (N)",
}


class MergeTests(unittest.TestCase):
    """Combining several OCR passes of one card."""

    def test_union_recovers_rows_a_single_pass_dropped(self) -> None:
        # The measurement this whole design rests on: passes drop different
        # rows, so the union beats the best single pass.
        pass_a = [row("available_zinc", 0.31, 0.5, 1)]
        pass_b = [row("available_nitrogen", 245.15, 280, 560)]

        merged = merge_extractions([pass_a, pass_b])
        self.assertEqual(
            [m["key"] for m in merged], ["available_nitrogen", "available_zinc"]
        )

    def test_majority_reading_wins(self) -> None:
        good = row("available_zinc", 0.31, 0.5, 1)
        typo = row("available_zinc", 0.81, 0.5, 1)

        merged = merge_extractions([[typo], [good], [good]])
        self.assertEqual(float(merged[0]["reading"]), 0.31)
        self.assertEqual(merged[0]["agreement"], 2)
        self.assertEqual(merged[0]["sightings"], 3)

    def test_the_majority_range_disqualifies_a_pass_that_misread_it(self) -> None:
        # Exactly the copper failure: most passes read "247, range 1-2" — wrong
        # reading, right range — while two read "34, range 1-5". The rejected
        # majority's range is what proves the 34 is noise.
        implausible_but_right_range = row("available_copper", 247, 1, 2)
        plausible_but_wrong_range = row("available_copper", 34, 1, 5)

        self.assertFalse(implausible_but_right_range["plausible"])
        self.assertTrue(plausible_but_wrong_range["plausible"])

        merged = merge_extractions(
            [
                [implausible_but_right_range],
                [implausible_but_right_range],
                [implausible_but_right_range],
                [plausible_but_wrong_range],
            ]
        )
        # Nothing usable agreed with the winning range, so the row is reported
        # missing rather than at whatever a stray pass said.
        self.assertEqual(merged, [])

    def test_a_good_reading_on_the_majority_range_still_wins(self) -> None:
        merged = merge_extractions(
            [
                [row("available_copper", 247, 1, 2)],
                [row("available_copper", 2.47, 1, 2)],
                [row("available_copper", 34, 1, 5)],
            ]
        )
        self.assertEqual(len(merged), 1)
        self.assertEqual(float(merged[0]["reading"]), 2.47)

    def test_implausible_rows_are_hidden_from_normal_extraction(self) -> None:
        text = "SOIL SAMPLE DETAILS AVAILABLE COPPER (Cu) 247 1 - 2 RECOMMENDATION"
        self.assertEqual(extract_soil_metrics(text), [])
        self.assertEqual(len(extract_soil_metrics(text, include_implausible=True)), 1)


class ReadingFarOutsideItsPrintedRangeTests(unittest.TestCase):
    def test_a_lost_decimal_point_is_refused(self) -> None:
        # 247 against a printed ceiling of 2 is 123x — a misread, not a soil.
        self.assertEqual(
            extract_soil_metrics(
                "SOIL SAMPLE DETAILS AVAILABLE COPPER (Cu) 247 1 - 2 RECOMMENDATION"
            ),
            [],
        )

    def test_a_genuinely_extreme_soil_is_kept(self) -> None:
        # The fixture's own potassium is 1.26x its ceiling, and out-of-range
        # values are the ones a farmer most needs told. The guard must not eat
        # them.
        metrics = extract_soil_metrics(
            "SOIL SAMPLE DETAILS AVAILABLE POTASSIUM (K) 352.75 120 - 280 RECOMMENDATION"
        )
        self.assertEqual(len(metrics), 1)
        self.assertEqual(metrics[0]["status_code"], "high")


@unittest.skipUnless(is_ocr_available(), "Tesseract is not installed")
class PhotographedCardTests(unittest.TestCase):
    """The end-to-end claim: a photograph of this card reads correctly.

    Rendered from the fixture at resolutions spanning what a phone produces.
    A single default OCR pass managed 3 of 12 here, two of them wrong.
    """

    RESOLUTIONS = (120, 150, 200)

    @classmethod
    def setUpClass(cls) -> None:
        cls.images = {}
        with fitz.open(FIXTURE) as document:
            for dpi in cls.RESOLUTIONS:
                cls.images[dpi] = document[0].get_pixmap(dpi=dpi).tobytes("png")

    def test_every_reading_is_recovered_and_correct(self) -> None:
        service = DocumentService()
        for dpi, png in self.images.items():
            with self.subTest(dpi=dpi):
                result = service.ingest(filename=f"card-{dpi}.png", stream=io.BytesIO(png))

                self.assertEqual(result["source"], "ocr")
                self.assertTrue(result["needs_review"])
                self.assertEqual(result["metric_count"], 12, result["missing_metrics"])

                for metric in result["soil_metrics"]:
                    self.assertAlmostEqual(
                        float(metric["reading"]),
                        TRUTH[str(metric["key"])],
                        places=2,
                        msg=f"{metric['key']} misread at {dpi} dpi",
                    )

    def test_ocr_readings_are_never_presented_as_settled(self) -> None:
        service = DocumentService()
        result = service.ingest(
            filename="card-150.png", stream=io.BytesIO(self.images[150])
        )
        self.assertTrue(
            all(m["confidence"] == "unconfirmed" for m in result["soil_metrics"])
        )


if __name__ == "__main__":
    unittest.main()
