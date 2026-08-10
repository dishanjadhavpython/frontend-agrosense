from __future__ import annotations

"""How the soil type reaches the crop recommendation.

**This is a table, not a model, and that is the point.**

The previous pipeline fed the soil classifier's output into the crop model as
four one-hot columns. Those columns were created in the training notebook by
`np.random.randint(0, 4)` — random integers, carrying no relationship to the
crop label. The model could not have learned anything from them, so the soil
photograph never affected the recommendation. It only looked as though it did.

There is no dataset available here that links these eight soil classes to crop
outcomes. The one candidate — `Crop Recommendation using Soil Properties and
Weather Prediction.csv` — has a free-text `Soilcolor` column ("Reddish broown",
"Redishbrown", "replacement of inaccessible target red;luvisols") describing
colour rather than soil class, and it does not map onto the eight.

So rather than fabricate a learned relationship, the soil type re-ranks the
crop model's output through the table below. The weights are deliberately mild:
this nudges an ordering that the nutrient model produced from real
measurements, it does not overrule it. A crop the soil disfavours can still be
recommended if the nutrients strongly support it — it simply has to earn it.

The advantage over four columns of noise is not accuracy. It is that every line
here can be read, questioned and corrected by someone who knows more about
soil than the person who wrote it.

────────────────────────────────────────────────────────────────────────────
NEEDS AGRONOMIST REVIEW. Compiled from general Indian soil-suitability
guidance (ICAR crop-soil suitability, state agriculture department crop
calendars). It is a reasonable first pass by a non-agronomist and should be
checked before anyone farms against it — the same standing flag the Marathi
copy carries in PLAN.md §10.
────────────────────────────────────────────────────────────────────────────
"""

#: Multipliers on the crop model's probability. Chosen so that suitability
#: reorders near-ties and pushes a badly-matched crop down the list, without
#: letting the table beat a strong nutrient signal outright.
FAVOURED = 1.18
DISCOURAGED = 0.72

#: soil key -> (crops the soil suits, crops it works against, why)
#:
#: Keys match `soil_classes.json` from the classifier and `SOILS` in
#: `src/data/soils.ts`. Crop names match the crop model's label encoder.
SUITABILITY: dict[str, dict[str, object]] = {
    "alluvial": {
        "favoured": {
            "rice", "jute", "maize", "banana", "papaya",
            "lentil", "chickpea", "mungbean", "blackgram", "kidneybeans",
        },
        "discouraged": set(),
        "why": (
            "Deep, fertile and well drained with good moisture holding — the "
            "Indo-Gangetic staple soil. Suits nearly everything, so it "
            "discourages nothing."
        ),
    },
    "black": {
        "favoured": {"cotton", "pigeonpeas", "chickpea", "grapes", "pomegranate", "orange"},
        "discouraged": {"coconut", "papaya", "watermelon", "muskmelon"},
        "why": (
            "Vertisol — high clay, swells and holds moisture, the classic "
            "cotton soil. Poor drainage counts against crops that rot in wet "
            "feet or need a light, quick-draining bed."
        ),
    },
    "red": {
        "favoured": {"mango", "blackgram", "mothbeans", "mungbean", "pigeonpeas", "pomegranate"},
        "discouraged": {"rice", "jute"},
        "why": (
            "Well drained, low in nitrogen and phosphorus, mildly acidic. Good "
            "for pulses and hardy orchards; poor for crops that need standing "
            "water or sustained moisture."
        ),
    },
    "laterite": {
        "favoured": {"coconut", "mango", "coffee", "rice"},
        "discouraged": {"chickpea", "lentil", "grapes"},
        "why": (
            "Heavily leached, acidic, high in iron and aluminium — the Konkan "
            "and Malabar soil. Plantation crops do well; crops wanting a "
            "neutral pH and high base status do not."
        ),
    },
    "clay": {
        "favoured": {"rice", "jute"},
        "discouraged": {"watermelon", "muskmelon", "mothbeans", "coconut"},
        "why": (
            "Heavy and slow draining, holds water well. Ideal for puddled "
            "rice; hostile to anything needing a light, aerated root zone."
        ),
    },
    "peat": {
        "favoured": {"rice"},
        "discouraged": {
            "grapes", "pomegranate", "apple", "orange", "cotton", "chickpea", "lentil",
        },
        "why": (
            "Organic, acidic and waterlogged — Kerala's kari lands. Very few "
            "field crops tolerate it; deep-rooted orchards and pulses will not."
        ),
    },
    "yellow": {
        "favoured": {"mothbeans", "mungbean", "blackgram", "maize"},
        "discouraged": {"rice", "jute", "banana"},
        "why": (
            "Weathered and low in fertility, close to red soil in behaviour. "
            "Suits undemanding pulses and millets rather than heavy feeders."
        ),
    },
    "cinder": {
        "favoured": {"watermelon", "muskmelon", "mothbeans"},
        "discouraged": {"rice", "jute", "banana", "coconut"},
        "why": (
            "Volcanic scoria — extremely free draining and low in nutrients "
            "and water-holding capacity. Only drought-tolerant crops make "
            "sense; anything wanting standing water is a non-starter."
        ),
    },
}


def adjust(
    ranked: list[dict[str, object]], soil_key: str | None
) -> list[dict[str, object]]:
    """Re-rank crop predictions for the identified soil.

    `ranked` is the crop model's output, each item carrying at least `name` and
    `score`. Returns a new list, re-sorted, with `soil_fit` and `soil_note` set
    so the UI can say *why* an ordering changed rather than silently changing it.

    An unknown or missing soil returns the list untouched. That case is normal —
    a farmer who sends only a Soil Health Card and no soil photograph still gets
    a recommendation, from nutrients alone.
    """
    entry = SUITABILITY.get((soil_key or "").lower())
    if entry is None:
        return [{**item, "soil_fit": "unknown", "soil_note": ""} for item in ranked]

    favoured: set[str] = entry["favoured"]  # type: ignore[assignment]
    discouraged: set[str] = entry["discouraged"]  # type: ignore[assignment]

    adjusted = []
    for item in ranked:
        name = str(item.get("name", "")).lower()
        if name in favoured:
            fit, weight = "favoured", FAVOURED
        elif name in discouraged:
            fit, weight = "discouraged", DISCOURAGED
        else:
            fit, weight = "neutral", 1.0

        adjusted.append(
            {
                **item,
                "score": float(item.get("score", 0.0)) * weight,
                "model_score": float(item.get("score", 0.0)),
                "soil_fit": fit,
                "soil_note": entry["why"] if fit != "neutral" else "",
            }
        )

    adjusted.sort(key=lambda item: item["score"], reverse=True)
    return adjusted


def describe(soil_key: str | None) -> str:
    entry = SUITABILITY.get((soil_key or "").lower())
    return str(entry["why"]) if entry else ""
