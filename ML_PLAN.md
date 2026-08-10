# Wiring the three models in

Soil classification from a photograph, crop recommendation and fertilizer recommendation from the
card readings — ending in a prediction page that shows the predicted soil, crops and fertilizers
and nothing else.

Before any of that, three things I found while reading the data. Each one changes what the work
should be, and the first two mean that numbers currently reported by the notebooks do not measure
what they appear to measure.

---

## 1. What I found

### 1a. Over half the soil dataset is duplicated, and the duplicates span the split

`4 soils in use/` holds **1717 image files but only 818 unique images**. 899 files are copies.

Worse than the waste: **882 files are byte-identical (same MD5) and present in *both* `Train` and
`test`.**

| class | files | unique | exact duplicates across Train/test |
| --- | ---: | ---: | ---: |
| Alluvial soil | 576 | 293 | 116 |
| Black Soil | 344 | 122 | 278 |
| Cinder Soil | 40 | 30 | **20 — all 10 train images are also in test** |
| Clay soil | 262 | 119 | 149 |
| Laterite Soil | 40 | 29 | **20 — all 10 train images are also in test** |
| Peat Soil | 40 | 30 | **20 — all 10 train images are also in test** |
| Red soil | 373 | 167 | 252 |
| Yellow Soil | 42 | 28 | 27 |

For Cinder, Laterite and Peat, *every single training image also appears in the test set*. The
model is tested on pictures it memorised. Any accuracy figure measured on this split is not a
measure of the model — it is a measure of how well it remembers, and it will be near-perfect and
worth nothing. The four new classes are exactly the ones where this is total.

**Nothing else in this plan matters until this is fixed.** De-duplicate first, split second.

### 1b. The soil type fed to the crop model is random numbers

`ML/dishanminiproject_updated.ipynb`, cell 35:

```python
np.random.seed(42)
df['soil_type'] = np.random.randint(0, 4, size=len(df))
```

The crop model's 11 features are 7 real agronomic ones (N, P, K, temperature, humidity, ph,
rainfall) plus **4 one-hot columns of pure noise**. The soil classifier's output has never been
able to influence the crop recommendation, because there was no relationship in the training data
to learn. Expanding those columns from 4 to 8 would expand noise to more noise.

This is the "soil image → crop" story the product tells, and today it is decorative. §4 is about
making it real.

### 1c. The real imbalance is 10:1, not 52:1 — and the rare classes have ~30 images, not 10

After de-duplication the picture is much less dire than the raw folder counts suggest:

| class | unique | 80/20 stratified |
| --- | ---: | --- |
| Alluvial | 293 | 234 train / 59 val |
| Red | 167 | 134 / 33 |
| Black | 122 | 98 / 24 |
| Clay | 119 | 95 / 24 |
| Cinder | 30 | 24 / 6 |
| Peat | 30 | 24 / 6 |
| Laterite | 29 | 23 / 6 |
| Yellow | 28 | 22 / 6 |

Pooling `Train` and `test` and re-splitting recovers roughly **three times** the training data for
the four rare classes — for free, before a single augmented image is generated.

### 1d. Everything else is already trained and on disk

`/Volumes/dishan project/agrosense old version/` contains every artifact `backend/_unwired/prediction.py`
expects: `soil_classes.pkl` (4 classes), `crop_recommendation_xgb_model.pkl` (11 features, 22
crops), `fertilizer_xgb_model.pkl` (10 features, 7 fertilizers), `scaler.pkl`,
`label_encoder.pkl`, `categorical_encoders.pkl`, `target_label_encoder.pkl`, plus
`custom_cnn_model.pth`, `resnet18_model.pth`, `efficientnet_b0_model.pth` and `vit_model.pth`.

What that means per model:

| model | status |
| --- | --- |
| **Soil (image)** | Must be **retrained** — 4 classes → 8. |
| **Crop (tabular)** | Must be **retrained**, but to *remove* the noise columns (§4), not to widen them. |
| **Fertilizer (tabular)** | **Retrained** once the data arrived at `data set of the project/fertilizer data/`. It reaches only 19.7% accuracy against a 14.3% baseline — a property of the dataset, confirmed by the old model scoring 18.8% on the same split. It no longer ranks the recommendation; the card's measured deficits do. See `ML_RESULTS.md`. |

`vit_model.pth` is **343 MB**. It is not a candidate for serving.

---

## 2. Fixing the dataset

A new script, `ml/prepare_soil_dataset.py`, producing `ml/data/soil/` from `4 soils in use/`.

**Step 1 — de-duplicate.** Hash every file (MD5 for exact, then a perceptual hash for
near-duplicates such as re-encodes and resizes). Keep one representative per group. 1717 → ~818.

**Step 2 — pool and re-split.** Discard the existing Train/test boundary entirely; it is not
recoverable. Stratified split of the unique pool.

**Use stratified 5-fold cross-validation, not a single split.** With 28–30 unique images in the
rare classes, a single 80/20 split leaves 6 validation images, where one image is worth 16.7
points of recall. Any per-class number from that is noise. 5-fold puts every one of the 29
Laterite images in validation exactly once and reports mean ± std. It is the difference between a
number and a guess.

**Step 3 — balance by augmentation, into the training folds only.**

This is what you asked for, and it works — with one condition that has to be stated because
getting it wrong is the most common way this exact task goes wrong:

> **Augment after splitting, never before.** If images are generated first and split afterwards, a
> flipped copy of a training photo lands in validation, and you have rebuilt §1a by hand. The
> generator runs inside each fold, on that fold's training images only.

Offline augmentation to bring every class up to the majority count (~234 in the training fold),
saved to disk so training runs are reproducible:

- flips, ±25° rotation, random resized crop (0.7–1.0)
- colour jitter — brightness/contrast/saturation/hue
- slight blur, Gaussian noise, JPEG-quality degradation
- perspective warp

The jitter and noise matter more than the geometry here: a soil photo differs mostly by lighting
and camera, not by orientation.

**And the honest limit of this.** Augmenting 23 Laterite images to 234 does not produce 234
independent samples. It produces 234 correlated variations of 23 photographs, and the model can
still learn *those 23 scenes* — their backgrounds, their shadows, the particular camera. Balanced
counts fix the loss function's bias; they do not manufacture diversity. Expect Laterite/Cinder/
Peat/Yellow to score well in cross-validation and to be the classes that fail on a farmer's phone.

That is why augmentation is paired with the two things that actually address small-sample classes:

- **Class-weighted loss + `WeightedRandomSampler`**, which correct the imbalance without inventing
  data, and
- **transfer learning** (§3), where a pretrained backbone already knows edges and textures and only
  the head needs to learn from 23 examples.

The genuine fix is more real photographs of those four soils. Nothing in software substitutes for
it, and the plan should not pretend otherwise.

---

## 3. Soil classifier: training and improvement

`ml/train_soil.py`, writing to `backend/models/`.

**Backbone.** Fine-tune **EfficientNet-B0** (~16 MB) as the shipping model, with ResNet18 (~45 MB)
trained alongside as a comparison. ViT is dropped from serving on size (343 MB) — it can stay in
the notebook as a reported baseline. `CustomCNN` trained from scratch is kept only as the "no
transfer learning" control, because it is the honest way to show what transfer learning buys.

**Techniques, in the order they earn their place:**

1. **Staged fine-tuning** — freeze the backbone, train the head to convergence, then unfreeze the
   last blocks with **discriminative learning rates** (head 1e-3, backbone 1e-5). With 23 images in
   a class, fine-tuning everything from the start destroys the pretrained features.
2. **AdamW + cosine schedule with warmup**, replacing the notebook's flat `Adam(lr=1e-4)`.
3. **Class-weighted cross-entropy with label smoothing (0.05–0.1)** — smoothing is worth more than
   usual here because a duplicated, web-scraped dataset certainly contains mislabelled images.
4. **Mixup / CutMix**, which are unusually effective at this data scale.
5. **Early stopping on macro-F1, not accuracy.** Accuracy is dominated by Alluvial (36% of the
   data) and a model that never predicts Cinder still scores well. Macro-F1 is the metric that
   notices.
6. **Test-time augmentation** at inference — average the logits over the image and its flip.
7. **EMA of weights**, cheap and reliably worth a point or two on small data.
8. **Hyperparameter search** (Optuna, ~30 trials) over LR, weight decay, dropout, mixup α and
   unfreeze depth — scored on cross-validated macro-F1.

**Reporting.** Per-class precision/recall/F1, a confusion matrix, and macro-F1 mean ± std across
the 5 folds. A single accuracy number for this dataset is not a result. The confusion matrix is
also how we will find out whether Cinder and Laterite are separable at all — visually they may
not be, and if the matrix says so, the product should say so too rather than guess between them.

**Calibration.** The UI shows a confidence percentage. A softmax over 8 classes trained on
augmented, imbalanced data is overconfident by construction. Fit **temperature scaling** on the
validation fold so "91%" means something closer to nine times in ten. Cheap, one parameter.

---

## 4. Making the soil prediction actually affect the crop recommendation

Given §1b, there are three options and the first is not acceptable:

- ~~Keep the noise columns and widen them to 8.~~ Preserves the appearance of a soil-aware model
  and none of the substance.
- **Retrain the crop model on the 7 real features only.** Identical accuracy — the discarded
  columns were noise — and it stops the code implying a relationship that does not exist.
- **Add a soil→crop suitability layer that is explicitly a rule table, not a model.** Each of the 8
  soils gets a documented list of well-suited and poorly-suited crops from agronomic sources, used
  to re-rank the crop model's ranked output and to explain the ranking in the UI.

**Recommendation: do both of the latter two.** The crop model does what it is good at — reading
NPK, pH and weather — and the soil type re-ranks the result through a table a person can read,
check and correct. The soil prediction then genuinely changes what the farmer is shown, and the
mechanism is inspectable rather than laundered through 4 columns of random integers.

I checked whether a real soil-aware crop dataset was available instead:
`Crop Recommendation using Soil Properties and Weather Prediction.csv` (3867 rows) has a genuine
`Soilcolor` column, but it is free text — `Reddish broown`, `Redishbrown`,
`replacement of inaccessible target red;luvisols` — describing colour rather than soil class, and
it does not map cleanly onto the eight. Not a basis for a trained relationship.

**Fertilizer** needs no retraining. It takes its own 5-category soil vocabulary, so the work is
extending `SOIL_TO_FERTILIZER_SOIL` in `_unwired/prediction.py` to cover Cinder, Laterite, Peat and
Yellow, with the choice for each documented.

---

## 5. Serving

Un-quarantine `_unwired/prediction.py` into `backend/models.py`, trimmed to what runs here: no S3,
no DynamoDB, no torch download-from-bucket. Artifacts load from `backend/models/` (gitignored —
they are 60 MB+; `ml/train_soil.py` regenerates them, and a `make models` target fetches the
pretrained tabular ones from `agrosense old version/`).

```
POST /api/predict          (Next route handler → FastAPI)
  in:  { documentId, soilImage? }
  out: { soil: {key, confidence, alternatives[]},
         crops: [{key, score, why}],
         fertilizers: [{key, verdict, why}] }
```

The card's twelve readings supply N, P, K and pH; `src/data/weather.ts` already fetches real
temperature, humidity and rainfall. Requests without a soil photo still work — soil re-ranking is
skipped and the response says so.

New dependency: `torch` + `torchvision` (CPU) in `backend/requirements.txt`, roughly 200 MB
installed. Worth confirming that is acceptable before step 4 of the sequence.

---

## 6. Frontend

**Prediction page shows only predicted soil, crops and fertilizers.** It already has that shape —
`SoilWidget`, then the crops deck, then the fertilizers deck. The changes are:

**Shrink `SoilWidget` to match the decks.** Today it is a full-width panel: an arc gauge, retention
and pH chips, a three-row "alternatives considered" bar chart, and a large photographic strip —
several screens' worth of weight for one word of output, directly above two compact card
carousels. It becomes one card in the same language as `CropPallet`: the photograph, the soil
name, the confidence percentage, and the runner-up on the back or in a caption. The arc gauge and
the alternatives list move to the soil detail page (`/prediction/soil/[key]`), which is where
someone who wants that detail is already going.

**Replace the fixtures with the API response.** `PREDICTED_SOIL` / `PREDICTED_CROPS` /
`PREDICTED_FERTILIZERS` in `src/data/prediction.ts` become the fallback shape, fed from
`/api/predict` through the existing `CardProvider` (extended to carry a prediction alongside the
card).

**The sample-prediction notice** at the top of the section follows the same rule as the card
notice: it is not deleted when the models land, it is replaced by provenance — which soil model,
what confidence, and whether a soil photo was supplied at all.

**"sandy"** is in `SOILS` (9 soils) but has no training images, so the classifier can never return
it. Either drop it from the UI or mark it as not-predictable; leaving a card the model cannot
produce is a quiet lie.

---

## 7. Sequence

1. **Dataset repair** — `prepare_soil_dataset.py`: dedup, pooled stratified 5-fold, balanced
   augmentation inside training folds. Report the counts. *(Nothing downstream is trustworthy
   before this.)*
2. **Train the soil classifier** — EfficientNet-B0 + ResNet18 + CustomCNN control, cross-validated,
   macro-F1 and confusion matrix, temperature scaling. Write `soil_classes.pkl` (8) and the
   chosen `.pth`.
3. **Crop model** — retrain on the 7 real features; build and document the soil→crop suitability
   table.
4. **Serving** — `backend/models.py`, `/api/predict`, extend the fertilizer soil mapping.
5. **Frontend** — shrink `SoilWidget`, wire the section to the API, move detail to the detail page,
   resolve `sandy`.
6. **Report** — a short `ML_RESULTS.md` with the cross-validated numbers, including the ones that
   are bad.

Steps 1–2 are the substance. Step 3 is where the honesty question sits.

---

## 8. Risks

- **The rare classes will not generalise well**, whatever cross-validation says. 23 training
  photographs of Laterite, augmented, still describe 23 scenes. The mitigation is honest
  confidence in the UI, showing the runner-up, and collecting real photographs.
- **Cinder and Laterite may not be visually separable** at this resolution. The confusion matrix
  will say. If they are not, merging or declining to choose beats a confident coin-flip.
- **Web-scraped labels are wrong sometimes.** Label smoothing helps; a quick manual review of the
  ~118 rare-class images is cheap and would help more.
- **torch on the server** adds ~200 MB and a few seconds of cold start. If that is unacceptable,
  the alternative is exporting to ONNX (~16 MB, no torch at runtime), which is more work but a
  better end state.
- **No held-out test set after §2.** Cross-validation is the right call at this size, but it means
  every number is a validation number. Real field photographs, collected later and never trained
  on, are the only true test.
