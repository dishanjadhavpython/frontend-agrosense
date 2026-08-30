# The reading service

Takes a Maharashtra Soil Health Card — as a PDF or as a photograph — and returns
the twelve readings printed on it, what they mean, and an index of the document
for retrieval.

Python, because the useful parts of this have no real JavaScript equivalent:
PyMuPDF for PDF text, Tesseract for photographs, scikit-learn for the retrieval
vectors.

## Running it

```bash
npm run api:install     # once, into the project's .venv
npm run api             # http://127.0.0.1:8000
npm run api:test
```

The Next.js app talks to it through `src/app/api/card/route.ts`, never from the
browser. There is no CORS middleware and no authentication here on purpose:
this process expects to be reachable from the Next server and from nowhere
else. Do not put it on a public address.

## Endpoints

| Route | Does |
| --- | --- |
| `GET /api/health` | Status plus what this instance can do — `ocr_available` matters, see below |
| `POST /api/ingest` | multipart `file`; stores, reads, scores and indexes a card |
| `GET /api/documents` | Everything ingested so far |
| `GET /api/documents/{id}` | One document, re-read if the extractor has since improved |
| `POST /api/ask` | Retrieval-augmented answer over an ingested card |

## How a card is read

Two extractors run on every document and their results are merged, because they
fail in opposite directions.

The **flat** reader collapses the readings table to one line and takes the
trailing three numbers between one metric label and the next. It survives any
layout or ordering, including text that arrived as a single line from OCR. Its
failure mode is dangerous: a label it does not recognise lets the *previous*
metric absorb that row's numbers, so it refuses any segment carrying more
numbers than one row needs.

The **row** reader anchors on a label line and reads at most a few lines
forward, stopping at the next label. It cannot misattribute a value; it can
only miss one.

Where they disagree the row reader wins. A missed row is a recoverable gap; a
misattributed one is a farmer buying the wrong bag.

Measured on `tests/fixtures/soil_health_card_marathi.pdf`, a real bilingual
card: **12 of 12**, every value and range exact. The row-based extractor this
merge replaced managed 2 of 12 on the same file — a Marathi label sits between
the English label and the value, and it consumed the reading slot.

## Reading a photograph

Photographs go through Tesseract, which needs the binary and a language pack:

```bash
brew install tesseract tesseract-lang
```

Without it, `/api/health` reports `ocr_available: false` and photo uploads get a
422 saying to send the PDF instead — rather than a farmer blaming their camera.

One OCR pass is not enough, and the gap is not marginal:

| | readings found | wrong |
| --- | --- | --- |
| One default pass (PSM 3, no scaling) | 3 / 12 | 2 |
| Now | **12 / 12** | **0** |

Three things got it there.

**Page segmentation.** Tesseract's default mode works out the layout for
itself and treats the bilingual table as competing blocks, which shreds the
rows. `--psm 6` — "a single uniform block of text" — reads the table as a
table. This one flag is most of the difference.

**A search, not a guess.** `ocr.py` offers a ranked series of attempts varying
preprocessing, scale, page segmentation and language; `document_service`
scores each by how many of the twelve readings come out and keeps the best.
Sweeping scale against input resolution found no single winner — one
normalisation read 12/12 at some resolutions and 7/12 at others, with no
monotonic trend — so the honest response is to try several genuinely different
things rather than tune a constant to one fixture. A card that reads cleanly on
the first attempt still costs one pass; the search only unfolds when it has to.

**Merging across passes.** Different attempts drop *different* rows. On a
300-dpi render the best single pass reads 11 of 12; the union reads 12. Rows
are merged by key, since each is independently anchored to its own label,
range and plausibility check before it is accepted.

### Guarding against a confident wrong number

The failure that matters is not a missing row, it is a wrong one. Copper is
printed `2.47` and OCR reads it as `247` — the decimal point is genuinely
invisible at these resolutions. Two checks stop that reaching anyone:

- **Plausibility bounds** (`PLAUSIBLE_RANGE`) reject physically impossible
  readings, and a reading more than `MAX_RANGE_MULTIPLE` outside the range the
  card itself printed. 247 against a printed ceiling of 2 is 123x.
- **A two-stage vote** in `merge_extractions`. The *range* is voted on first,
  because it is typeset text and reads the same way every pass; then the
  reading is voted on among only those passes that agreed about the range.
  This is what catches the hard case: six passes read "copper 247, range 1-2"
  — wrong reading, right range — while two read "34, range 1-5". The rejected
  majority's range is what exposes the 34 as noise, so copper is reported
  missing rather than wrong. Rejected rows are kept out of sight but not
  thrown away, precisely so they can vote here.

Measured across renders from 100 to 600 dpi: **zero wrong readings**, 12/12
found at every resolution a phone would produce, degrading to 10–11/12 at the
extremes rather than inventing values.

### It is still marked unconfirmed

Every OCR reading carries `confidence: "unconfirmed"` and its document carries
`needs_review: true`, and the UI turns that into an amber panel asking the
farmer to check each figure against the paper.

That is deliberate even at 12/12. These passes are all Tesseract, sharing one
model: they agree with each other partly because they make the *same* mistakes.
Nitrogen `245.15` was misread as `945.15` consistently across resolutions —
plausible, inside its printed range, and the wrong side of the threshold, which
turns "apply urea" into "apply none". Consensus here is correlated, not
independent, so it raises confidence without establishing truth. The PDF path
is exact and should always be preferred.

## Ranges come from the card

Each row's status is judged against the range **printed on that farmer's card**,
not against a table in here. The product promise is that it reads *your* card,
and contradicting the paper in someone's hand loses the argument before it
starts. Where a lab's window differs materially from ICAR guidance, the UI
footnotes it (`bandDivergesFromGuidance` in `src/data/soilReading.ts`).

## Advice

Two layers, and they answer different questions.

`prediction_engine.py` — pure Python, no model artifacts. Reads the card
against **its own printed ranges**: a soil-health score and a fertilizer plan
that can say *hold* as well as *apply*. It names no crop. It used to, scored
against six hand-written nutrient windows in a `CROP_PROFILES` table with no
dataset behind it; that was a second crop recommender standing behind the real
one, and it was removed.

`models.py` — the three trained models, and the only path to a crop or a
fertilizer recommendation. `POST /api/predict` requires **nine inputs and
supplies none of them**:

| | |
|---|---|
| `document_id` | the already-ingested card |
| `nitrogen`, `phosphorus`, `potassium`, `ph` | off the card, as the farmer confirmed them |
| `temperature`, `humidity`, `rainfall`, `moisture` | the field, typed in |
| `soil_image` | required; the classifier is the only thing that sets soil type |

A missing one is a 422 naming the field. This is deliberate and recent: those
four field conditions previously defaulted to `26°C / 68% / 110mm / 34%` and
the frontend never sent real ones, so every recommendation the product had ever
made was computed for a field that did not exist. See `MissingInput`.

The N/P/K statuses that decide *apply* versus *hold* are recomputed from the
submitted readings against the card's printed range, not read from what was
stored at ingest — otherwise correcting an OCR misread would change the number
on screen and nothing else.

### The nitrogen mismatch, and what it turned out to be

Worth recording, because the obvious fix would have been wrong.

The crop model's `N` column ran 0–140 while a Soil Health Card reports
available nitrogen at 150–700 kg/ha. That looks like a unit problem, and the
tempting fix is a conversion factor. Scoring `Crop_recommendation.csv` against
the government's own critical limits (N low <280, medium 280–560, high >560
kg/ha) shows what it actually is:

| | |
|---|---|
| rows in the SHC "low" N band | **100%** — all 2,200, none reaching even "medium" |
| within-crop spread of K | sd ≈ 3, across a column spanning 5–205 |
| per-crop means | rice 80-48-40, maize 78-48-20, cotton 118-46-20 |

Those are the published ICAR fertilizer doses (rabi rice is 80-40-40), jittered.
The columns are a **fertilizer prescription, not a soil test** — Kaggle's own
description calls them "ratio of Nitrogen content in soil", which they are not.
So the pipeline was asking a fertilizer table what a farmer's soil contained,
and no conversion factor would ever have reconciled that.

It also explains the 99.2% accuracy: with N/P/K near-constant per crop, the
model was a lookup table keyed on a value the product cannot supply.

**Both models were retrained without N, P and K.**

| model | before | after |
|---|---|---|
| crop | 99.2% (7 features) | **96.3%** (temperature, humidity, ph, rainfall) |
| fertilizer | 17.3% (8 features) | **16.5%** (temperature, humidity, moisture, soil, crop) |

Three points and 0.8 points, in exchange for every model input being a quantity
the product actually measures, in the unit the training table used. The
fertilizer model's own NPK columns had the mirror-image problem — 4–42 / 0–19 /
0–42 against a card's hundreds, roughly 24 standard deviations out on every
request — and went for the same reason.

The card's nutrients still decide the fertilizer, and now do so exclusively,
through `_need_score`: each reading against the range printed beside it on that
farmer's own card. That comparison is scale-free, which is why it was always
the part that led and is now the only part.

`training_range_warnings` survives for the ordinary case — 400 mm of rainfall
against a table stopping at 298. Every pair it checks is the same quantity in
the same unit on both sides, so a warning now means an unusual field rather
than an incoherent comparison. Ranges come from `ML/feature_ranges.py`.

## The research agents

Four agents — Planner, Research, Creator, Reviewer — gather current Indian
information for one crop, soil or fertilizer at a time, and five MCP servers
give them their only access to the outside world:

| server | needs | what it is for |
|---|---|---|
| `web_search_server` | nothing | discovery, via `ddgs` |
| `fetch_server` | nothing | reading one page in full |
| `youtube_server` | `YOUTUBE_API_KEY` | one instructional video (degrades to a search link) |
| `mandi_price_server` | `DATA_GOV_IN_API_KEY` | government prices, from Agmarknet on data.gov.in |
| `seller_server` | nothing | where to buy it, from an allowlist |

Three of these exist to keep a specific class of claim away from the model.
Prices come from the government API or the section says they were unavailable.
Shop links come from an allowlist of known Indian sellers, are fetched and
verified before publication, and are checked against that same allowlist again
by the reviewer — because a wrong scheme link wastes an afternoon and a wrong
shop link takes somebody's money.

### When they run

Two triggers, doing different jobs.

**On demand.** `/api/predict` calls `agents.queue.request_now()` with what it
just predicted. The soil and the top crops start researching immediately, so a
farmer who taps their own recommendation finds the page filling in under them.
`AGROSENSE_AGENTS_MAX_INFLIGHT` (default 3) is the ceiling — one prediction
names up to nine topics, and without a cap a handful of simultaneous farmers
would start dozens of agent runs.

**The sweep.** Every `AGROSENSE_AGENTS_SWEEP_MINUTES` (default 30), catching
whatever the request path capped or skipped. A topic refreshes at most once per
`AGROSENSE_AGENTS_INTERVAL_HOURS` (default 8), so two farmers predicting cotton
in the same afternoon produce one run.

`/api/insights/...` carries `researching: true` while a run is in flight, and
the detail page polls every 15s on it. "Being written now" and "not researched
yet" are different things to be told.

### When they don't

`/api/health` reports `insights.queue` and `insights.last_run`, including the
first error verbatim. That exists because of a real failure: six consecutive
topics returning `429 ... credit_balance_exhausted` while every detail page
went on politely saying the topic had not been researched yet — indefinitely,
with nothing anywhere reporting why. An exhausted key and an idle queue used to
look identical from outside. They no longer do.

## Storage

`backend/data/` — uploads and a pickle vector store. Single-process and not
concurrency-safe: fine for one uvicorn worker, and the first thing to replace
before any real deployment.
