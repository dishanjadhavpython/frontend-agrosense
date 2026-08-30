from __future__ import annotations

import unittest
from pathlib import Path

from backend.pdf_processor import extract_text
from backend.prediction_engine import predict_from_metrics
from backend.soil_report import extract_soil_metrics

FIXTURE = Path(__file__).parent / "fixtures" / "soil_health_card_marathi.pdf"


class PredictionEngineTests(unittest.TestCase):
    """The card, read against its own printed ranges. Needs no model artifacts,
    so it works on a fresh clone.

    This layer used to name a crop too, scored against six hand-written nutrient
    windows in `CROP_PROFILES`. That was a second crop recommender standing
    behind the real one with no dataset and no provenance, so it was removed —
    crops come from the crop model, ranked from readings the farmer confirmed.
    The tests that asserted on `recommended_crop` went with it."""

    METRICS = [
        {
            "key": "available_nitrogen",
            "label": "Available Nitrogen (N)",
            "reading": 510.0,
            "reading_display": "510.0",
            "status_code": "normal",
        },
        {
            "key": "available_phosphorus",
            "label": "Available Phosphorus (P)",
            "reading": 32.0,
            "reading_display": "32.0",
            "status_code": "high",
        },
        {
            "key": "ph",
            "label": "pH",
            "reading": 6.5,
            "reading_display": "6.5",
            "status_code": "normal",
        },
        {
            "key": "organic_carbon",
            "label": "Organic Carbon (OC)",
            "reading": 0.58,
            "reading_display": "0.58",
            "status_code": "normal",
        },
    ]

    def test_returns_health_and_plan(self) -> None:
        result = predict_from_metrics(self.METRICS)

        self.assertIn("soil_health", result)
        self.assertIn("fertilizer_plan", result)
        self.assertGreaterEqual(result["soil_health"]["score"], 35)
        self.assertTrue(result["fertilizer_plan"])

    def test_names_no_crop(self) -> None:
        """The guard on the removal. Ingest reports what the card says; it does
        not decide what to plant, and must not start doing so again."""
        result = predict_from_metrics(self.METRICS)
        self.assertNotIn("recommended_crop", result)
        self.assertNotIn("alternative_crops", result)

    def test_high_phosphorus_produces_a_restraint_not_a_purchase(self) -> None:
        # A recommender that only ever says "apply" is a sales channel. The
        # engine must be able to tell someone to hold off.
        plan = predict_from_metrics(self.METRICS)["fertilizer_plan"]
        phosphorus = [item for item in plan if item["metric"] == "Available Phosphorus (P)"]
        self.assertTrue(phosphorus)
        self.assertEqual(phosphorus[0]["status"], "high")
        self.assertIn("restraint", str(phosphorus[0]["title"]).lower())

    def test_no_metrics_reports_insufficient_data_rather_than_a_guess(self) -> None:
        result = predict_from_metrics([])
        self.assertEqual(result["soil_health"]["score"], 0)
        self.assertEqual(result["soil_health"]["label"], "Insufficient data")
        self.assertEqual(result["input_coverage"]["metrics_found"], 0)


class RealCardPredictionTests(unittest.TestCase):
    """End to end on the fixture: PDF bytes in, advice out."""

    @classmethod
    def setUpClass(cls) -> None:
        text, _pages, _ocr = extract_text(FIXTURE)
        cls.metrics = extract_soil_metrics(text)
        cls.result = predict_from_metrics(cls.metrics)

    def test_scores_all_twelve_readings(self) -> None:
        self.assertEqual(self.result["input_coverage"]["metrics_found"], 12)
        # N low, K high, EC high, OC low, Zn low, Mn high, Cu high.
        self.assertEqual(self.result["input_coverage"]["metrics_flagged"], 7)

    def test_soil_health_reflects_a_card_with_seven_flagged_readings(self) -> None:
        health = self.result["soil_health"]
        self.assertLess(health["score"], 70)
        self.assertIn(health["label"], {"Needs monitoring", "Corrective action needed"})

    def test_plan_addresses_the_deficiencies_the_card_actually_shows(self) -> None:
        addressed = {str(item["metric"]) for item in self.result["fertilizer_plan"]}
        # Nitrogen, organic carbon and zinc are all below range on this card.
        self.assertTrue(
            addressed & {"Available Nitrogen (N)", "Organic Carbon (OC)", "Available Zinc (Zn)"},
            f"plan ignored every deficiency on the card: {addressed}",
        )


if __name__ == "__main__":
    unittest.main()
