from __future__ import annotations

import re

"""
The twelve numbers off a Soil Health Card.

Two extractors live here, and which one wins is decided per document rather
than in advance. That is not indecision — it is the finding that produced this
file. Measured against the real bilingual Maharashtra card in
`tests/fixtures/`:

    flat extractor      12 / 12
    row-based extractor  2 / 12

The row-based one fails because a real card interleaves a Marathi label between
the English label and the value:

    AVAILABLE BORON (B)      <- the metric
    उपलब्ध बोरॉन (B)          <- taken as the reading line; no digits; row dropped
    0.68                     <- the actual reading, never reached
    0.40 - 1.00

`ph` and `ec` only survived by accident: stripping non-alphanumerics collapses
`सामू (pH)` to `PH`, which re-matched the metric one line lower and happened to
line the slots back up.

So the flat extractor leads. The row-based one is kept, with that bug fixed,
because it is the stronger reader of the other common layout — an English-only
card with one value per row and no printed range column to anchor on. Running
both and keeping the better result costs microseconds and covers both.

The range comes from the card itself, never from a table in here. A farmer's
own document is the authority on what its lab considered normal, and software
that contradicts the paper in someone's hand has lost the argument before it
starts. Presentation facts the card does not carry — axis, units, decimal
places — live in the frontend's `src/data/soilReading.ts`.
"""

# Order matters only as a tie-break for output; matching is position-based, so
# a card that prints these in a different order still reads correctly.
SOIL_METRICS: list[dict[str, object]] = [
    {
        "key": "available_boron",
        "label": "Available Boron (B)",
        "pattern": r"AVAILABLE\s+BORON\s*\(\s*B\s*\)",
        "aliases": ["AVAILABLE BORON B", "AVAILABLE BORON"],
    },
    {
        "key": "available_nitrogen",
        "label": "Available Nitrogen (N)",
        "pattern": r"AVAILABLE\s+NITROGEN\s*\(\s*N\s*\)",
        "aliases": ["AVAILABLE NITROGEN N", "AVAILABLE NITROGEN"],
    },
    {
        "key": "available_phosphorus",
        "label": "Available Phosphorus (P)",
        # "PHOSPHOROUS" is a near-universal misspelling on these cards.
        "pattern": r"AVAILABLE\s+PHOSPHOR(?:O)?US\s*\(\s*P\s*\)",
        "aliases": ["AVAILABLE PHOSPHORUS P", "AVAILABLE PHOSPHORUS"],
    },
    {
        "key": "available_potassium",
        "label": "Available Potassium (K)",
        "pattern": r"AVAILABLE\s+POTASSIUM\s*\(\s*K\s*\)",
        "aliases": ["AVAILABLE POTASSIUM K", "AVAILABLE POTASSIUM"],
    },
    {
        "key": "ph",
        "label": "pH",
        "pattern": r"\bPH\s*\(\s*pH\s*\)",
        "aliases": ["PH", "PH PH"],
    },
    {
        "key": "ec",
        "label": "EC",
        "pattern": r"\bEC\s*\(\s*EC\s*\)",
        "aliases": ["EC", "EC EC"],
    },
    {
        "key": "organic_carbon",
        "label": "Organic Carbon (OC)",
        "pattern": r"ORGANIC\s+CARBON\s*\(\s*OC\s*\)",
        "aliases": ["ORGANIC CARBON OC", "ORGANIC CARBON"],
    },
    {
        "key": "available_sulphur",
        "label": "Available Sulphur (S)",
        "pattern": r"AVAILABLE\s+SUL(?:PH|F)UR\s*\(\s*S\s*\)",
        "aliases": ["AVAILABLE SULPHUR S", "AVAILABLE SULPHUR"],
    },
    {
        "key": "available_zinc",
        "label": "Available Zinc (Zn)",
        "pattern": r"AVAILABLE\s+ZINC\s*\(\s*Zn\s*\)",
        "aliases": ["AVAILABLE ZINC ZN", "AVAILABLE ZINC"],
    },
    {
        "key": "available_iron",
        "label": "Available Iron (Fe)",
        "pattern": r"AVAILABLE\s+IRON\s*\(\s*Fe\s*\)",
        "aliases": ["AVAILABLE IRON FE", "AVAILABLE IRON"],
    },
    {
        "key": "available_manganese",
        "label": "Available Manganese (Mn)",
        "pattern": r"AVAILABLE\s+MANGANESE\s*\(\s*Mn\s*\)",
        "aliases": ["AVAILABLE MANGANESE MN", "AVAILABLE MANGANESE"],
    },
    {
        "key": "available_copper",
        "label": "Available Copper (Cu)",
        "pattern": r"AVAILABLE\s+COPPER\s*\(\s*Cu\s*\)",
        "aliases": ["AVAILABLE COPPER CU", "AVAILABLE COPPER"],
    },
]

METRIC_KEYS = [str(metric["key"]) for metric in SOIL_METRICS]

# One row needs exactly three numbers: the reading, the range floor and the
# ceiling. A little slack absorbs a printed unit or a serial column; beyond it,
# the segment has almost certainly run past an unrecognised label.
SEGMENT_NUMBER_LIMIT = 6

NUMBER_PATTERN = re.compile(r"[0-9]+(?:\.[0-9]+)?")
RANGE_PATTERN = re.compile(
    r"([0-9]+(?:\.[0-9]+)?)\s*(?:-|TO)\s*([0-9]+(?:\.[0-9]+)?)", flags=re.IGNORECASE
)

# Where the readings table starts and where the advice below it begins. The end
# markers matter more than the start ones: the recommendation block is full of
# numbers ("युरिया – ६५ किलो"), and without a boundary the last metric's segment
# would swallow them and mis-read copper.
SECTION_START_MARKERS = (
    "SOIL SAMPLE DETAILS",
    "SOIL HEALTH CARD",
    "SAMPLE READING",
    "PARAMETER",
)
SECTION_END_MARKERS = (
    "RECOMMENDATION",
    "शिफारस",
    "!शफारस",
    "FOLIAR",
    "खतसंयोजन",
    "खत संयोजन",
    "सूचना :",
    "सूचना:",
)


def _dashes(text: str) -> str:
    """Cards use en/em dashes and the Unicode minus interchangeably in ranges."""
    return text.replace("–", "-").replace("—", "-").replace("−", "-")


def _flatten(text: str) -> str:
    return " ".join(_dashes(text).split())


def _soil_section(text: str) -> str:
    """Narrow to the readings table. Falls back to the whole document rather
    than to nothing, because a card that uses none of these headings is still
    worth attempting."""
    normalized = _dashes(text)
    upper = normalized.upper()

    starts = [upper.find(marker) for marker in SECTION_START_MARKERS]
    starts = [index for index in starts if index != -1]
    if starts:
        normalized = normalized[min(starts) :]
        upper = normalized.upper()

    # Searched from a little way in: "सूचना :" also heads the disclaimer that
    # opens some cards, and matching that at position 0 would empty the section.
    ends = [upper.find(marker, 1) for marker in SECTION_END_MARKERS]
    ends = [index for index in ends if index != -1]
    if ends:
        normalized = normalized[: min(ends)]

    return normalized


# What each property can physically be, in the units Indian Soil Health Cards
# print. Not agronomic guidance — these are far wider than any desirable range;
# they exist only to catch a misread.
#
# OCR is why. On a clean 200-dpi render of the test card, Tesseract reports
# copper as "247" (the card says 2.47 — the decimal point is lost) and at other
# resolutions as "34" or "347". A soil with 247 ppm copper does not exist, and
# a farmer must never be shown one. A dropped row is recoverable; an invented
# reading is what someone buys fertilizer against.
PLAUSIBLE_RANGE: dict[str, tuple[float, float]] = {
    "ph": (2.0, 12.0),
    "ec": (0.0, 20.0),                    # dS/m
    "organic_carbon": (0.0, 10.0),        # %
    "available_nitrogen": (0.0, 2000.0),  # kg/ha
    "available_phosphorus": (0.0, 500.0),
    "available_potassium": (0.0, 2000.0),
    "available_sulphur": (0.0, 500.0),    # ppm
    "available_zinc": (0.0, 100.0),
    "available_iron": (0.0, 500.0),
    "available_manganese": (0.0, 500.0),
    "available_copper": (0.0, 100.0),
    "available_boron": (0.0, 50.0),
}


#: How far outside its own printed range a reading may sit before it is more
#: likely a lost decimal point than a soil.
#:
#: OCR reads copper `2.47` as `34` or `47` depending on resolution — inside the
#: absolute bounds above, so those alone do not catch it, but 17x the ceiling
#: the card itself printed. Real soils do go outside their range: the fixture's
#: potassium is 1.26x its ceiling and its zinc 1.6x below its floor. Twelve is
#: far beyond anything agronomic and comfortably clear of both.
MAX_RANGE_MULTIPLE = 12.0


def _is_plausible(key: str, reading: float, minimum: float, maximum: float) -> bool:
    low, high = PLAUSIBLE_RANGE.get(key, (0.0, float("inf")))
    # The printed range has to make sense too — if OCR mangled the range column,
    # the status derived from it would be meaningless even with a good reading.
    if not (low <= reading <= high and low <= minimum and maximum <= high):
        return False

    # The card states what scale this property is on. Use it: a reading orders
    # of magnitude outside the range printed beside it is a misread, not a
    # finding. Checked before the value can enter the cross-pass vote, so a
    # misread cannot out-vote a correct reading from another pass.
    if maximum > 0 and reading > maximum * MAX_RANGE_MULTIPLE:
        return False
    if minimum > 0 and reading * MAX_RANGE_MULTIPLE < minimum:
        return False

    return True


def _status(reading: float, minimum: float, maximum: float) -> tuple[str, str]:
    if reading < minimum:
        return "Below range", "low"
    if reading > maximum:
        return "Above range", "high"
    return "Within range", "normal"


def _format_number(value: float) -> str:
    if float(value).is_integer():
        return str(int(value))
    return f"{value:.2f}".rstrip("0").rstrip(".")


def _build_metric(
    key: str,
    label: str,
    reading_display: str,
    minimum_display: str,
    maximum_display: str,
) -> dict[str, object] | None:
    """One row, or None if these numbers cannot be a reading and a range at all.

    A row that parses but fails the plausibility checks is still returned,
    marked `plausible: False`. It is never shown — `extract_soil_metrics`
    filters it out — but it is not discarded either, because its *range* is
    still evidence. When six OCR passes read copper as "247 1-2" and two read
    it as "34 1-5", the rejected majority is what proves the range is 1-2 and
    therefore that the 34 is garbage. Throwing those rows away at birth loses
    the only signal that catches it.
    """
    reading = float(reading_display)
    minimum = float(minimum_display)
    maximum = float(maximum_display)

    if minimum > maximum:
        minimum, maximum = maximum, minimum
        minimum_display, maximum_display = maximum_display, minimum_display
    if minimum == maximum:
        return None

    status, status_code = _status(reading, minimum, maximum)
    return {
        "key": key,
        "label": label,
        "reading": reading,
        "reading_display": reading_display,
        "range_min": minimum,
        "range_max": maximum,
        "range_display": f"{_format_number(minimum)} - {_format_number(maximum)}",
        "status": status,
        "status_code": status_code,
        "plausible": _is_plausible(key, reading, minimum, maximum),
    }


def _flat_metrics(section: str) -> list[dict[str, object]]:
    """The primary reader.

    Collapses the section to a single line, finds where each metric's label
    sits, and reads the numbers between one label and the next. The trailing
    three numbers in a segment are the reading, the range floor and the range
    ceiling — taking them from the *end* is what makes the bilingual layout a
    non-issue, since a Marathi label contributes no digits and anything it did
    contribute would fall before the values, not after.

    Labels are located independently and then sorted by position, so a card
    that prints the twelve in a different order than `SOIL_METRICS` still
    reads. (The original searched forward from the previous match, which
    silently dropped every metric printed out of order.)
    """
    flattened = _flatten(section)

    located: list[tuple[int, int, str, str]] = []
    for metric in SOIL_METRICS:
        match = re.search(str(metric["pattern"]), flattened, flags=re.IGNORECASE)
        if match is None:
            continue
        located.append((match.start(), match.end(), str(metric["key"]), str(metric["label"])))

    located.sort()

    metrics: list[dict[str, object]] = []
    for index, (_, label_end, key, label) in enumerate(located):
        segment_end = located[index + 1][0] if index + 1 < len(located) else len(flattened)
        numbers = NUMBER_PATTERN.findall(flattened[label_end:segment_end])
        if len(numbers) < 3:
            continue

        # A segment carrying far more numbers than one row needs means the
        # *next* label was not recognised and this segment has swallowed its
        # values. Taking the trailing three would then report the neighbour's
        # reading under this metric's name — a confidently wrong number, which
        # is worse than no number. Refuse it and let `missing[]` say so.
        if len(numbers) >= SEGMENT_NUMBER_LIMIT:
            continue

        metric = _build_metric(key, label, *numbers[-3:])
        if metric is not None:
            metrics.append(metric)

    return metrics


def _normalize_line(line: str) -> str:
    return re.sub(r"[^A-Z0-9]+", " ", line.upper()).strip()


def _match_metric_line(line: str) -> dict[str, object] | None:
    normalized = _normalize_line(line)
    if not normalized:
        return None
    for metric in SOIL_METRICS:
        for alias in metric["aliases"]:  # type: ignore[index]
            if normalized == alias or normalized.startswith(f"{alias} "):
                return metric
    return None


def _row_metrics(section: str) -> list[dict[str, object]]:
    """The fallback reader, for one-value-per-row layouts.

    Fixed relative to the version this replaces: instead of assuming the very
    next non-empty line holds the reading, it skips forward over lines that
    carry no digits at all. That is precisely the Marathi label that used to
    consume the reading slot and drop ten of the twelve rows.
    """
    lines = [line.strip() for line in _dashes(section).splitlines() if line.strip()]
    metrics: list[dict[str, object]] = []
    seen: set[str] = set()

    def scan(start: int, stop: int) -> tuple[str | None, int]:
        """The next line carrying a digit, within this metric's own rows.

        `stop` is where the *next* metric's label begins, and respecting it is
        what stops one row from reading another's values. Without it a label
        line with no numbers of its own — which is what OCR produces when it
        mangles the value column — would take the following metric's reading
        and report it under this metric's name.
        """
        for offset in range(start, stop):
            if NUMBER_PATTERN.search(lines[offset]):
                return lines[offset], offset
        return None, start

    # Where every label sits, so each row knows its own boundary up front.
    label_at = {
        index: metric
        for index, line in enumerate(lines)
        if (metric := _match_metric_line(line)) is not None
    }
    label_indices = sorted(label_at)

    for position, index in enumerate(label_indices):
        metric = label_at[index]
        key = str(metric["key"])
        if key in seen:
            continue

        # Never read past the next label, and never more than a few lines —
        # a bilingual card puts at most a Marathi label between the two.
        next_label = (
            label_indices[position + 1] if position + 1 < len(label_indices) else len(lines)
        )
        boundary = min(next_label, index + 4, len(lines))

        # Every line this row owns, label line included — its values are
        # sometimes printed on it ("AVAILABLE NITROGEN (N) 245.15 280 - 560")
        # and sometimes on the line below.
        band = [(lines[offset], offset) for offset in range(index, boundary)]

        # The range is the anchor, not the reading. It is two numbers joined by
        # a dash, which is a far rarer shape than "a number" and therefore the
        # thing OCR noise is least likely to imitate. Find it first, then read
        # backwards to the value it belongs to.
        ranged = next(
            ((line, offset, m) for line, offset in band if (m := RANGE_PATTERN.search(line))),
            None,
        )

        if ranged is not None:
            line, offset, range_match = ranged
            # The *last* number before the range, not the first. OCR litters
            # these lines with debris from the Devanagari label — a garbled
            # "(B)" arrives as "(3)" — and the first number on the line is
            # frequently that debris. The reading is always the number
            # immediately preceding the range.
            preceding = NUMBER_PATTERN.findall(line[: range_match.start()])
            reading_display = preceding[-1] if preceding else None

            # Nothing before the range on its own line: the reading is on an
            # earlier line of the same row.
            if reading_display is None:
                for earlier, earlier_offset in band:
                    if earlier_offset >= offset:
                        break
                    numbers = NUMBER_PATTERN.findall(earlier)
                    if numbers:
                        reading_display = numbers[-1]

            if reading_display is not None:
                built = _build_metric(
                    key,
                    str(metric["label"]),
                    reading_display,
                    range_match.group(1),
                    range_match.group(2),
                )
                if built is not None:
                    metrics.append(built)
                    seen.add(key)
            continue

        # No range anywhere in this row's lines — nothing to judge it against.
        continue

    return metrics


def extract_soil_metrics(
    text: str, *, include_implausible: bool = False
) -> list[dict[str, object]]:
    """Read the card. Returns only what was actually found — never a padded or
    guessed row. Callers diff against `METRIC_KEYS` to report what is missing.

    `include_implausible` keeps rows that parsed but failed the plausibility
    checks. Only `merge_extractions` wants those, and only for their ranges.

    Both extractors run and their results are merged rather than one being
    chosen wholesale, because they fail in different directions:

      * the row-based reader is anchored to a label line and looks no more
        than a few lines ahead, so it can *miss* a row but cannot attribute
        one row's numbers to another;
      * the flat reader is layout- and order-agnostic and survives text that
        arrived as a single line — OCR output, typically — but a label it
        fails to recognise corrupts the metric before it.

    So where they disagree the row-based reading wins: a missed row is a
    recoverable gap, a misattributed one is a farmer buying the wrong bag.
    """
    section = _soil_section(text)

    flat = _flat_metrics(section)
    rows = _row_metrics(section)

    merged: dict[str, dict[str, object]] = {str(m["key"]): m for m in flat}
    merged.update({str(m["key"]): m for m in rows})

    order = {key: position for position, key in enumerate(METRIC_KEYS)}
    chosen = [
        metric
        for metric in merged.values()
        if include_implausible or metric.get("plausible", True)
    ]
    return sorted(chosen, key=lambda metric: order.get(str(metric["key"]), len(order)))


def merge_extractions(
    candidates: list[list[dict[str, object]]],
) -> list[dict[str, object]]:
    """Combine readings taken from several OCR passes of the same card.

    Each pass sees a different subset of the rows — one drops copper, another
    drops organic carbon — so the union recovers rows no single pass had. That
    is safe because a row only exists at all once it has matched a label,
    produced a range, and passed the plausibility bounds; merging cannot
    conjure a row that no pass saw.

    Where passes disagree on a value, the most-voted reading wins, ties going
    to the earlier (better-scoring) pass. `agreement` records how many passes
    produced the winning value and `sightings` how many saw the row at all.

    Agreement raises confidence but does not establish truth: these are all
    Tesseract, sharing one model, and they misread the same digit in the same
    way often enough that consensus is correlated rather than independent. The
    nitrogen 245.15 → 945.15 error reproduced across resolutions. So an
    OCR-derived reading stays `unconfirmed` however many passes agree.
    """
    if not candidates:
        return []

    by_key: dict[str, list[dict[str, object]]] = {}
    for metrics in candidates:
        for metric in metrics:
            by_key.setdefault(str(metric["key"]), []).append(metric)

    merged: list[dict[str, object]] = []
    for key, rows in by_key.items():
        # --- Stage one: which range is printed on this card? ---------------
        #
        # The range is typeset text and reads the same way every pass, so it
        # is the stable thing to agree on. Rejected rows vote here too: six
        # passes reading "copper 247, range 1-2" are wrong about the reading
        # and right about the range, and their range is what exposes the two
        # passes claiming "34, range 1-5" as noise.
        range_votes: dict[tuple[float, float], int] = {}
        for row in rows:
            span = (float(row["range_min"]), float(row["range_max"]))
            range_votes[span] = range_votes.get(span, 0) + 1
        best_range = max(range_votes.items(), key=lambda item: item[1])[0]

        # --- Stage two: what does that row read, given that range? ---------
        usable = [
            row
            for row in rows
            if (float(row["range_min"]), float(row["range_max"])) == best_range
            and row.get("plausible", True)
        ]
        if not usable:
            # Every pass that agreed on the range produced an unusable value.
            # The honest answer is that this row was not read; it goes into
            # `missing[]` rather than being reported at whatever a stray pass
            # happened to say.
            continue

        reading_votes: dict[float, int] = {}
        exemplar: dict[float, dict[str, object]] = {}
        for row in usable:
            value = float(row["reading"])
            reading_votes[value] = reading_votes.get(value, 0) + 1
            # The first pass to produce a value keeps its formatting — passes
            # arrive best-scoring first, so that is the display string to show.
            exemplar.setdefault(value, row)

        winner = max(reading_votes.items(), key=lambda item: item[1])[0]
        metric = dict(exemplar[winner])
        metric["agreement"] = reading_votes[winner]
        metric["sightings"] = len(rows)
        merged.append(metric)

    order = {key: position for position, key in enumerate(METRIC_KEYS)}
    return sorted(merged, key=lambda metric: order.get(str(metric["key"]), len(order)))


def missing_metric_keys(metrics: list[dict[str, object]]) -> list[str]:
    found = {str(metric.get("key")) for metric in metrics}
    return [key for key in METRIC_KEYS if key not in found]


def summarize_soil_metrics(metrics: list[dict[str, object]]) -> str:
    if not metrics:
        return "No structured soil readings were extracted from the uploaded report."

    out_of_range = [metric for metric in metrics if metric["status_code"] != "normal"]
    if not out_of_range:
        return f"Extracted {len(metrics)} soil readings. All values are within the listed ranges."

    highlights = [
        (
            f"{metric['label']} {metric['reading_display']} "
            f"({str(metric['status']).lower()}, expected {metric['range_display']})"
        )
        for metric in out_of_range[:6]
    ]
    extra_count = len(out_of_range) - len(highlights)
    summary = "Extracted {count} soil readings. Out-of-range values: {items}".format(
        count=len(metrics), items="; ".join(highlights)
    )
    if extra_count > 0:
        summary += f"; plus {extra_count} more"
    return summary + "."
