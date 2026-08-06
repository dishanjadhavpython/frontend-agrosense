import unittest

from soil_services.soil_report import extract_soil_metrics, summarize_soil_metrics


class SoilReportTests(unittest.TestCase):
    def test_extract_soil_metrics_from_sample_text(self):
        sample = """
        SOIL SAMPLE DETAILS
        AVAILABLE NITROGEN (N) 540.10 280 560
        AVAILABLE PHOSPHORUS (P) 30.50 10 25
        ORGANIC CARBON (OC) 0.55 0.20 0.60
        AVAILABLE ZINC (Zn) 1.20 0.50 1.00
        RECOMMENDATION
        """

        metrics = extract_soil_metrics(sample)
        summary = summarize_soil_metrics(metrics)

        self.assertEqual(len(metrics), 4)
        self.assertEqual(metrics[1]["status_code"], "high")
        self.assertIn("Out-of-range values", summary)


if __name__ == "__main__":
    unittest.main()
