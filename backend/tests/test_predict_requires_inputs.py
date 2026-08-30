from __future__ import annotations

import unittest

from backend.models import (
    CROP_FEATURES,
    CROP_TO_FERTILIZER_CROP,
    MissingInput,
    SOIL_TO_FERTILIZER_SOIL,
    _RANGE_SOURCES,
    _require,
    _fertilizer_crop_code,
    _fertilizer_soil_code,
    predict_crops,
    predict_fertilizers,
    training_range_warnings,
)
from backend.soil_report import status_for

"""
The guard on the change that removed every invented input.

Nine values used to be supplied by the server when the caller did not send
them — 26°C, 68% humidity, 110mm rainfall, 34% moisture, N/P/K as 0, pH as 6.5,
soil type as "loamy", crop type as "paddy". The four weather ones were not
merely available as fallbacks: the frontend never sent any of them, so those
numbers are what every prediction the product ever made was computed from.

These tests exist so that cannot come back quietly. They deliberately do not
load the models — a missing input has to be refused before anything expensive
happens, and asserting that here means the suite still runs on a clone with no
artifacts in `ML/models/`.
"""

COMPLETE = {
    "N": 245.15,
    "P": 16.4,
    "K": 284.0,
    "ph": 7.1,
    "temperature": 28.0,
    "humidity": 72.0,
    "rainfall": 140.0,
    "moisture": 38.0,
}


class NoInputIsInvented(unittest.TestCase):
    def test_every_crop_feature_is_required(self) -> None:
        for field in CROP_FEATURES:
            incomplete = {k: v for k, v in COMPLETE.items() if k != field}
            with self.subTest(field=field):
                with self.assertRaises(MissingInput) as caught:
                    predict_crops(incomplete, "black")
                # Named, so the caller can say which box to fill rather than
                # "something went wrong".
                self.assertEqual(caught.exception.field, field)

    def test_every_fertilizer_input_is_required(self) -> None:
        # N/P/K are absent: the fertilizer model no longer takes them. They
        # still reach the answer, through the statuses `_need_score` reads.
        for field in ("temperature", "humidity", "moisture"):
            incomplete = {k: v for k, v in COMPLETE.items() if k != field}
            with self.subTest(field=field):
                with self.assertRaises(MissingInput) as caught:
                    predict_fertilizers(incomplete, "black", "cotton")
                self.assertEqual(caught.exception.field, field)

    def test_a_zero_is_not_the_same_as_a_blank(self) -> None:
        """`readings.get(name, 0.0)` turned a rainfall nobody typed into a field
        with no rain on it. A real zero must still be accepted."""
        with self.assertRaises(MissingInput):
            predict_crops({k: v for k, v in COMPLETE.items() if k != "rainfall"}, "black")
        # And 0.0 itself is a reading, not an absence — a dry season is a fact.
        self.assertEqual(_require({**COMPLETE, "rainfall": 0.0}, "rainfall"), 0.0)


class SoilAndCropAreNeverGuessed(unittest.TestCase):
    def test_unknown_soil_raises_instead_of_defaulting_to_loamy(self) -> None:
        for value in ("", "  ", "not-a-soil"):
            with self.subTest(value=value):
                with self.assertRaises(MissingInput):
                    _fertilizer_soil_code(value)

    def test_unknown_crop_raises_instead_of_defaulting_to_paddy(self) -> None:
        for value in ("", "not-a-crop"):
            with self.subTest(value=value):
                with self.assertRaises(MissingInput):
                    _fertilizer_crop_code(value)

    def test_every_classifier_soil_maps(self) -> None:
        """The fallbacks are gone, so a gap in these maps is now a 422 rather
        than a silent wrong answer. Both maps must stay complete."""
        for soil_key in ("alluvial", "black", "cinder", "clay", "laterite", "peat", "red", "yellow"):
            with self.subTest(soil=soil_key):
                self.assertIn(soil_key, SOIL_TO_FERTILIZER_SOIL)
                _fertilizer_soil_code(soil_key)

    def test_every_crop_the_model_can_return_maps(self) -> None:
        crops = [
            "apple", "banana", "blackgram", "chickpea", "coconut", "coffee",
            "cotton", "grapes", "jute", "kidneybeans", "lentil", "maize",
            "mango", "mothbeans", "mungbean", "muskmelon", "orange", "papaya",
            "pigeonpeas", "pomegranate", "rice", "watermelon",
        ]
        for crop in crops:
            with self.subTest(crop=crop):
                self.assertIn(crop, CROP_TO_FERTILIZER_CROP)
                _fertilizer_crop_code(crop)


class StatusIsRecomputedFromWhatWasSubmitted(unittest.TestCase):
    """A correction has to reach the fertilizer ranking.

    `N_status` drives `_need_score`, which is what actually chooses the bag.
    If the status stayed as the card was first read, a farmer correcting an OCR
    misread would watch the number change and the advice stay the same.
    """

    #: The fixture card's nitrogen row: 245.15 against a printed 280–560.
    RANGE = (280.0, 560.0)

    def test_the_cards_own_reading_is_below_its_printed_range(self) -> None:
        self.assertEqual(status_for(245.15, *self.RANGE)[1], "low")

    def test_the_ocr_misread_flips_the_verdict(self) -> None:
        """Tesseract turns 245.15 into 945.15 on a clean render of this card.
        Plausible, in absolute terms, and the opposite advice."""
        self.assertEqual(status_for(945.15, *self.RANGE)[1], "high")

    def test_a_corrected_reading_recomputes(self) -> None:
        self.assertEqual(status_for(400.0, *self.RANGE)[1], "normal")


class NoModelIsFedAnIncomparableQuantity(unittest.TestCase):
    """The mismatch was removed, not annotated.

    `Crop_recommendation.csv`'s N/P/K are the crop's recommended fertilizer
    dose, not a soil test: every one of its 2,200 rows falls in the Soil Health
    Card's "low" N band (<280 kg/ha), within-crop K has a standard deviation of
    ~3 across a 5–205 column, and the per-crop means are the published ICAR
    doses. The fertilizer table's NPK runs 4–42 / 0–19 / 0–42 against a card's
    hundreds. Neither gap was a unit conversion waiting to be found, so both
    models were retrained without those columns.
    """

    def test_the_crop_model_takes_no_nutrients(self) -> None:
        for nutrient in ("N", "P", "K"):
            self.assertNotIn(nutrient, CROP_FEATURES)

    def test_a_card_scale_reading_is_no_longer_flagged_anywhere(self) -> None:
        """A card reading N=245 and K=284 used to produce two warnings. It
        reaches no model now, so it produces none."""
        flagged = {w["field"] for w in training_range_warnings(COMPLETE)}
        self.assertEqual(flagged & {"N", "P", "K"}, set())

    def test_every_checked_pair_is_the_same_quantity(self) -> None:
        """Nothing may be range-checked unless the farmer's unit and the
        training column's unit are the same thing — otherwise the check is
        comparing apples to a fertilizer bag."""
        for field, (_model, _file, column) in _RANGE_SOURCES.items():
            with self.subTest(field=field):
                self.assertEqual(field.lower(), column.lower().replace("temparature", "temperature"))

    def test_an_unusual_but_coherent_field_is_still_flagged(self) -> None:
        """What the check is for now: 400 mm against a table stopping at 298."""
        warnings = training_range_warnings({**COMPLETE, "rainfall": 400.0})
        if not warnings:
            self.skipTest("feature_ranges not written; run ML/feature_ranges.py")
        rain = next(w for w in warnings if w["field"] == "rainfall")
        self.assertEqual(rain["value"], 400.0)
        self.assertEqual(rain["model"], "crop")

    def test_an_in_range_field_is_not_flagged(self) -> None:
        self.assertEqual(training_range_warnings(COMPLETE), [])


if __name__ == "__main__":
    unittest.main()
