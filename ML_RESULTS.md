# What the models actually score

Measured 2026-08-08, on the de-duplicated dataset rebuilt by
`ml/prepare_soil_dataset.py`. Every number here is lower than the notebooks
reported, and every one of them means something the old numbers did not — see
§1 of `ML_PLAN.md` for why the previous split could not measure anything.

---

## Soil classifier — EfficientNet-B0, 8 classes

Stratified 5-fold cross-validation over 769 unique images. Validation folds are
real images only: never augmented, never balanced.

```
macro-F1   0.777  ± 0.033
accuracy   0.841  ± 0.022
```

**Macro-F1 is the headline, not accuracy.** Alluvial is a third of the data, so
a model that never once predicted Cinder would still post a decent accuracy.

### Per-class recall (mean ± std over 5 folds)

| soil | recall | val images / fold |
| --- | ---: | ---: |
| clay | 0.966 ± 0.042 | 23 |
| yellow | 0.900 ± 0.133 | 5 |
| black | 0.892 ± 0.073 | 24 |
| alluvial | 0.822 ± 0.035 | 50 |
| red | 0.809 ± 0.090 | 32 |
| cinder | 0.800 ± 0.125 | 6 |
| peat | 0.733 ± 0.082 | 6 |
| **laterite** | **0.567 ± 0.103** | 5 |

Read the standard deviations next to the sample sizes. Yellow's ±0.133 on five
validation images means one image either way moves it 20 points — that number
is a range, not a measurement, and it should not be quoted as "90% on yellow
soil".

### Confusion matrix (best fold, rows = truth)

```
              allu black cind clay late peat  red yell
alluvial  →     41    2    0    6    0    0    1    1
black     →      0   23    0    1    0    0    0    0
cinder    →      0    1    4    0    1    0    0    0
clay      →      0    0    0   22    0    1    1    0
laterite  →      0    0    1    0    4    1    0    0
peat      →      0    1    0    0    0    5    0    0
red       →      0    0    0    0    3    0   30    0
yellow    →      0    0    0    0    0    0    0    6
```

Two things worth acting on:

- **Laterite is the weak class**, and it is confused with cinder and peat. It
  also has the fewest unique images (28). More photographs of laterite is the
  single highest-value thing anyone could add to this dataset.
- **Red → laterite (3 cases)** is the most common cross-class error, which is
  agronomically unsurprising — laterite is a weathered, iron-rich relative of
  red soil, and at 224px they can look alike.

### Calibration

Temperature scaling fitted on the shipped fold's validation set: **T = 0.641**.
Applied at inference, so the confidence the UI prints is closer to a real
frequency than a raw softmax would be.

Shipped: the best fold, `ML/models/soil_efficientnet_b0.pth`, 16 MB.

---

## Crop recommender — XGBoost, 22 crops

```
5-fold accuracy   0.9927 ± 0.0039
5-fold macro-F1   0.9927 ± 0.0039
hold-out accuracy 0.9932
```

Trained on the **seven real features** — N, P, K, temperature, humidity, ph,
rainfall — after removing the four one-hot soil columns the previous model
carried. Those columns were `np.random.randint(0, 4)`; accuracy is unchanged
without them, which is the proof they never carried signal.

This dataset is famously easy and 99% should be read with that in mind: the 22
crops occupy well-separated regions of NPK/climate space. It is not evidence
that the recommendation is right for a particular field.

Soil type reaches the ranking through `backend/soil_crop_suitability.py`, a
documented table rather than a learned relationship. On the test card
(laterite, pH 8.12) it moves coffee to the top and pushes grapes down —
visible in the response as `soil_fit: "favoured"` / `"discouraged"`.

---

## Fertilizer recommender — XGBoost, 7 products

Retrained on the real data (`data set of the project/fertilizer data/train.csv`,
750,000 rows) now that it is on the machine.

```
hold-out accuracy        0.1966      (random baseline for 7 classes: 0.1429)
hold-out macro-F1        0.1912
hold-out top-3 accuracy  0.5199      (random baseline: 0.4286)
```

**This model is close to worthless on its own, and that is a property of the
dataset, not of the training.** The previously shipped model — trained
elsewhere, by a different pipeline — scores **0.1883 / 0.5057** on the same
split, marginally worse. Kaggle's own leaderboard for `playground-series-s5e6`
tops out around 0.38 MAP@3. The features do not determine the label.

### What the product does about it

A near-random ranking must not decide which sack somebody buys, so it no longer
does. `backend/models.py::predict_fertilizers` ranks by **what the farmer's own
card measured as missing**, and uses the model only to break ties between bags
that meet the same need equally:

- a bag scores for supplying a nutrient the card reads **below** its range,
- and is penalised for supplying one already **above** it,
- `verdict: "hold"` when its dominant nutrient is high, or when it supplies
  nothing the card asked for.

On the test card (N low, K high, P normal) that produces:

| bag | nutrient match | model says | verdict |
| --- | ---: | ---: | --- |
| Urea (46-0-0) | 46.0% | 8.3% | apply |
| 28-28 | 28.0% | 20.1% | apply |
| 20-20 | 20.0% | 16.7% | apply |
| DAP (18-46-0) | 18.0% | 8.4% | apply |
| 14-35-14 | 0.0% | 17.4% | **hold** |
| 17-17-17 | 0.0% | 15.0% | **hold** |
| 10-26-26 | 0.0% | 14.1% | **hold** |

The model, left to itself, ranked `14-35-14` third and would have recommended
buying it — potassium into a soil the card says already has too much. The
`confidence` field returned to the UI is the nutrient match, not the model's
softmax: a percentage taken from a 19.7%-accurate classifier and printed next
to a purchase would be a lie with a decimal point on it. The raw figure is
still returned as `model_probability` for anyone who wants it.

## End to end

Real card + a laterite photograph, through `/api/predict`:

```
soil     laterite 86.1%   (alternatives: red 5.5%, black 4.6%)
crops    coffee 87.7% (favoured) · cotton 4.7% · watermelon 4.2%
         · banana 2.3% · grapes 2.0% (discouraged)
fert     28-28 · DAP · 14-35-14
```

---

## What these numbers do not tell you

- **There is no held-out test set.** Cross-validation is the right call at 769
  images, but every figure above is a validation figure. Field photographs
  collected later and never trained on are the only real test.
- **Augmentation balanced the classes; it did not add diversity.** Laterite's
  23 training images became 203 through flips, crops and jitter — 203
  correlated views of 23 scenes. The model can still be learning those
  backgrounds, and 0.567 recall suggests it partly is.
- **The rare-class numbers rest on 5–6 validation images each.** Treat them as
  directional.
- **`sandy` is in the UI's soil list but not in the dataset**, so the
  classifier can never return it.

## Reproducing

```bash
python ml/prepare_soil_dataset.py --folds 5     # ~2 min
python ml/train_soil.py --folds 5 --epochs 14   # ~32 min on an M-series GPU
python ml/train_crop.py                         # ~20 s
python ml/train_fertilizer.py                   # ~50 s
```

All four write to **`ML/models/`**, which the FastAPI service loads at request
time. The directory is gitignored — the artifacts total ~30 MB and are
reproducible from the commands above.
