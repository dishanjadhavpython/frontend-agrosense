# Files and folders that are not part of AgroSense

Audit of 3 October 2026. "Not part of the project" means: **nothing the product
runs, builds, tests or deploys reads it, and no project document depends on it.**
Each entry was checked against the code (imports, file references, Dockerfiles,
Terraform, `scripts/`), not judged by its name. Sizes are on-disk.

Nothing here has been deleted. Sections 1–3 are safe to remove; section 4 is the
opposite list — things that *look* irrelevant but are load-bearing.

---

## 1. Safe to delete — not used by anything

| Path | Size | What it is | Why it is irrelevant |
|---|---|---|---|
| `PHOTO-2026-09-14-05-06-47.jpg` | 976 KB | A stray phone photo at the repo root | Referenced by no code, page or document; untracked by git |
| `fly.toml` | 4 KB | Fly.io deployment config for the reading service | Superseded by the AWS deployment in `terraform/`; nothing reads it |
| `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg` | 20 KB | `create-next-app` boilerplate icons | Referenced by no component or page |
| `ml engine for Recommendation/.venv-old/` | 1.0 GB | A previous virtualenv of the engine | Not used by any command, Dockerfile or test |
| `ml engine for Recommendation/.venv-broken-py313/` | 505 MB | A virtualenv explicitly named broken | Not used anywhere |
| `ml engine for Recommendation/Screenshot 2026-08-28 at 8.59.21 PM.png` | 40 KB | A screenshot | Referenced nowhere |
| `scrape data imp/example.json` | 0 B | Empty file | Empty; referenced nowhere |
| `scrape data imp/image.png` | 12 KB | A screenshot | Referenced nowhere |
| `scrape data imp/pipeline_dashboard.html` | 36 KB | A one-off HTML dashboard of a scraping run | Not served, not linked |

## 2. Archive outside the repository — history, not product

These are kept on purpose as history (see `no_now/README.md`), but they are
large and nothing in the product reads them. Moving them to a separate archive
drive or a cloud bucket keeps the repo small and backups fast.

| Path | Size | What it is |
|---|---|---|
| `no_now/aws p2 work properly/` | 257 MB | The upstream Flask project the backend was forked from |
| `no_now/ML/` | 322 MB | Parked notebooks and data from the earlier ML phase |
| `no_now/data-sourse/` | 28 MB | Screenshots and WhatsApp images used as reference while writing `src/data/fertilizers.ts` |
| `no_now/backend/` | 48 KB | The pre-fork prediction engine and auth (`_unwired`), with its hand-rolled CNN |
| `ML/train_soil.py`, `ML/prepare_soil_dataset.py` | — | The v1 soil pipeline that trained the retired model; superseded by `prepare_soil_v2.py` + `train_soil_v2.py` |
| `ML/score_old_soil_model.py`, `ML/compare_soil_models.py` | — | The four-class head-to-head tools; their outputs are archived in `ML/models/soil_v2_4class/`, and the field set they relied on turned out to be a subset of the training folder |
| `ml engine for Recommendation/data/raw/_rejected/` | — | Raw files the engine's ingest rejected; kept for audit only |

> `no_now/README.md` is out of date in one respect: it says
> `data set of the project/` was retired. It is the eight-class training set
> again (see section 4) and lives at the repo root, not in `no_now/`.

## 3. Generated or machine-local — delete freely, they are rebuilt

| Path | Size | Rebuilt by |
|---|---|---|
| `.next/` | ~500 MB | `npm run dev` / `npm run build` |
| `tsconfig.tsbuildinfo` | 204 KB | `tsc` (already in `.gitignore`) |
| `.DS_Store` (root, `no_now/`, `scrape data imp/`, engine) | — | macOS Finder |
| `**/__pycache__/`, `ml engine for Recommendation/.pytest_cache/` | — | Python / pytest |
| `terraform/.terraform/` | ~680 MB | `terraform init` (already git-ignored) |
| `.idea/`, `scrape data imp/.idea/`, `ml engine for Recommendation/.idea/` | ~130 KB | JetBrains IDE settings — editor state, not project code. `.idea/` is currently **tracked in git**: untrack it with `git rm -r --cached .idea` and add `.idea/` to `.gitignore` |

## 4. Looks irrelevant — keep it

| Path | Why it must stay |
|---|---|
| `data set of the project/` | The eight-class soil training set the served classifier was trained on (`ML/prepare_soil_v2.py`). Git-ignored, as it should be |
| `scrape data imp/` (code and `output/`) | The scrapers that produced the engine's raw data. The examiner pages cite it as data provenance, and it is how the data is refreshed |
| `research and plan/` | Design documents; `backend/config.py` and other modules point to them |
| `ML/models/legacy_8class/` | The previous serving model — rollback is a copy |
| `ML/models/soil_v2_4class/`, `ML/data/soil_v2_4class/` | The four-class run, kept for rollback and as context for the examiner chapter |
| `ml engine for Recommendation/.venv/` | Built on another machine and its interpreter link is broken, but its packages are what the engine currently runs on here. Replace it with `uv sync` in that folder, then it can go |
| `ml engine for Recommendation/soil health card/` | Sample cards used by the tests and the end-to-end checks |
| `ml engine for Recommendation/run.shell` | A working local launcher for the engine (uvicorn on 127.0.0.1) |
| `ml engine for Recommendation/maharashtra-blank-map.jpg` | The source image of the map plate the frontend draws (`public/img/recommend/maharashtra.png`, same 1024 × 848 frame). Not read by code, but it is the asset to regenerate the plate from |
| `ml engine for Recommendation/Crop_Fertiliser_ML_Training_Plan.pdf` | The engine's original training plan — design history for the paper and the viva |
| `.env`, `.env.local` | Local configuration and secrets — required, and must never be committed (git-ignored via `.env*`) |
| `.clerk/` | Clerk's local development state (git-ignored) |

## 5. Hygiene fixes found during the audit

- **Add `.venv/` to `.gitignore`.** The root virtualenv (1.2 GB) is currently
  untracked but *not ignored*: one `git add .` would try to commit it.
- **Untrack `.idea/`** (see section 3).
- **`ML/train_fertilizer.py` cannot be re-run from this repo:** its source CSV
  (`data set of the project/fertilizer data/train.csv`) is no longer present.
  The served fertilizer model is unaffected; retraining needs the Kaggle file
  put back.
