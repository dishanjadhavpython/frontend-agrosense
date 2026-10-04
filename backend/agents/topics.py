from __future__ import annotations

import re
from dataclasses import dataclass

from ..config import soil_classes

# The finite set of subjects the agent pipeline keeps reports for. This
# mirrors what the app already predicts/displays elsewhere (crop labels
# from Crop_recommendation.csv, the four soil classes the CNN predicts, and
# the fertilizer blends previously described in the old static
# fertilizer-info.html) rather than an open-ended "any crop" scope, which
# keeps the topic list bounded, predictable, and cheap to keep fresh.
#
# KEEP IN LOCKSTEP WITH `src/data/crops.ts` and `src/data/fertilizers.ts`.
# `src/data/topics.ts` derives its key lists from those two files and feeds
# `generateStaticParams`, and all three `/prediction/*` routes set
# `dynamicParams = false`. So a name here that is missing there is a report
# nobody can read, and a name there that is missing here is a page with
# nothing on it. `npm run check:ontology` catches the engine half of this;
# this file is the research half and is not machine-checked.

CROPS = [
    "apple",
    "banana",
    "blackgram",
    "chickpea",
    "coconut",
    "coffee",
    "cotton",
    "grapes",
    "jute",
    "kidneybeans",
    "lentil",
    "maize",
    "mango",
    "mothbeans",
    "mungbean",
    "muskmelon",
    "orange",
    "papaya",
    "pigeonpeas",
    "pomegranate",
    "rice",
    "watermelon",
    # ---- Added with the recommendation engine -----------------------------
    # The twelve Maharashtra staples the engine ranks. They must appear here
    # as well as in `src/data/crops.ts`: the crop list drives
    # `generateStaticParams`, so without a matching topic the detail page is
    # built and then has no report behind it -- the same silent gap the SOILS
    # comment below records, arriving from the other direction.
    "sorghum",
    "pearlmillet",
    "wheat",
    "fingermillet",
    "soybean",
    "groundnut",
    "safflower",
    "sunflower",
    "sesame",
    "linseed",
    "mustard",
    "sugarcane",
]

# Read from the trained classifier's metadata rather than a constant. This
# said four while the model had been retrained to eight, which would have left
# laterite, cinder, peat and yellow with no research topic and therefore blank
# detail pages -- a silent gap, because a missing topic raises nothing.
SOILS = soil_classes()

FERTILIZERS = [
    "urea",
    "dap",
    "20-20",
    "10-26-26",
    "14-35-14",
    "17-17-17",
    "28-28",
    # The two straight fertilisers the recommendation engine doses that this
    # list never carried, because the old model could not name them.
    "mop",
    "ssp",
]

CATEGORIES = ("crop", "soil", "fertilizer")


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "unknown"


@dataclass(frozen=True)
class Topic:
    category: str
    name: str

    @property
    def slug(self) -> str:
        return slugify(self.name)

    @property
    def label(self) -> str:
        return self.name.title() if self.category != "fertilizer" else self.name.upper()


def all_topics() -> list[Topic]:
    topics: list[Topic] = []
    topics.extend(Topic("crop", name) for name in CROPS)
    topics.extend(Topic("soil", name) for name in SOILS)
    topics.extend(Topic("fertilizer", name) for name in FERTILIZERS)
    return topics


def find_topic(category: str, slug: str) -> Topic | None:
    category = category.strip().lower()
    slug = slugify(slug)
    for topic in all_topics():
        if topic.category == category and topic.slug == slug:
            return topic
    return None
