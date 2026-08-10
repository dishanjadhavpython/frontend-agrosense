from __future__ import annotations

from .topics import Topic

"""
What to actually ask about, per category.

A crop, a soil and a fertilizer are three different questions, and one generic
prompt gets three generic answers — the kind of page that is technically about
laterite and would read identically if you swapped in "clay". These briefs are
what the Research agent is sent looking for.

Each ends with what *not* to bother with. That matters more than it looks: the
agent has a bounded number of turns, and turns spent on a scheme it will never
source officially are turns not spent on the sowing window.
"""

CROP_BRIEF = """
For this crop, find:

1. SEASON AND SOWING — which of Kharif/Rabi/Zaid it belongs to, the sowing
   window in Maharashtra or western India, spacing and seed rate if stated.
2. VARIETIES — varieties released by ICAR or a state agricultural university,
   especially recent ones. Name the releasing institute.
3. GOVERNMENT SUPPORT — MSP if this crop is notified for it, plus any central
   or Maharashtra scheme that applies (insurance, subsidy, procurement).
   *.gov.in source or leave it out.
4. WATER AND INPUTS — irrigation need, critical stages, whether it suits
   rainfed cultivation.
5. WHAT GOES WRONG — the two or three pests or diseases that actually cost
   yield here, and the recognised management for them.
6. MARKET — what mandi prices have done this season, qualitatively. Numbers
   come from the price tool, not from you.

Do not spend turns on: botanical taxonomy, global production statistics, or
history. A farmer wants to know when to sow it and what it will fetch.
""".strip()

SOIL_BRIEF = """
For this soil type, find:

1. WHERE IT IS — the Indian regions and, if possible, the Maharashtra
   districts where it occurs.
2. HOW IT BEHAVES — drainage, water holding, pH tendency, the nutrients it is
   characteristically short of or locks up.
3. THE FAILURE MODE — the specific thing that goes wrong on this soil.
   Laterite leaches and turns acidic; black soil cracks and drains badly;
   peat waterlogs and is acidic; sandy loses nutrients to leaching. Name it.
4. MANAGEMENT — amendments and practices that work in Indian conditions:
   liming, gypsum, organic matter, drainage, bunding, green manure. Rates if
   an official source gives them.
5. WHAT GROWS ON IT — crops that genuinely suit it and crops that struggle.
6. SCHEMES — soil health, reclamation or watershed schemes that apply.
   *.gov.in source or leave it out.

Do not spend turns on: soil taxonomy classification systems, or global soil
distribution. The farmer is standing on it and wants to know what to do.
""".strip()

FERTILIZER_BRIEF = """
For this fertilizer, find:

1. WHAT IT IS — the N-P-K grade and what each nutrient does for a crop.
2. PRICE AND SUBSIDY — the subsidised MRP and its status under Nutrient Based
   Subsidy. fert.nic.in or another *.gov.in source, with the notification
   date, or leave it out.
3. DOSE — recommended kg per hectare for the main crops it suits, and whether
   it is applied basal or as a top dressing, in splits or at once.
4. TIMING — the crop stage at which it is applied.
5. OVER-APPLICATION — what happens if a farmer applies it when the soil does
   not need it: the soil damage, the wasted money, the environmental cost.
   Cover this properly. This product tells farmers to hold a bag as often as
   to buy one, and this section is what justifies that advice.
6. ALTERNATIVES — organic or lower-cost substitutes that supply the same
   nutrient, where they exist.

Do not spend turns on: industrial manufacturing processes, or company brand
comparisons. Naming brands reads as advertising and is not what this is for.
""".strip()

BRIEFS = {
    "crop": CROP_BRIEF,
    "soil": SOIL_BRIEF,
    "fertilizer": FERTILIZER_BRIEF,
}

KIND = {
    "crop": "crop",
    "soil": "soil type",
    "fertilizer": "fertilizer / nutrient blend",
}


def brief_for(topic: Topic) -> str:
    return BRIEFS.get(topic.category, CROP_BRIEF)


def kind_of(topic: Topic) -> str:
    return KIND.get(topic.category, topic.category)
