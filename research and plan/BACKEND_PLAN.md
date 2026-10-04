# Reading the card for real — backend plan

> **Status: built.** All six steps in §8 are done and verified end to end. Three things turned
> out differently from the plan below, and they are worth reading before the plan itself:
>
> 1. **The flat extractor was not simply "the good one".** Its phosphorus pattern was wrong, and
>    its failure mode is worse than a miss — an unrecognised label makes the *previous* metric
>    absorb that row's numbers and report them as its own. Both extractors now run and are
>    merged, with the row reader winning any disagreement because it can only miss a row, never
>    misattribute one. Both independently reach 12/12 on the real card.
> 2. **OCR is not trustworthy on this card at any setting** (§9 below, expanded). Photographs are
>    supported, but every reading they produce is marked `unconfirmed` and the UI says so.
> 3. **The RAG extractive fallback could not answer a reading question** — it splits candidate
>    sentences on `.!?`, which Marathi does not use, so "what is my nitrogen?" returned the
>    farmer's name and address. Reading questions are now answered from the extracted table
>    directly (`answer_mode: "extracted_readings"`), which is both more accurate and the only
>    path that cannot misquote a number.
>
> §7's open decision was resolved as recommended: the card's printed range wins, with a footnote
> where it diverges from ICAR guidance.


This is the plan to replace the sample profile behind **Predict** with the twelve numbers
actually printed on a farmer's Soil Health Card, and to stand up the RAG index those numbers
come out of.

It supersedes the "Nothing is extracted yet" note in `PLAN.md` §6 — not by deleting that
notice, but by making it obsolete and replacing it with real provenance (§6 below).

---

## 1. What is actually in this repo right now

Three things were not obvious before reading everything, and all three change the work.

**`backend/` already exists and is a fork of `aws p2 work properly/soil_services/`.**
`chunking.py` and `keyword_extractor.py` are byte-identical between them. The rest diverged:
`backend/` gained OCR (`ocr.py`), an Ollama answer path (`llm.py`), and a rewritten
row-based table parser.

**`backend/` cannot start.** It has no `requirements.txt`, and it imports `boto3`, `torch`,
`pandas`, and `dotenv` while referencing `frontend/`, `RAG/`, `pricecrop/` directories and
`*.pkl` / `*.pth` model artifacts — **none of which exist in this project**. `config.py` also
raises or warns on missing Clerk keys at import time. It is dead code sitting in the tree.

**The Next.js app makes no API calls at all.** The only `fetch` in `src/` is the weather
endpoint. `CardUpload` sets `predicted = true` and renders `SAMPLE_READING`.

---

## 2. The decision that drives everything: which extractor wins

I ran both extractors against the real bilingual Maharashtra card found at
`aws p2 work properly/uploads/user-2-88387b0fa4-soil_health_card_03_ramesh_pawar.pdf`.

| Extractor | Readings found |
| --- | --- |
| `backend/soil_report.py` (row-based, the "newer" one) | **2 / 12** |
| `aws p2 .../soil_report.py` (flat, the "older" one) | **12 / 12** |

The newer one fails because a real Maharashtra card interleaves a Marathi label between the
English label and the value:

```
AVAILABLE BORON (B)      ← matched as the metric
उपलब्ध बोरॉन (B)          ← taken as the "reading" line → no digits → row skipped
0.68                     ← the actual reading, never reached
0.40 - 1.00
```

`ph` and `ec` only survive by accident: `_normalize_line` strips Devanagari, so `सामू (pH)`
collapses to `PH` and re-matches the metric on the *second* line, which happens to put the
reading and range in the right slots.

The older flat extractor normalises the whole section to one line and takes the last three
numbers between one metric label and the next. On this card that is exactly right, twelve
times over:

```
available_boron        0.68   range 0.40 - 1.00     normal
available_nitrogen   245.15   range 280 - 560       low
available_phosphorus  18.40   range 10 - 25         normal
available_potassium  352.75   range 120 - 280       high
ph                     8.12   range 7.5 - 8.9       normal
ec                     1.06   range 0.20 - 0.90     high
organic_carbon         0.19   range 0.20 - 0.60     low
available_sulphur     21.95   range 10.20 - 30.50   normal
available_zinc         0.31   range 0.50 - 1.00     low
available_iron         2.88   range 2.20 - 5.60     normal
available_manganese   10.42   range 7.10 - 9.99     high
available_copper       2.47   range 1 - 2           high
```

Every one of those is verifiable by eye against the raw PDF text.

> **Decision.** The flat extractor from `aws p2` becomes the primary path. The row-based one
> is kept as a fallback for cards that are English-only or laid out one-value-per-row, with
> the Devanagari-interleave bug fixed. `extract_soil_metrics` runs both and keeps whichever
> yields more metrics — a card that defeats one layout assumption usually satisfies the other.

Everything else in `backend/` that is genuinely better — OCR fallback, `ocr_page_numbers`
provenance, `extraction_version` cache invalidation, the Ollama-or-extractive answer split —
is kept.

---

## 3. Architecture

```
Browser (Next.js :3000)
   │  multipart POST /api/card   { card: File, soil?: File }
   ▼
Next Route Handler  src/app/api/card/route.ts     ← server-only, node runtime
   │  size + MIME gate, friendly bilingual errors
   │  fetch(AGROSENSE_API_BASE + "/api/ingest")
   ▼
FastAPI  backend/  :8000
   │
   ├── ingest.py            PDF | JPG | PNG | HEIC → text        [NEW]
   │     ├── PDF  → pdf_processor.extract_text (PyMuPDF, OCR per page on empty)
   │     └── image→ ocr.recognize_text_from_image_bytes
   ├── soil_report.py       flat + row-based → 12 metrics        [MERGED]
   ├── prediction_engine.py crops / fertilizer / health score    [PORTED from aws p2]
   ├── chunking → embeddings (HashingVectorizer) → vector_store.pkl
   └── rag_pipeline.py      extractive answer; Ollama when available
```

The browser never talks to Python. One origin, no CORS, no keys in the client, and the
Route Handler is the single place that decides what a farmer sees when the backend is down.

---

## 4. Backend file plan

### Keep and repair

| File | Change |
| --- | --- |
| `config.py` | Strip AWS/Clerk/agents/model config. Keep data dirs, OCR, Ollama. Point `DATA_DIR`/`UPLOAD_DIR` at `backend/data/`. Remove the import-time `raise`. |
| `pdf_processor.py` | Keep as-is. Already does OCR-on-empty-page with provenance. |
| `ocr.py` | Keep as-is. Already degrades to `""` rather than raising. |
| `soil_report.py` | **Merge** — flat extractor primary, row-based fixed and secondary. |
| `chunking.py`, `embeddings.py`, `keyword_extractor.py`, `vector_store.py` | Keep. |
| `rag_pipeline.py`, `llm.py` | Keep. Ollama optional; extractive fallback already covers it. |
| `pdf_pipeline.py` | Keep `DocumentManager`, extend to accept images. Bump `EXTRACTION_VERSION` to 4 so every previously-cached document re-extracts. |
| `app.py` | **Rewrite small.** Drop every static-file and legacy route. Keep `/api/health`, `/api/ingest`, `/api/documents`, `/api/documents/{id}`, `/api/ask`. |

### New

- **`prediction_engine.py`** — ported verbatim from `aws p2 work properly/soil_services/`.
  Pure Python, no model artifacts, works the moment it lands. This is the piece `backend/`
  lost when it moved to torch/XGBoost.
- **`ingest.py`** — one entry point that takes bytes + filename and returns
  `(text, pages, ocr_pages, source)` regardless of whether it was a PDF or a photo.
- **`requirements.txt`** — `fastapi`, `uvicorn`, `python-multipart`, `pymupdf`, `numpy`,
  `scikit-learn`, `pillow`, `pytesseract`, `httpx`. All verified to have Python 3.14 arm64
  wheels against the existing `.venv` (3.14.6).
- **`tests/`** — ported `test_soil_report.py` and `test_prediction_engine.py`, plus a new
  regression test that asserts **12/12 on the real Ramesh Pawar card**. That card gets copied
  to `backend/tests/fixtures/`.

### Quarantine → `backend/_unwired/`

`prediction.py` (torch + 6 missing `.pkl`/`.pth`), `crop_economics.py` (missing
`pricecrop/price.csv`), `clerk_auth.py`, `agents/`. Nothing imports them. A
`_unwired/README.md` records exactly what each needs to come back — which artifacts, which env
vars. The `ML/*.ipynb` notebooks that train those models stay where they are.

---

## 5. API contract

**`POST /api/card`** (Next) → **`POST /api/ingest`** (FastAPI)

Request: multipart. `card` required — `application/pdf`, `image/jpeg`, `image/png`,
`image/heic`. `soil` optional image, accepted and stored but not yet classified (the soil
classifier is quarantined; the UI must keep saying so).

Response:

```jsonc
{
  "documentId": "a3f19c…-soil-health-card.pdf",
  "filename": "soil_health_card.pdf",
  "source": "native" | "ocr",          // how the text was recovered
  "ocrPages": [1],                     // pages that needed OCR, for the warning line
  "readings": [
    { "metricKey": "available_nitrogen", "value": 245.15,
      "rangeMin": 280, "rangeMax": 560, "status": "low" }
  ],
  "missing": ["available_boron"],      // of the twelve, what was NOT found
  "summary": "Extracted 12 soil readings. Out-of-range values: …",
  "health": { "score": 64, "label": "Needs monitoring", "summary": "…", "flagged": [...] },
  "crops": [{ "name": "Cotton", "score": 78.4, "reason": "…" }],
  "fertilizerPlan": [{ "title": "Nitrogen support", "status": "low",
                       "metric": "Available Nitrogen (N)", "action": "…" }]
}
```

Error mapping in the Route Handler, each with Marathi and English copy:

| Condition | HTTP | What the farmer sees |
| --- | --- | --- |
| Wrong type / over 10 MB | 400 | Already handled client-side; server repeats it as a guard |
| Text recovered but **zero** of twelve metrics found | 422 | "We couldn't find the readings on this card. Try a straighter, brighter photo." |
| No text at all, OCR unavailable | 422 | "This looks like a scan and OCR isn't set up on the server." |
| FastAPI unreachable | 502 | "Reading is temporarily unavailable. Your card wasn't stored." |

---

## 6. Frontend changes

### `src/data/soilReading.ts`

Add `metricKey` (the backend's snake_case key) to each of the twelve `Reading` rows, then add:

```ts
export function readingsFromExtraction(metrics: ExtractedMetric[]): {
  readings: Reading[];
  missing: DictKey[];
}
```

It walks `SAMPLE_READING` **in card order** and, for each row, looks for a matching extracted
metric. Found → a real `Reading` carrying the real value. Not found → it goes in `missing` and
**is not rendered**. A partially-read card must never quietly show sample numbers next to real
ones; that is the exact failure `PLAN.md` §6 exists to prevent.

`symbol`, `unit`, `axis`, `dp`, `scale` stay in this file — they are presentation facts about
how the twelve are drawn, not data on the card. One table, as the file's own header insists.

### `src/components/site/CardUpload.tsx`

`onClick={() => setPredicted(true)}` becomes a real submit: pending state on the button,
error state in the existing `role="alert"` slot, and `<NutrientChart readings={real} />` on
success.

**The sample-figures notice is replaced, not deleted.** On a real reading the amber
`role="status"` block becomes a provenance line saying what was actually done:

> Read from `soil_health_card.pdf` — 12 of 12 readings found.
> *(or)* 9 of 12 found; boron, iron and copper weren't legible.
> *(and, when `ocrPages` is non-empty)* Page 1 was read by OCR — check these against your card.

The sample notice stays in the component for the untouched-state path and for the soil-photo
half, which is still unwired.

### New files

- `src/app/api/card/route.ts` — the proxy. `export const runtime = "nodejs"`.
- `src/lib/api.ts` — `AGROSENSE_API_BASE`, typed response, one `fetch` wrapper.
- `.env.example` (+ `!.env.example` in `.gitignore`, which currently ignores all `.env*`).

---

## 7. Open decision — whose range decides "low"?

The card prints its own lab ranges, and they **disagree** with the ICAR constants in
`soilReading.ts`:

| Metric | Card's printed range | `soilReading.ts` band |
| --- | --- | --- |
| pH | 7.5 – 8.9 | 6.5 – 7.5 |
| Organic carbon | 0.20 – 0.60 | 0.50 – 0.75 |
| Potassium | 120 – 280 | 108 – 280 |

At pH 8.12 the card says **normal**; ICAR says **alkaline**. `ratingKey()` would print
"neutral" for a soil the rest of the site would call alkaline.

**My recommendation:** the bar and its status use **the card's printed range**, because the
product promise is "we read *your* card" and contradicting the farmer's own document is the
fastest way to lose their trust. Where the card's range diverges materially from ICAR — pH and
organic carbon on this sample — the row carries a small footnote naming the difference rather
than silently picking a winner.

I will implement it that way unless you say otherwise; it is a one-function change either way.

---

## 8. Sequencing

1. **Backend runs at all** — `requirements.txt`, install into `.venv`, quarantine dead
   modules, trim `config.py`, minimal `app.py`, `/api/health` responds.
2. **Extraction is correct** — merge `soil_report.py`, port `prediction_engine.py`, land the
   tests, prove 12/12 on the real card in CI-able form.
3. **Images work** — `ingest.py`, Tesseract install (`brew install tesseract tesseract-lang`
   — it is **not** on this machine), verify against a photographed card.
4. **Wire the proxy** — `route.ts`, `api.ts`, env, error paths including backend-down.
5. **Wire the UI** — `readingsFromExtraction`, real `CardUpload` submit, provenance line.
6. **RAG stays warm** — confirm the vector store is written on ingest and `/api/ask` answers
   against it, so the Q&A surface is a UI task later, not a backend task.

Steps 1–2 are the substance. Step 3 is the one with an external dependency.

---

## 9. Risks

- **OCR now reads the whole card; the remaining risk is a plausible misread.** This was the
  biggest risk in the system and has largely been closed. Measured across renders from 100 to
  600 dpi, with `backend/README.md` covering the mechanism:

  | | readings found | wrong |
  | --- | --- | --- |
  | One default pass | 3 / 12 | 2 |
  | Now | **12 / 12** at every realistic resolution | **0**, at any resolution |

  Three changes did it: `--psm 6` instead of Tesseract's layout guesser, which was shredding
  the bilingual table; a ranked *search* over preprocessing, scale, language and segmentation
  scored by how many readings come out; and merging rows across passes, because different
  passes drop different rows — the best single pass reads 11 of 12 where the union reads 12.

  Two guards stop a wrong number reaching a farmer. A reading far outside the range the card
  itself printed is refused (copper `247` against a printed ceiling of `2` is 123x). And
  `merge_extractions` votes on the **range** before the reading, so a pass that misread the
  range cannot outvote passes that did not — which is what turns a wrong copper into a missing
  copper.

  What remains: **a digit misread landing inside the plausible range cannot be caught from the
  text alone.** Nitrogen 245.15 → 945.15 is a possible soil. So every OCR reading stays
  `confidence: "unconfirmed"`, because agreement between Tesseract passes is correlated rather
  than independent — they make the same mistakes. The PDF path is exact and preferred.
- **The flat extractor's `numbers[-3:]` heuristic** is proven on one real card. A card whose
  Marathi label contains digits, or with an extra printed column, would mis-slot. Mitigated
  three ways: the segment-length guard refuses a segment that has run past an unrecognised
  label, the row reader wins any disagreement, and `missing[]` names what could not be read
  rather than inventing a value.
- **One real card.** Every measurement here is against a single Palghar-district layout. Other
  districts and other labs print differently. More fixtures are the highest-value next
  investment, and `backend/tests/fixtures/` is set up to take them.
- **The pickle vector store is single-process and not concurrency-safe.** Fine for local dev
  and one uvicorn worker; it is the first thing to replace before any real deployment.
- **HEIC** needs `pillow-heif`; without it iPhone photos that report `image/heic` fail. Added
  to requirements, flagged if the wheel misbehaves.

---

## 10. Explicitly not in this plan

Auth (Clerk is a dependency but there is no `ClerkProvider`), the soil-type image classifier
(needs the quarantined torch model), crop economics / mandi prices, the Q&A chat UI, and any
deployment work. Each is a clean follow-on once step 6 lands.
