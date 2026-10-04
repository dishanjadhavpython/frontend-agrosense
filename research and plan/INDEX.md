# Research and plan

Every design document, research note and plan for AgroSense, in one place.
Consolidated 12 September 2026.

This folder holds **documents people read**. It deliberately does not hold the
files that tooling reads or that programs write — those are listed at the
bottom, with the reason each stayed where it is.

---

## Start here

| Document | What it is |
|:--|:--|
| **[ML_PLAN.md](ML_PLAN.md)** | **The live plan.** The Maharashtra engine-v2 build: scope, the data rule, the farmer's flow, the scorecard, every phase with measured results, the model tournament, and the soil-photo classifier. Updated the same day as the work it describes. |
| **[RECOMMEND_INTEGRATION_PLAN.md](RECOMMEND_INTEGRATION_PLAN.md)** | How the Regur engine replaces the old prediction path in the app. §1 is measured on this machine, not inferred. |
| **[ENGINE_DESCRIPTION.md](ENGINE_DESCRIPTION.md)** | The engine in five paragraphs — the shortest honest account of what it does and why it is five stages rather than one model. |

---

## The engine

| Document | What it is | Status |
|:--|:--|:--|
| [ENGINE_PLAN.md](ENGINE_PLAN.md) | The original implementation plan, with every structural claim re-checked against the raw data before it was written. | Historical — built |
| [ENGINE_PLAN_S2_S3.md](ENGINE_PLAN_S2_S3.md) | Taking the agronomic gate (S2) and yield (S3) from 6/10 to 8.5–9, each target grounded in a diagnostic already run. | Historical — built |
| [ENGINE_DESCRIPTION.md](ENGINE_DESCRIPTION.md) | Plain-language summary of the five stages and the founding insight (R² 0.93 was crop-scale arithmetic; the honest within-crop signal is 0.19). | Current, one stale line — see below |
| [ENGINE_GITHUB.md](ENGINE_GITHUB.md) | Long-form build write-up. | Current, one stale line — see below |
| [ENGINE_LINKEDIN.md](ENGINE_LINKEDIN.md) | Draft post. Every number reproducible from the repo with one command. | Draft |

## The app

| Document | What it is | Status |
|:--|:--|:--|
| [PLAN.md](PLAN.md) | Design direction and build plan, Rev 2 — typography, layout, the reference boards. The visual argument for the whole product. | Historical — built |
| [BACKEND_PLAN.md](BACKEND_PLAN.md) | Reading the Soil Health Card for real. Its own header says **built**, and lists three things that turned out differently from the plan. | Historical — built |
| [AGENTS_PLAN.md](AGENTS_PLAN.md) | Bringing the agent pipeline back into the running app so detail pages show current Indian information. | Plan |
| [AGENTS_INTEGRATION_PLAN.md](AGENTS_INTEGRATION_PLAN.md) | Agent and MCP integration — context engineering for Indian agriculture intelligence. | Plan |
| [DEPLOY.md](DEPLOY.md) | Deployment: two halves, two hosts, and why that is what the app is rather than a preference. | Reference |
| [project.md](project.md) | Generated project report, 8 August 2026. A snapshot, not a living document. | Snapshot |

## Data and results

| Document | What it is | Status |
|:--|:--|:--|
| [SCRAPER_MAHARASHTRA_DATA.md](SCRAPER_MAHARASHTRA_DATA.md) | Everything scraped for Maharashtra: coverage, provenance, and what each source **cannot** tell you. All Government of India portals. | Reference |
| [ML_RESULTS.md](ML_RESULTS.md) | What the models scored, measured 8 August 2026. | **Superseded for soil** — see below |

---

## Known staleness, stated rather than hidden

A folder of documents is only worth having if it says where it is wrong.

- **[ML_RESULTS.md](ML_RESULTS.md) — the soil numbers are superseded.** It reports
  the eight-class classifier at macro-F1 0.906 on the web dataset. That figure
  came from a split where augmented copies of one photograph could sit on both
  sides of the fold boundary. Measured properly on the owner's field data, on
  511 photographs it had never seen, the same model scores **0.949**. The
  current account is ML_PLAN.md §6.

- **ENGINE_DESCRIPTION.md and ENGINE_GITHUB.md name LightGBM as the ranker.**
  The model tournament (ML_PLAN.md §5) selected **CatBoost** for the ranking
  stage by +0.0038 NDCG@5 and kept LightGBM for yield. That margin is below the
  0.01 this project's own §8 calls noise at 34 districts, and it costs 5.4× the
  fit time, so the choice is deliberately revisitable: it lives in
  `ml engine for Recommendation/artifacts/model_selection.json` and changing it
  needs no code edit.

- **ENGINE_PLAN.md cites `data/Crop_Fertiliser_ML_Training_Plan_1.md`**, which is
  not in this repository. The plan stands on its own; the citation does not
  resolve.

- **SCRAPER_MAHARASHTRA_DATA.md links four files that no longer exist** — `ok data
  sets/` is empty, and the scraper's `output/` holds weather through 2024-25 and
  APY from 2015-16 rather than the filenames quoted. Flagged in the document
  itself. The authoritative datasets, each with an md5, are in
  `ml engine for Recommendation/data/raw/` (45 files, `MANIFEST.md5`).

- **Documents marked *Historical* are not wrong, they are finished.** They record
  why a thing was built the way it was, which is the part that decays slowest
  and is hardest to reconstruct later. Read them for reasoning, not for current
  state.

---

## What is deliberately not in this folder

| Stayed at | Why |
|:--|:--|
| `CLAUDE.md`, `AGENTS.md` (repo root) | Tooling reads them from the root, and `next dev` re-creates `AGENTS.md` if it is moved. They are configuration, not documents. |
| `README.md` (repo root, engine, scraper) | A README is the front door of the directory it sits in. Moving it leaves the directory without one. |
| `ml engine for Recommendation/reports/*.md` | **Written by programs, not people** — `scorecard.py`, `ablation.py` and `gate_validation.py` regenerate them into `config.REPORTS` on every run. Moving them would break the writers and the copies would go stale within one run. |
| `no_now/README.md` | Explains the folder it lives in — the parked 961 MB and how to bring any of it back. |

---

## Where the live numbers are

Documents record intent and reasoning. For what the engine currently *scores*,
read the generated reports instead:

    ml engine for Recommendation/reports/scorecard.md         the composite and every sub-score
    ml engine for Recommendation/reports/model_selection.md   every tournament arm, with fit time and latency
    ml engine for Recommendation/reports/gate_validation.md   the agronomic gate against the panel
    ML/models/soil_v2/head_to_head.json                       old vs new soil classifier, same images
