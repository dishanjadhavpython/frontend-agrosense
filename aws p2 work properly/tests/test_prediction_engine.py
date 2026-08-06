import unittest

from soil_services.prediction_engine import predict_from_metrics


class PredictionEngineTests(unittest.TestCase):
    def test_prediction_engine_returns_crop_health_and_plan(self):
        metrics = [
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

        result = predict_from_metrics(metrics)

        self.assertIn("recommended_crop", result)
        self.assertIn("soil_health", result)
        self.assertIn("fertilizer_plan", result)
        self.assertNotEqual(result["recommended_crop"]["name"], "Insufficient data")
        self.assertGreaterEqual(result["soil_health"]["score"], 35)
        self.assertTrue(result["fertilizer_plan"])


if __name__ == "__main__":
    unittest.main()
