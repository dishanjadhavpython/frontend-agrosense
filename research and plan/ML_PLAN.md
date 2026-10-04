# ML plan — AgroSense for Maharashtra (engine v2)

*Status: approved 12 September 2026 · replaces the August 2026 three-model plan
(kept, condensed, in the appendix).*

AgroSense recommends crops and fertilisers to **Maharashtra's farmers**, and nothing in
this plan reaches beyond the state. Every dataset, crop, soil class, weather series and
metric is scoped to Maharashtra's **34 districts and 358 talukas**. A number measured on
another state's data does not describe this product, so it doesn't appear here.

---

## 0. The data rule

The product is judged on whether a farmer can act on its answer. That rules out a class
of shortcut outright:

> **No random, synthetic or unverified data — anywhere.** Every dataset comes from the
> owner's scraper (`scrape data imp/`) or from files the owner supplies. Each is recorded
> with its source, retrieval date and MD5, so any number in any report can be traced back
> to a file.

This isn't abstract. The first crop model in this repository was trained with its soil
column filled by `np.random.randint(0, 4)` (appendix A.2). Its accuracy never depended on
soil at all, and nobody could tell from the headline number.

**Soil photographs follow the same rule, more strictly.** The classifier is retrained
only on a Maharashtra soil-image dataset **the owner provides**. When that work starts,
the first step is to ask the owner for the dataset's path. Folders found on disk are not
used unless the owner names them. That includes the Roboflow export
(`soil images from version/`), `4 soils in use/` and `data set of the project/`, which
are web-sourced and pre-augmented, and not Maharashtra-specific.

---

## 1. The farmer's flow, and what answers each step

| # | Farmer gives / sees | Answered by | Where |
|:--|:--|:--|:--|
| 1 | Soil Health Card → 12 readings (N, P, K, OC, pH, EC, S, Zn, Fe, Mn, Cu, B) | OCR + card parser | `backend/soil_report.py`, `src/lib/soilTest.ts` |
| 2 | Photo of the soil → soil type | Soil-photo classifier (retrained on the owner's data) | `ML/`, `backend/models.py` |
| 3 | Weather of the place | Taluka climatology + year-matched history from NASA POWER | engine `src/features/agroclimate.py`, `climatology.py` |
| 4–5 | All of it matched together | **The Regur engine** (`ml engine for Recommendation/`) | `src/pipeline.py` |
| 6 | Soil type from the photo feeds the engine | Bayesian fusion with the taluka's soil survey | engine `src/rules/soil_fusion.py` *(new)* |
| 7 | Taluka, picked on the map | `TalukaMap.tsx` / `LocationSeason.tsx` | app |
| 8 | Season (Kharif / Rabi / …) + irrigated or rainfed | request fields → S2 gate, S1 fit features, S4 recipe | engine |
| 9 | Crops: grow confidently / possible / not recommended — and under what weather | S1 ranker + S2 gate + S3 outlook | engine |
| 10 | Fertiliser per crop: dose, split schedule, micronutrients | S4 exact table + interpolation | engine `src/rules/fertiliser.py` |

The old XGBoost crop and fertiliser models are **not used** (appendix A). The soil-photo
classifier is kept as a capability. Its model may be replaced if a new one wins on the
owner's data under a leak-free protocol.

---

## 2. Where the engine stands today (measured)

**Crop ranking.** NDCG@5 0.883 under GroupKFold by district, against a popularity
baseline of 0.740 (oracle ceiling 0.978). Forward chaining 0.888. Grouped + temporal
0.805. The 0.883 is slightly optimistic: the blend weights are fitted on the same
out-of-fold scores they are scored on (`src/eval/ablation.py`, `ranking_benchmark`).

**Defects found in the code:**

- **The ranker only sees district averages.** `_query_frame_cached` in `pipeline.py`
  filters by district and season. The taluka and the farmer's card never reach S1; the
  card only touches the S2 gate (pH, EC) and the S4 dose.
- **Fertiliser ignores season and irrigation.** An irrigated Rabi crop can receive the
  rainfed Kharif recipe. The table's own columns are mixed up (`Crop_Season` holds
  "Irrigated"/"Rainfed") and it has no Summer rows.
- **Irrigation is half-wired.**
  - The irrigated flag reaches only the S2 gate.
  - The S1 fit features always assume irrigated; `water_limited` always assumes rainfed.
  - The LGP rule lets "irrigated" veto crops that "rainfed" allows.
- **Yield serving uses the wrong year and statistics.** It uses `year_index = 0` and
  converts yields with 2015-16 statistics. Its conformal intervals are calibrated on a
  model that isn't the one served.
- **The out-of-distribution guard can't fire.** It reads only soil-nutrient columns, and
  its threshold is the largest distance in the corpus.
- **Smaller defects:**
  - 81 duplicated climate columns.
  - A single-seed ranker.
  - A cache key that misses most inputs.
  - A safety test that can't fail.
- **Weather is from the wrong years.** It covers 2023-24 → 2025-26, while the crop labels
  cover 2015-16 → 2022-23, so weather is only a climatology description.

**The shipped soil-photo classifier's score is leaky.** The reported CV macro-F1 is 0.906,
but:
- Roboflow rotations of one photo land in both training and validation folds.
- Every rare-class image is 640×640, a shortcut the model can learn instead of soil.
- It gets **1 of 4** reference photographs right.
- Two of its eight classes, cinder and peat, are not Maharashtra soils.

### The baseline, measured

`python -m src.eval.scorecard --label "Phase 0 baseline"`, 12 September 2026 —
**composite 6.00 / 10** (uncapped 6.53; 90% of the weight measured; capped because two
hard gates fail). 195/195 tests pass.

| Sub-score | Measured | Score /10 |
|:--|--:|--:|
| Forward-chaining NDCG@5 margin over popularity | +0.111 | 5.6 |
| Grouped + temporal margin | +0.060 | 6.7 |
| False vetoes on >5% of district area | 0.9% | 8.4 |
| Metamorphic relations M1–M3, M6 | 100% | 10.0 |
| Fertiliser season/irrigation context-match | 73% | 0.0 |
| Cold-start within-crop yield rho | 0.396 | 3.8 |
| Served 90% interval coverage error | 0.004 | 10.0 |
| Inputs that change the answer | 14 of 15 | 9.3 |
| Explanations, provenance, crop count | 0.40 | 4.0 |
| Soil photo (two sub-scores) | not measured | — |

**Failing gates.** Irrigating vetoed crops that rainfed allowed, in 8 taluka-season-crop
cells; and the cache key covered 9 modules instead of all 64 inputs. Both are fixed in
Phase 1.

### After Phase 1 — composite 7.75 / 10

`--label "Phase 1 correctness fixes"`, same anchors, 202/202 tests pass, **all six hard
gates green**. What moved:

| Sub-score | Baseline | Phase 1 |
|:--|--:|--:|
| Fertiliser season/irrigation context-match | 0.73 (scored 0.0) | **1.00 (10.0)** |
| Served 90% interval coverage error | 0.0044 | **0.0006** |
| Explanations and provenance | 0.40 | **0.60** |
| Gates passing | 4 of 6 | **6 of 6** |

A follow-up run (**7.85**) dropped the 81 exactly duplicated climate columns, bagged the
served ranker over five seeds and constrained the agronomic-fit features to be monotone —
and made evaluation use that same configuration, so the benchmark measures the model that
serves. Ranking rose slightly (grouped + temporal margin 0.060 → 0.066) and cold-start
yield rho slipped 0.396 → 0.387. It is kept for the two correctness properties rather than
the score: duplicated columns no longer enter the model, and served no longer differs from
evaluated.

Ranking and cold-start yield are unchanged by Phase 1 itself, which is the expected
result: those fixes corrected what the engine *says*, not what it knows.

### Phases 2–3 — every crop year finally has its own weather

The limitation every previous report opened with is gone. **29 weather years** now sit in
`data/raw` (1997-98 → 2025-26), fetched from the same NASA POWER API with the same
parameters as the delivered files; on the one overlapping year the re-fetch matched the
existing file exactly, so the series is one consistent source. `APY_WEATHER_MATCH` — empty
for the entire life of the project — maps all eight crop years to the weather they were
grown in.

Two rules keep that honest, and both are tested:

- **As-of normals.** A crop year averages only weather years *earlier* than itself, so a
  2015 recommendation cannot know 2022's monsoon. The windows grow 18 → 25 years across
  the panel.
- **Year-matched weather is for yield only.** The `wx_*` columns carry the season's own
  weather and reach the yield model, which explains a season after it happened; they are
  excluded from the ranker, which answers before it. Measured: **ranker 229 features with
  0 `wx_`, yield 310 with 81**.

The signal this unlocks is real — 2015-16 Kharif rainfall averaged **847 mm** against
**1,332 mm** in 2022-23, while the as-of normal barely moves (999 → 1,031 mm). A yield
model that could previously only see "what this place is typically like" can now see that
2015 was a drought.

**The longer normals exposed a false veto, and fixing it mattered more than the score.**
Averaging 1997-2022 instead of 2023-26 changed each district's length of growing period,
and the gate began vetoing **Dharashiv's Kharif soybean in all eight years** — a crop that
district plants across 35-77% of its cropped area — at a score of 0.248, a hair under the
0.25 line.

The cause was in the veto logic: water factors were relieved only when rainfall *also*
fell short. But length of growing period measures the **rainfed** season and has no "too
long" failure mode, so a short one is always a water shortfall — exactly what irrigation
and stored monsoon moisture answer. It is now relieved unconditionally when deciding a
veto, while rainfall is still relieved only on shortfall, because no amount of irrigation
undoes excess rain.

Those eight cells now read **"needs irrigation"** rather than being removed from the
farmer's list, LGP disappears from the false-veto table entirely, and false vetoes above
5% of district area fell 0.0090 → 0.0084. The case is pinned as a regression test.

One test was deliberately loosened rather than satisfied. Under the longer normals the S2
and S3 classes sit within half a percentage point of each other on planted rate (0.685
against 0.691, well inside one standard error), so the suite now asserts what the
validation can support — suitable is planted far more than vetoed, and the top class beats
the marginal one — instead of pinning an ordering that is noise at this sample size.

### Scored — composite 7.97 / 10

235 tests, all six gates green. What the weather panel bought, and what it cost:

| Sub-score | Phase 1b | Phase 2-3 |
|:--|--:|--:|
| Cold-start within-crop yield rho | 0.387 (3.48) | **0.432 (5.28)** |
| False vetoes on >5% of district area | 0.0090 (8.40) | **0.0084 (8.64)** |
| Grouped + temporal ranking margin | 0.0660 (7.33) | 0.0630 (7.00) |
| Forward-chaining ranking margin | 0.1120 | 0.1120 |

Cold-start yield is the point: 0.432 clears both the 0.387 it started this phase at and the
0.396 the project began with. It is the first time weather has contributed anything to this
engine, because it is the first time a crop year could be compared with its own weather.

**Where the remaining distance to 9.5 lives.** Weighting each sub-score by what it is
short: forward-chaining margin 6.5, grouped + temporal 4.5, cold-start yield 3.5,
explanations 2.0, false vetoes 1.4. The two ranking margins are 11 of the 18.3 points
missing, so ranking decides whether this reaches 9.5 — and one standing finding sharpens
that: **the ranker alone scores 0.844 under forward chaining while the engine as served
scores 0.829**, so the blend is currently costing accuracy rather than adding safety.

### Phase 4 — the card now reaches the ranker

Until now the twelve card readings reached the Liebig gate and the fertiliser dose but
never S1, so two farmers in one district with different soil were shown the same ordered
list. The agronomic-fit block is *computed* rather than learned — S2 scoring a crop against
land — so at serving there was no reason to evaluate it on a district average when the
farmer's own taluka, pH and water regime are known. It now is.

Measured: substituting pH 5.0 for pH 8.6 moves five fit columns (`fit_pH`, `fit_min`,
`fit_mean`, `fit_gap`, `fit_vetoed`) and changes the learned score by up to **1.04**. Two
tests pin it — a mild contrast must move learned scores, and an extreme one must change
which crops are offered.

**What this does not do, stated plainly:** it will not move the forward-chaining or
grouped + temporal margins. Those are evaluated on district-level queries, where there is
no taluka variation to exploit — the labels are district-level and nothing finer can be
learned from them. This is a product-correctness fix: farmer inputs now matter. The
composite levers that remain are the two ranking margins and cold-start yield. The remaining distance to 9.5 is
almost entirely ranking margin, cold-start yield skill, and the soil photo.

**Two findings the baseline exposed, and neither is comfortable:**

- **The blend and veto currently cost accuracy.** The ranker alone scores 0.847 under
  forward chaining; the engine as served scores 0.828.
- **The margin over the *strongest* trivial baseline is small.** "Grow what this district
  grew last year" scores 0.819 against the engine's 0.828. The +0.111 margin is over the
  state-wide popularity prior, which is the weaker bar. Both are now reported side by side
  on every run, because quoting only the popularity margin would flatter the engine.

---

## 3. The scorecard — what "9.5" means

`src/eval/scorecard.py` writes `reports/scorecard.md`, adding a dated row every time it
runs. It runs after every phase. Its anchors are **frozen in code and hashed before any
improvement work**, so they can't be moved after the results are seen.

Every metric goes through the **served code path**. Significance is a paired test over
the **34 districts** (cluster bootstrap / Wilcoxon on district means, Holm-corrected).
1,088 ranking queries are not 1,088 independent facts.

**Hard gates.** If any fails, the composite is capped at 6.0:
- all tests green
- fertiliser table exactness 100%
- vetoes(irrigated) ⊆ vetoes(rainfed) everywhere
- the photo never removes a hard-factor veto
- the no-leakage tests pass
- the cache key covers every input

| Sub-score | Weight | 0 at | 10 at |
|:--|--:|:--|:--|
| Forward-chaining NDCG@5 margin over popularity | 1.5 | +0.05 | +0.16 |
| Grouped + temporal NDCG@5 margin | 1.5 | 0 | +0.09 |
| False vetoes on >5% of district area | 1.0 | ≥ 3% | ≤ 0.5% |
| Metamorphic tests M1–M6 pass rate | 1.5 | 90% | 100% |
| Fertiliser season/irrigation context-match | 1.0 | 80% | 100% |
| Cold-start within-crop ρ (yield) | 0.75 | 0.30 | 0.55 |
| Served-regime 90% interval coverage error | 0.75 | 0.10 | ≤ 0.02 |
| Soil photo macro-F1 on the owner's dataset (grouped CV) | 0.5 | 0.60 | 0.85 |
| Soil photo calibration (ECE) + non-soil rejection | 0.5 | — | ≤ 0.05, ≥ 95% |
| Inputs that measurably change the answer | 0.5 | — | 12 card readings + photo + irrigation + season |
| Provenance / explanations; Maharashtra crop count | 0.5 | — | every crop explained; 19 → ≥ 45 crops |

**Metamorphic tests** check that each farmer input moves the answer in the agronomically
right direction:

| Test | Input change | Must hold |
|:--|:--|:--|
| M1 | pH 5 | crops needing pH ≥ 6 never rise |
| M2 | high EC | salt-sensitive crops never rise |
| M3 | rainfed → irrigated | irrigating never vetoes more crops than rainfed |
| M4 | season / irrigation request | the recipe matches the requested season and water regime |
| M5 | soil photo | never relaxes depth, drainage or salinity |
| M6 | low N / S / Zn on the card | the matching dose or correction rises |

---

## 4. Phases

Each phase ends with all tests green and a new scorecard row.

**Phase 0 — This document, the environment, an honest baseline.**
- Rebuild the engine's Python environment with `uv` (Python 3.13), adding CatBoost and
  TabPFN.
- Build the scorecard, the district-level significance test, cross-fitted blend weights
  and the metamorphic suite.
- Record the baseline.

**Phase 1 — Correctness fixes, one test each.**
- Season- and irrigation-aware fertiliser lookup.
- Latest-year yield serving; yield conformal calibrated per regime.
- The real water scenario everywhere, and the LGP asymmetry fixed.
- An explicit OOD guard.
- Per-field fallback for a partial card, with honest source labels.
- Duplicate columns dropped, a complete cache key, a 5-seed ranker, monotone constraints.

**Phase 2 — Maharashtra data through the owner's scraper.**
- **Crop statistics 1997-98 → 2014-15:** `crop_scraper.py --state MAHARASHTRA`, 26 years
  in all, ~880 district-years against today's 272. District splits (Nandurbar, Washim,
  Hingoli, Gondia, Palghar) are handled by dropping the affected pair before its split
  year, never by imputing.
- **Daily weather 1997 → 2023** for all 358 talukas: a new `weather_backfill.py` that
  reuses `weather_scraper.py`. Weather finally matches the crop years.
- **Irrigated area by district, crop and year:** a new `irrigation_scraper.py` that reuses
  the scraper's DES client.

**Phase 3 — Features.**
- Year-matched weather for the yield model, giving a per-crop "weather risk across past
  seasons".
- Leak-free weather for the ranker (normals from past years only, and the Kharif rain
  that has already fallen before Rabi sowing).
- District irrigation intensity.
- Block ablation that removes whatever doesn't help.

**Phase 4 — A taluka- and farmer-aware ranker.** The agronomic-fit features are
recomputed at serving from the farmer's own taluka, card pH and EC, fused soil profile,
irrigation and season.

**Phase 5 — Model tournament** (§5).

**Phase 6 — Soil-photo classifier, gated on the owner's dataset** (§6).

**Phase 7 — Maharashtra crop expansion** (§7).

**Phase 8 — Soil fusion, card depth, farmer-facing output.**
- Fusion enters the engine.
- The card's raw EC, micronutrient ppm, printed ranges and "unconfirmed" flags reach
  the engine.
- Each crop shows its requirements next to the taluka's values, its sowing window, its
  weather risk and a tier: grow confidently / possible / not recommended.

**Phase 9 — Verification.**
- Engine: full test suite, gate validation, model selection and the final scorecard.
- App: `tsc` and `npm run build`.
- A browser walk in Marathi and English.
- Reports refreshed, including this file's status line.

---

## 5. Model tournament — LightGBM vs CatBoost vs TabPFN v2

Every learned stage is trained three ways on identical folds, seeds and features, and the
best performer ships.

| Stage | LightGBM (today) | CatBoost | TabPFN v2 |
|:--|:--|:--|:--|
| S1 crop ranker | LambdaMART | `CatBoostRanker` (YetiRank) | pointwise grade model, ≤ 10k rows of context, bagged |
| S3 yield band p10/p50/p90 | quantile | `MultiQuantile` | native quantiles |
| S3 yield class (below/typical/above) | classifier | classifier | classifier |
| Soil-photo head (on image embeddings) | — | classifier | classifier |

The rule gate (S2) and the fertiliser lookup (S4) are not in the tournament, by design.
The fertiliser table has zero ambiguous entries, so a learned model could only add error.

**How the winner is chosen.** A challenger replaces LightGBM only if all three hold:
- It is **significantly better across the 34 districts**.
- It breaks no hard gate.
- It keeps a recommendation under 1 second.

Otherwise the simpler, faster incumbent stays. Every arm's score, fit time and latency
are published in `reports/model_selection.md`.

### Result — measured

| Ranking (forward chaining) | NDCG@5 | Δ | Holm p | Fit s | Latency s |
|:--|--:|--:|--:|--:|--:|
| lightgbm | 0.8830 | — | — | 14.5 | 0.0016 |
| **catboost** | **0.8860** | +0.0038 | 0.021 | 78.8 | 0.0039 |
| tabpfn | *failed — terminated on budget* | | | | |

| Yield (cold start, GroupKFold) | within-crop ρ | pinball p50 | 80% coverage | Fit s |
|:--|--:|--:|--:|--:|
| **lightgbm** | 0.4180 | 0.3257 | **0.7150** | 19.5 |
| catboost | 0.4690 | 0.3150 | 0.6200 | 60.3 |
| tabpfn | *abandoned — terminated on budget* | | | |

**Chosen: CatBoost ranks, LightGBM predicts yield.** Two corrections had to be made
before that table meant anything, and both changed the answer.

**The first run was not like-for-like.** LightGBM's ranker carries agronomic monotone
constraints — added in Phase 1 so a better agronomic fit can never push a crop's score
*down* — and `CatBoostRankerBackend` had none. CatBoost was competing unrestricted against
a restricted incumbent, which is exactly the sort of freedom a small margin can be bought
with. CatBoost supports `monotone_constraints` under YetiRank (verified on a 40-row fit
rather than assumed), and with both arms constrained its edge fell from **+0.0050 to
+0.0038** and its Holm p from 0.0017 to 0.021. A third of the apparent win was the missing
constraint.

**The yield rule was measuring the wrong thing.** It ranked that stage on ρ alone and so
first chose a model whose 80% interval covers **62%** against the incumbent's 71.5%.
Served coverage error is a scorecard sub-score in its own right, and the farmer is shown
that interval: a sharper point estimate bought with an interval that overstates its own
confidence is a bad trade. `decide()` now rejects a challenger that lands materially
further from the 80% target, and LightGBM keeps the stage. Adding a criterion after seeing
a result deserves scrutiny — the defence is that coverage was *already* a weighted
scorecard sub-score, so the adoption rule had been inconsistent with the scorecard rather
than tuned to this outcome.

**An honest tension, left visible.** +0.0038 clears the cluster test, but §8 of this plan
says gains ≤ 0.01 are noise at 34 districts. The two rules disagree. The cluster test is
the instrument built to separate signal from noise at this sample size, so it is taken to
outrank the eyeball heuristic — but the margin is small and costs 5.4× the fit time, and
anyone revisiting this should know it was a close call rather than a clear one.

**TabPFN could not be measured, and the reason is recorded rather than hidden.** It
deadlocked in the pool handoff — no sockets open, no weights touched, 0.94 s of CPU over
five minutes — after LightGBM and CatBoost had both passed through the identical path. The
first version of the isolation helper used a blocking `pool.apply` while the budget was
only checked *between folds*, so a child that wedged before finishing its first fold hung
the whole tournament; killing the child did not even free the parent. The budget is now
enforced by the parent (`apply_async(...).get(timeout=…)`), so a wedged arm is terminated
and published as failed.

**The result is now actually used.** `ranker.chosen_backend()` reads
`artifacts/model_selection.json` and `pipeline.train()` fits whichever family it names —
including the cross-validated scores that set the blend's alpha weights, because fitting
alphas on one family while another serves would repeat the mirage this project already
shipped once. A missing or malformed artifact falls back to the incumbent.

**TabPFN licence.** Only **TabPFN v2** is used, pinned explicitly. Its weights are under
the Prior Labs License (Apache 2.0 + attribution): commercial use is allowed, with a
"Built with TabPFN" credit if it ships. The newer TabPFN-2.5 / 2.6 / 3 weights are
non-commercial and are not used, and neither is the cloud client.

*Measured here (M2, torch 2.14, MPS available):* the v2 pin works —
`create_default_for_version(ModelVersion.V2)` returns immediately once the weights are
cached. TabPFN learns **in context**, so fitting is nearly free (0.1 s for 1,000 rows) and
the entire cost sits in prediction, where it scales with the context being attended over:
20 rows against a 1,000-row context took 4.9 s on CPU and 2.3 s on MPS, and importing the
library costs ~18 s per process. Cheap to train, expensive to serve — which is why the
tournament runs every arm under a wall-clock budget and publishes any arm it abandons,
rather than letting one model's cost quietly set the schedule.

---

## 6. The soil-photo classifier

**The owner supplied `/Volumes/dishan project/4 soils in use` on 12 September 2026**, with
the instruction to retrain on it using EfficientNet-B0 and ResNet18 and ship the better
one. The gate in §0 is therefore satisfied, and DINOv2/TabPFN heads are dropped from the
candidate list — the owner named two architectures.

### What the dataset actually is

The folder is named for four soils and holds eight class directories, but only four are
populated: the other four carry 10–13 training images against 29–30 test images, a
reversed split that marks them as leftovers. Its filenames (`IMG-2022…-WA0056.jpg`,
`photo_2022-06-01_07-08-07.jpg`) are WhatsApp and Telegram photographs, so unlike the old
web-scraped set this is **field data** — a real improvement in provenance.

It is, however, much smaller than its file count suggests:

| | count |
|:--|--:|
| files | 1,717 |
| distinct by MD5 | 816 |
| **distinct scenes** (dihedral pHash ≤ 6, unioned with filename stems) | **393** |

`Sample9.0.jpg`, `Sample9.90.jpg` and `Sample9.180.jpg` are one photograph rotated and
saved three times. **The delivered Train/test split cannot be used at all**: 324 duplicate
groups have the same image on both sides. A further 19 groups carry two different soil
labels (`images386.jpg` is filed as both Alluvial and Black) and are dropped, since
neither label can be trusted.

| class | images | scenes | maps to survey vocabulary |
|:--|--:|--:|:--|
| Alluvial soil | 267 | 91 | Alluvial |
| Red soil | 146 | 101 | Red & Yellow |
| Black Soil | 120 | 110 | Black (Regur) |
| Clay soil | 111 | 72 | *none — a texture, not a soil order* |

Two consequences to state plainly. **Laterite is a genuine Maharashtra soil** — it is what
the Konkan grows on — and this dataset has 29 images of it, which is not trainable; the
classifier is blind to it. And **Clay is a texture**, so fusion may read it as a texture
signal but must never count it as a vote for a surveyed soil type.

### Two hazards, both measured

1. **A resolution shortcut, confirmed and corrected.** Alluvial arrives at a median
   1160×522 and Black and Red at 275×190. A probe given only width, height, aspect and
   file size separates the classes at **0.494 against a 0.419 majority baseline** — a
   network would partly learn the camera rather than the soil. Corrected by normalising
   every image to one scale and randomly degrading sharpness during training.

2. **Contamination, suspected and then ruled out.** 133 of the 644 images — 20.7% — sit in
   the old model's training folds at Hamming distance 0, invisible to an MD5 check because
   they are differently compressed. The natural conclusion was that the old model's score
   on this data was inflated. **It is not:** it scores 0.949 on the 511 images it has never
   seen and 0.945 on the 133 it memorised. The hypothesis was tested and rejected, and the
   contamination is excluded from the baseline anyway.

### The bar

The old eight-class checkpoint, restricted to the four classes this data labels — a
restriction that can only help it — scores **macro-F1 0.949 on 511 unseen images**. That,
not the 0.906 in its own metadata, is what a replacement has to beat.

### Candidates

| Arm | Initialisation |
|:--|:--|
| `efficientnet_b0` | ImageNet |
| `resnet18` | ImageNet |
| `efficientnet_b0_warm` | this project's existing soil checkpoint |

The third arm exists because the gap to the baseline is **volume, not architecture**: the
old model saw 3,532 images, this data yields 393 scenes. Warm-starting carries over what
the old model learned without using the web images the data rule forbids. It is reported
as its own arm, never blended in.

### Result — measured, and the incumbent keeps its place

270 epochs, three arms, five grouped folds each, identical protocol:

| Arm | macro-F1 | accuracy | ECE | size |
|:--|--:|--:|--:|--:|
| `efficientnet_b0_warm` | **0.891** ±0.036 | 0.893 | 0.054 | 16 MB |
| `resnet18` | 0.875 ±0.023 | 0.877 | 0.057 | 44 MB |
| `efficientnet_b0` | 0.872 ±0.041 | 0.870 | 0.068 | 16 MB |

**The two architectures are a tie.** 0.872 against 0.875 is well inside either standard
deviation, and ResNet18 costs 44 MB to B0's 16 MB in a checkpoint that loads inside a web
request. What added skill was the warm start, +0.019 over cold B0 — consistent with the
gap being data volume rather than architecture.

**The comparison that decides it** (`ML/compare_soil_models.py`). A cross-validated 0.891
and an evaluation 0.949 are not comparable: each CV fold trains on ~314 scenes, while the
incumbent was *fitted* on 3,532 images and is only being scored here. Setting them side
by side would flatter the incumbent for having had more data. So both are measured on the
same 511 photographs — the ones the old model never saw, where the new model's prediction
is its held-out out-of-fold one:

| On 511 images the old model has never seen | macro-F1 |
|:--|--:|
| old | **0.949** |
| new (`efficientnet_b0_warm`) | 0.924 |
| difference | **−0.025** |

McNemar over the paired outcomes: 22 images the old model gets right and the new one
misses, 10 the reverse, p = 0.0501.

**Verdict: the old model keeps serving.** A tie goes to the model already shipped, and
this is not a tie — it is a loss. The honest reading is that the new model is a good model
trained on too little: on equal footing it reaches 0.924 against its own 0.891 CV figure,
closing more than half the apparent gap, on 393 scenes against 3,532 images.

Three routes to actually beating it, none taken without the owner's say-so: train on both
datasets together (a data-rule decision, since the older half is web-scraped); collect
more field photographs, which is what the 91-scene Alluvial and 72-scene Clay classes
really need; or accept the incumbent and spend the effort elsewhere.

**Ship the winner, calibrated** — when one wins. Temperature is fitted on out-of-fold
logits, the pooled confusion matrix is saved for fusion, and per-image out-of-fold
predictions are written so any future challenger is judged the same way. Promotion means
copying the winner's files into `ML/models/`, which is where both the backend and
`config.F_SOIL_MODEL_META` look; nothing is promoted by training alone.

### How the photo changes the answer — built

`src/rules/soil_fusion.py`. Until now the photograph changed nothing, and the engine said
so in as many words: `_surveyed_soil` was "deliberately description, not signal … it
changes no score". The farmer saw the classifier's answer printed beside the survey's and
had to reconcile them. It is now an input.

**The survey is the prior, the photograph is the evidence.** The prior comes from the
survey's own area shares — `share_pct` for the primary type, the remainder to the
secondary — so a 55/45 taluka is easy for a photograph to move and a 95/5 one is not,
which is the survey stating its own confidence. The likelihood is the classifier's
**pooled out-of-fold confusion matrix**, what it actually does on held-out photographs
rather than what its softmax claims, shrunk 50% toward uniform so a small-sample zero
cannot act as a certainty.

Four limits, each for a reason:

- **It picks only between soil types the survey records for that taluka.** A confident
  photograph of something unsurveyed is a reason to doubt the photograph, not to redraw
  the map.
- **It moves only texture and available water.** Depth, drainage and salinity keep the
  surveyed value, so a photograph can add a constraint and can never lift a veto.
- **It acts only at ≥ 0.80 confidence on an in-distribution image.**
- **Clay casts no vote.** It is a texture, not a soil order, and no survey type
  corresponds to it.

Where the classifier has no class for a surveyed soil, fusion **abstains** rather than
choosing among classes it cannot recognise.

That rule turns out to matter for which model ships. The owner's data supports four
classes and **not laterite**, at 29 images — so a classifier trained on it alone would
make fusion abstain across the whole Konkan, where laterite *is* the soil. The shipped
eight-class model does carry a laterite class, so fusion can currently judge
**Alluvial, Black (Regur), Laterite and Red & Yellow**. This is a second and independent
reason the incumbent keeps its place, separate from the 0.949-vs-0.924 result: replacing
it would have cost the engine a soil type as well as accuracy.

Fusion matches classes on a normalised key (`Black Soil`, `black` and `Black_Soil` are one
thing) and reads either `confusion_pooled` or the older `confusion_best_fold`, so it works
against whichever classifier is installed. Matching literally would have been the worst
possible failure: the photograph would have quietly stopped mattering, with nothing to
say so.

**M5 is now a real test, not a placeholder.** It was recorded as "not applicable: the
engine takes no soil photograph yet". It now runs every class at 0.99 confidence against
every sampled taluka and asserts the set of crops vetoed on a *hard* factor
(`depth, drainage, pH, salinity, season, temp`) is identical with and without the
photograph. `input_effects` likewise measures the photo instead of declaring it
ineffective by signature inspection.

**Wired end to end:** `/api/soil` returns the full probability vector (not the ranked
three — a 0.45/0.44 split and a 0.45/0.05 one are different facts and identical after
truncation) → `RecommendRequest.soil_photo` → the engine's `RecommendIn` →
`pipeline.recommend(soil_photo=…)` → `fuse()` → `apply_to_features()` → the gate and
ranker → back to the farmer as `context.soil_fusion`, carrying prior, posterior and the
reason it did or did not act. 19 fusion tests; `tsc --noEmit` clean.

---

## 7. Maharashtra crop coverage

- **Tier A — learned.** The 19 crops with eight years of district statistics, plus any
  crop the 1997–2014 statistics give ≥ 5 years × ≥ 5 districts of labels.
- **Tier B — labelled, newly enveloped.**
  - Niger, castor, small millets.
  - Small millets use the barnyard-millet recipe, labelled as a proxy.
  - Castor and niger say "no government recipe".
- **Tier C — rules-only horticulture, vegetables and fruit.**
  - Every crop with a clean Maharashtra recipe in ≥ 5 districts (tomato, chilli, brinjal,
    onion, okra, turmeric, cabbage, ginger, …), plus the state's major fruit crops.
  - Shown in a separate list, marked rules-based.
  - Fruit trees get their per-plant dose schedule, which is discarded today.
  - They must pass a regional face-validity test: grapes in Nashik/Sangli, pomegranate in
    Solapur, orange in Nagpur/Amravati, banana in Jalgaon, mango and cashew in the
    Konkan, onion in Nashik/Ahilyanagar, turmeric in Sangli/Hingoli.

---

## 8. Known limits

- **The soil-photo score is only as good as the owner's dataset.** Without a separate set
  of field photographs it is a cross-validation estimate. Fusion will rarely change a
  taluka's soil type (the survey's dominant type covers 81% on average).
- **Tier C crops are rules-only.** There are no yield statistics behind them.
- **Irrigation is district-level** DES data, not farm-level.
- **Weather is reanalysis** at about 0.5°, so neighbouring talukas can share a grid cell.
- **Small gains are inside the noise.** With 34 districts, an improvement of ≤ 0.01 can't
  be distinguished from chance.

---

## Appendix A — the superseded August 2026 plan (condensed)

The August plan wired three models: an EfficientNet-B0 soil-photo classifier, an XGBoost
crop recommender over N, P, K, temperature, humidity, pH and rainfall, and an XGBoost
fertiliser recommender. Its findings still matter, because each one is a trap the new
work must not fall back into.

**A.1 — Half the original soil dataset was duplicated, across the split.**
- `4 soils in use/` held 1,717 files but only 818 unique images.
- 882 files were byte-identical copies present in both Train and test.
- For cinder, laterite and peat, *every* training image was also a test image.

The fix was de-duplication, pooling, stratified 5-fold CV and augmentation inside
training folds only. It raised a new problem: rotated Roboflow copies defeat a hash that
isn't rotation-invariant. That is why §6 groups rotations and asks for the owner's own
data.

**A.2 — The crop model's soil input was random numbers.** In
`ML/dishanminiproject_updated.ipynb` the soil column was
`np.random.randint(0, 4)`. The model was retrained on the seven real features, and a
soil → crop suitability table was added. The crop model scored 99% on a well-known,
easily separable dataset that says nothing about a Maharashtra field.

**A.3 — The fertiliser model barely beat chance.** 19.7% accuracy against a 14.3% random
baseline on 750,000 rows. That is a property of the dataset. Ranking by the card's
measured deficits replaced it.

**Why the August plan was superseded:**
- The Regur engine ranks crops from Maharashtra's own eight (soon 26) years of district
  statistics, taluka soil and weather, and doses fertiliser from the state's exact
  government table.
- The XGBoost crop and fertiliser models are retired and are not called.
- The soil-photo classifier stays as a capability, to be retrained under §6 on the
  owner's data.
