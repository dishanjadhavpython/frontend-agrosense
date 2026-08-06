from __future__ import annotations

import unittest
from pathlib import Path

from backend.pdf_processor import extract_text
from backend.soil_report import (
    METRIC_KEYS,
    _flat_metrics,
    _row_metrics,
    _soil_section,
    extract_soil_metrics,
    missing_metric_keys,
    summarize_soil_metrics,
)

FIXTURE = Path(__file__).parent / "fixtures" / "soil_health_card_marathi.pdf"

# Transcribed by eye from the fixture's own printed table. If a change to the
# extractor makes this fail, the extractor is wrong — not this table.
EXPECTED = {
    "available_boron": (0.68, 0.40, 1.00, "normal"),
    "available_nitrogen": (245.15, 280.0, 560.0, "low"),
    "available_phosphorus": (18.40, 10.0, 25.0, "normal"),
    "available_potassium": (352.75, 120.0, 280.0, "high"),
    "ph": (8.12, 7.5, 8.9, "normal"),
    "ec": (1.06, 0.20, 0.90, "high"),
    "organic_carbon": (0.19, 0.20, 0.60, "low"),
    "available_sulphur": (21.95, 10.20, 30.50, "normal"),
    "available_zinc": (0.31, 0.50, 1.00, "low"),
    "available_iron": (2.88, 2.20, 5.60, "normal"),
    "available_manganese": (10.42, 7.10, 9.99, "high"),
    "available_copper": (2.47, 1.0, 2.0, "high"),
}


class RealCardTests(unittest.TestCase):
    """The regression that matters.

    A real bilingual Maharashtra card is the layout this product exists to
    read, and the extractor it replaced managed 2 of 12 on this exact file.
    Anything less than a full, exact read here is a defect.
    """

    @classmethod
    def setUpClass(cls) -> None:
        text, _pages, cls.ocr_pages = extract_text(FIXTURE)
        cls.metrics = extract_soil_metrics(text)

    def test_reads_all_twelve(self) -> None:
        self.assertEqual(len(self.metrics), 12)
        self.assertEqual(missing_metric_keys(self.metrics), [])

    def test_every_value_and_range_is_exact(self) -> None:
        found = {str(metric["key"]): metric for metric in self.metrics}
        for key, (reading, minimum, maximum, status) in EXPECTED.items():
            with self.subTest(metric=key):
                metric = found[key]
                self.assertAlmostEqual(float(metric["reading"]), reading, places=2)
                self.assertAlmostEqual(float(metric["range_min"]), minimum, places=2)
                self.assertAlmostEqual(float(metric["range_max"]), maximum, places=2)
                self.assertEqual(metric["status_code"], status)

    def test_returned_in_card_order(self) -> None:
        self.assertEqual([str(m["key"]) for m in self.metrics], METRIC_KEYS)

    def test_pdf_has_embedded_text_so_no_ocr_was_needed(self) -> None:
        self.assertEqual(self.ocr_pages, [])

    def test_recommendation_block_does_not_leak_into_the_last_metric(self) -> None:
        # The advice below the table is full of numbers ("युरिया – ६५ किलो").
        # Copper is the last row, so it is the one that would swallow them.
        copper = next(m for m in self.metrics if m["key"] == "available_copper")
        self.assertEqual(float(copper["reading"]), 2.47)


class BilingualLayoutTests(unittest.TestCase):
    """The specific shape that defeated the row-based extractor: a Marathi
    label sitting between the English label and the value."""

    SAMPLE = """
    SOIL SAMPLE DETAILS
    AVAILABLE NITROGEN (N)
    उपलब्ध नत्र (N)
    245.15
    280 - 560
    AVAILABLE ZINC (Zn)
    उपलब्ध जस्त (Zn)
    0.31
    0.50 - 1.00
    शिफारस / RECOMMENDATION
    युरिया 65 किलो प्रति हेक्टर
    """

    def test_reads_through_the_interleaved_label(self) -> None:
        metrics = extract_soil_metrics(self.SAMPLE)
        self.assertEqual(len(metrics), 2)
        self.assertEqual(float(metrics[0]["reading"]), 245.15)
        self.assertEqual(metrics[0]["status_code"], "low")
        self.assertEqual(float(metrics[1]["reading"]), 0.31)
        self.assertEqual(metrics[1]["status_code"], "low")


class FlatLayoutTests(unittest.TestCase):
    """English-only, everything on one line — the shape the original tests in
    `aws p2 work properly/tests/` covered. Kept so the merge did not regress it."""

    SAMPLE = """
    SOIL SAMPLE DETAILS
    AVAILABLE NITROGEN (N) 540.10 280 560
    AVAILABLE PHOSPHORUS (P) 30.50 10 25
    ORGANIC CARBON (OC) 0.55 0.20 0.60
    AVAILABLE ZINC (Zn) 1.20 0.50 1.00
    RECOMMENDATION
    """

    def test_extracts_and_flags(self) -> None:
        metrics = extract_soil_metrics(self.SAMPLE)
        self.assertEqual(len(metrics), 4)
        by_key = {str(m["key"]): m for m in metrics}
        self.assertEqual(by_key["available_phosphorus"]["status_code"], "high")
        self.assertEqual(by_key["available_nitrogen"]["status_code"], "normal")
        self.assertIn("Out-of-range values", summarize_soil_metrics(metrics))


class OutOfOrderTests(unittest.TestCase):
    def test_metrics_printed_out_of_order_are_still_read(self) -> None:
        # The extractor this replaced searched forward from the previous match,
        # so anything printed out of sequence was silently dropped.
        sample = """
        SOIL SAMPLE DETAILS
        AVAILABLE ZINC (Zn) 0.31 0.50 - 1.00
        AVAILABLE NITROGEN (N) 245.15 280 - 560
        RECOMMENDATION
        """
        metrics = extract_soil_metrics(sample)
        self.assertEqual(len(metrics), 2)
        # Returned in card order regardless of the order they were printed in.
        self.assertEqual(
            [str(m["key"]) for m in metrics],
            ["available_nitrogen", "available_zinc"],
        )


class ExtractorAgreementTests(unittest.TestCase):
    """Both readers must reach the same twelve on the real card independently.

    They failed in opposite directions before this merge — the flat one missed
    phosphorus and the row-based one missed ten — so agreement here is the
    signal that neither is carrying the other.
    """

    def test_flat_and_row_readers_agree_on_the_real_card(self) -> None:
        text, _pages, _ocr = extract_text(FIXTURE)
        section = _soil_section(text)
        flat = {str(m["key"]): float(m["reading"]) for m in _flat_metrics(section)}
        rows = {str(m["key"]): float(m["reading"]) for m in _row_metrics(section)}

        self.assertEqual(len(flat), 12)
        self.assertEqual(len(rows), 12)
        self.assertEqual(flat, rows)


class NeighbourAbsorptionTests(unittest.TestCase):
    """The flat reader's dangerous failure: an unrecognised label lets the
    previous metric swallow its numbers and report them as its own."""

    def test_a_segment_running_past_a_missed_label_is_refused(self) -> None:
        # "AVAILABLE UNOBTAINIUM" is not a metric, so nitrogen's segment runs
        # through its numbers. Nitrogen must NOT come back as 18.40.
        section = _soil_section(
            "SOIL SAMPLE DETAILS "
            "AVAILABLE NITROGEN (N) 245.15 280 - 560 "
            "AVAILABLE UNOBTAINIUM (X) 18.40 10 - 25 "
            "AVAILABLE ZINC (Zn) 0.31 0.50 - 1.00 "
            "RECOMMENDATION"
        )
        flat = {str(m["key"]): float(m["reading"]) for m in _flat_metrics(section)}
        self.assertNotIn("available_nitrogen", flat)
        self.assertEqual(flat.get("available_zinc"), 0.31)

    def test_the_row_reader_still_recovers_that_metric(self) -> None:
        # And this is why both run: the row reader is anchored per label, so
        # the unknown neighbour costs it nothing.
        metrics = extract_soil_metrics(
            "SOIL SAMPLE DETAILS\n"
            "AVAILABLE NITROGEN (N)\n245.15\n280 - 560\n"
            "AVAILABLE UNOBTAINIUM (X)\n18.40\n10 - 25\n"
            "AVAILABLE ZINC (Zn)\n0.31\n0.50 - 1.00\n"
            "RECOMMENDATION"
        )
        by_key = {str(m["key"]): float(m["reading"]) for m in metrics}
        self.assertEqual(by_key["available_nitrogen"], 245.15)
        self.assertEqual(by_key["available_zinc"], 0.31)


class ImplausibleReadingTests(unittest.TestCase):
    """OCR loses decimal points. A soil with 247 ppm copper does not exist, and
    showing one to a farmer is worse than showing nothing."""

    def test_copper_with_a_lost_decimal_point_is_dropped(self) -> None:
        metrics = extract_soil_metrics(
            "SOIL SAMPLE DETAILS AVAILABLE COPPER (Cu) 247 1 - 2 RECOMMENDATION"
        )
        self.assertEqual(metrics, [])

    def test_an_impossible_ph_is_dropped(self) -> None:
        metrics = extract_soil_metrics(
            "SOIL SAMPLE DETAILS PH (pH) 81.2 7.5 - 8.9 RECOMMENDATION"
        )
        self.assertEqual(metrics, [])

    def test_a_plausible_reading_still_gets_through(self) -> None:
        metrics = extract_soil_metrics(
            "SOIL SAMPLE DETAILS AVAILABLE COPPER (Cu) 2.47 1 - 2 RECOMMENDATION"
        )
        self.assertEqual(len(metrics), 1)
        self.assertEqual(metrics[0]["status_code"], "high")


class RowBoundaryTests(unittest.TestCase):
    """The row reader must never take the next metric's value.

    This is the bug OCR exposed: when a label line's own value column is
    mangled, scanning forward walked straight into the following row and
    reported phosphorus's 18.40 as the nitrogen reading.
    """

    def test_a_label_with_no_value_does_not_borrow_the_next_rows(self) -> None:
        metrics = extract_soil_metrics(
            "SOIL SAMPLE DETAILS\n"
            "AVAILABLE NITROGEN (N)\n"           # value column unreadable
            "AVAILABLE PHOSPHORUS (P) 18.40 10 - 25\n"
            "RECOMMENDATION"
        )
        by_key = {str(m["key"]): float(m["reading"]) for m in metrics}
        self.assertNotIn("available_nitrogen", by_key)
        self.assertEqual(by_key["available_phosphorus"], 18.40)

    def test_values_on_the_label_line_itself_are_read(self) -> None:
        metrics = extract_soil_metrics(
            "SOIL SAMPLE DETAILS\n"
            "AVAILABLE NITROGEN (N) 245.15 280 - 560\n"
            "AVAILABLE PHOSPHORUS (P) 18.40 10 - 25\n"
            "RECOMMENDATION"
        )
        by_key = {str(m["key"]): float(m["reading"]) for m in metrics}
        self.assertEqual(by_key["available_nitrogen"], 245.15)
        self.assertEqual(by_key["available_phosphorus"], 18.40)


class DegenerateInputTests(unittest.TestCase):
    def test_empty_text_yields_nothing_rather_than_raising(self) -> None:
        self.assertEqual(extract_soil_metrics(""), [])
        self.assertEqual(len(missing_metric_keys([])), 12)

    def test_unrelated_document_yields_nothing(self) -> None:
        metrics = extract_soil_metrics("An invoice for 240 bags at 55.20 each, total 13248.")
        self.assertEqual(metrics, [])

    def test_summary_says_so_when_nothing_was_read(self) -> None:
        self.assertIn("No structured soil readings", summarize_soil_metrics([]))

    def test_a_row_with_no_usable_range_is_dropped_not_guessed(self) -> None:
        # min == max cannot be a range, so the row must go missing rather than
        # reach the farmer as a confident status.
        metrics = extract_soil_metrics(
            "SOIL SAMPLE DETAILS AVAILABLE ZINC (Zn) 0.31 1.00 - 1.00 RECOMMENDATION"
        )
        self.assertEqual(metrics, [])


if __name__ == "__main__":
    unittest.main()
