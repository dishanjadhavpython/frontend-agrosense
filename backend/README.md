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

`prediction_engine.py` — pure Python, no model artifacts, ported from the
`aws p2 work properly` project. Scores soil health, ranks crops and builds a
fertilizer plan that can say *hold* as well as *apply*.

The XGBoost and torch models that used to do this need six `.pkl`/`.pth` files
that are not in this repository. They are in `_unwired/` with a note on what
each needs to come back.

## Storage

`backend/data/` — uploads and a pickle vector store. Single-process and not
concurrency-safe: fine for one uvicorn worker, and the first thing to replace
before any real deployment.
