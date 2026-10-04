# Integrating the Regur engine into AgroSense

> **Status: live, partly built — 12 September 2026.** §3.4 ("the soil image has nowhere to go")
> is **closed**: the photograph is now fused with the taluka soil survey and can change which
> crops are ranked. Phase 5's conclusion that the photo is "a check, not an input" is superseded
> by that work, and is marked as such in place. Sections not marked otherwise describe intent
> rather than shipped state — check the code before relying on one. Engine-side plan:
> [ML_PLAN.md](ML_PLAN.md).

Replacing the current crop/fertilizer prediction path with the five-stage
recommendation engine in `ml engine for Recommendation/`.

Everything in §1 was **measured on this machine**, not inferred. Every claim
that drives a decision below carries the command or the file that settles it.

---

## Progress

**Phase 1 — done.** Engine runs as a first-class service.

- `.venv` rebuilt on Python 3.13.3 (it was pointing at a python.org 3.14
  framework that is no longer installed). Console-script shebangs and
  `pyvenv.cfg` rewritten so the venv is self-consistent at its final path.
  The old one is kept at `.venv-old` (1.0 GB) — **safe to delete.**
- `src/serve/api.py`: deprecated `@app.on_event("startup")` replaced with a
  `lifespan` handler that warms `load_pipeline()` **and**
  `build_feature_store()`. Startup is now ~28 s and the first farmer's request
  is served at the same speed as the thousandth, instead of paying 4.6 s.
- `src/serve/api.py`: `X-AgroSense-Key` middleware added, mirroring
  `backend/app.py`, with `/health` left open for the host's check.
- `.env`: `RECOMMEND_API_BASE=http://127.0.0.1:8001` added — it was missing
  entirely; `recommendApi.ts` was running on its hardcoded fallback.
- `package.json`: `recommend`, `recommend:install`, `recommend:test`.
  Deliberately **no `--reload`** on `recommend`, unlike `api`: with the feature
  store warming at startup, reload would re-pay ~28 s on every file touch.
- Verified: 185/185 engine tests pass, including the serving-layer tests.

**Phase 2 — done.** Vocabularies reconciled.

- `src/data/cropOntology.ts` — new. Maps all 19 engine crop strings and all 4
  fertiliser products onto site keys; `RECOMMENDABLE_CROP_KEYS` separates what
  the engine ranks from what the site merely has a page about.
- `crops.ts` — 12 crops added (22 → 34), new `oilseed` category. Marathi
  hand-written here and authoritative.
- `fertilizers.ts` — `mop` and `ssp` added (7 → 9), new `k` nutrient bias.
  The five complex grades are marked catalogue-only.
- `assets.ts` — image slots reserved for all 12 crops + 2 fertilisers as
  commented lines; drop the file in, uncomment the line.
- `backend/agents/topics.py` — synced to 34 crops / 9 fertilisers.
- `scripts/check-ontology.mjs` — new build gate, wired into `npm run build`.
  Fails if the engine can name a crop the site cannot. Verified it fails on a
  deliberate typo.
- Verified end-to-end against the live engine across 10 talukas spanning the
  state: **all 19 crops returned, 0 unmapped; products DAP/MOP/Urea, 0
  unmapped.** `npm run build` passes — 34 crop routes, 9 fertiliser routes.

**Phase 3 — done.** The input step is mounted and wired.

- `LocationSeason.tsx`: the §3.5 casing bug fixed. District and taluka are now
  stored in the engine's own casing (they are join keys) and `titleCase()` is
  applied at render only. **Proved against the live payload: picking SOLAPUR
  now lists 11 talukas; the old title-cased value listed 0.**
- `cardState.tsx`: `recommendation` added alongside `prediction`, with the
  same invalidation discipline — a new card clears it, because a dose plan
  interpolated to the old card's nitrogen is advice about a different field.
- `CardUpload.tsx`: `<LocationSeason>` mounted, and deliberately **outside**
  the `result &&` guard the other steps sit behind — the location-only "what
  could I grow here" path needs no card. Submit posts to `/api/recommend` and
  stores the result; failures surface as a sentence in the farmer's language.
- `middleware.ts`: `/api/recommend/meta` made public. It is read-only,
  identical for every visitor, costs no paid API call and carries nobody's
  document — the same three reasons `/api/insights` is public, and it is
  fetched client-side on mount before anyone has been asked to sign in.
  `POST /api/recommend` stays protected.

**Open question for the owner — should `POST /api/recommend` be public?**
Left protected, which is the safe default this file intends ("the failure mode
of forgetting to update this file is a locked door rather than an open one").
But the argument for opening it is real and is the middleware's own: gating is
reserved for "the two things that cost real money and the one thing that is
somebody's personal document", and a recommendation is none of those — it
starts no agent run, touches no stored document, and costs 0.13 s of our own
CPU. Against: it accepts the farmer's card readings in its body, and an open
compute endpoint invites abuse. Today a signed-out visitor who picks a taluka
gets "your session has expired", which is a poor answer to a question the
engine could have answered. **One line in `isPublic` either way.**

**Verified for Phase 3:** `npx tsc --noEmit` clean; `npm run build` passes;
the step server-renders on `/` ("शेत कुठे आहे, कधी पेरणार"); `/api/recommend/meta`
returns 34 districts / 351 talukas / 351 atlas points while signed out; the
protected POST returns the bilingual 401 in exactly the `RecommendErrorBody`
shape the handler reads, so it surfaces as a sentence rather than silence.

**Browser interaction: verified later, in Phase 7.** It could not be driven at
the time — see problem 1 below — so the dropdown was first proved against the
live payload in Node. It has since been clicked in a real browser, in both
languages, and the fix holds.

### Two environment problems found on the way (neither caused by this work)

1. **Next's dev server 403s assets after Clerk's handshake.** On a first visit
   with no Clerk dev-browser cookie, Clerk redirects through
   `<instance>.clerk.accounts.dev` and back; Chromium then attaches that
   `Origin` to the returned page's module scripts and `next dev` refuses them
   with a bodiless 403. Seven chunks died — `@clerk/nextjs` and this app's own
   `src/lib` among them — so **React never hydrated and every client component
   on the page was inert**: no theme toggle, no language switch, no taluka
   list. The HTML looks perfect, because the server render is perfect.

   ```
   curl -o /dev/null -w '%{http_code}' \
     -H 'Origin: https://<instance>.clerk.accounts.dev' \
     http://127.0.0.1:3000/_next/static/chunks/<any>.js     # 403
   #  ... the same URL with no Origin header:                  200
   ```

   Fixed with `allowedDevOrigins` in `next.config.ts` — **but only with the
   exact hostname.** `"*.clerk.accounts.dev"` is not honoured, which is why
   the first attempt appeared to change nothing. That makes the line
   instance-specific: a teammate with their own Clerk instance hits the same
   dead page. Dev-only; production has no handshake redirect.

2. **The theme script's CSP hash is unquoted, so the browser ignores it.**
   The generated header carries
   `script-src ... 'nonce-…' sha256-N2i2UlUnI7us…` — every other source is
   quoted and the hash is not, so Chromium reports *"contains an invalid
   source: 'sha256-…'. It will be ignored."* A CSP hash-source must be
   `'sha256-…'`, quotes included.

   `THEME_INIT_SCRIPT_HASH` is stored bare and passed straight into the
   `script-src` array in `middleware.ts`. `check-csp-hash.mjs` cannot catch
   this: it validates that the *digest* matches the script, which it does —
   the defect is the quoting at the point of use, one level up.

   The consequence is exactly the one that script exists to prevent: the
   pre-paint theme initialiser is blocked, so **anyone who chose dark mode
   gets a white flash on every page load**. Untouched — it is a real bug but
   it belongs to the theme system, not this integration.

**Phase 4 — done.** The results surface is built and seen.

New, under `src/components/site/recommend/`:

| File | What it draws |
|:--|:--|
| `RecommendationBoard.tsx` | Five crops in a row, one open below; the header line; the three qualifying panels |
| `CropCard.tsx` | One crop — image slot, rank, suitability class, category, `decided_by` |
| `CropDetailPanel.tsx` | The open crop: reason, staves, yield band, dose plan, N schedule |
| `LiebigStaves.tsx` | The signature chart — eight staves, water to the shortest, that one in `anar` |
| `RecommendAside.tsx` | Micronutrients, vetoed + not-assessable, confidence/abstention, the audit trail |

`Prediction.tsx` now swaps its crop and fertilizer decks for the board when a
recommendation exists — not alongside, since that would be two answers to one
question. The soil card above stays: that is the photograph classifier, which
the engine has no equivalent for.

**Verified by rendering it, not by reading it.** A throwaway route rendered the
board from the live payload in both languages and both themes; it has been
deleted. What the screenshots caught, and what was then fixed:

1. **The Liebig chart was three times its intended size.** `w-full` on a
   400-unit viewBox stretched to a 1200 px panel, so 10.5 px labels rendered
   at ~30 px and the chart shouted over everything. Capped at `max-w-[520px]`
   and centred.
2. **The five cards had four different heights**, because one or two chip rows
   and one or two name lines each changed the footer. A ragged bottom edge on
   a ranked row reads as one card mattering more than another. Fixed with
   `h-full` + `flex-1` + `items-stretch`.
3. **Photo-less cards glowed lime in dark mode.** The placeholder gradient
   copied `Pallet`'s `leaf-4 → leaf-5`, and those tokens invert — `leaf-5` is
   `#b7e04b` in the dark. Twelve of nineteen crops have no photograph yet, so
   this was not an edge case; it was most of the row. Now `night-rise → night`,
   which barely moves between themes. **This is the one place `CropCard`
   deliberately departs from `Pallet`, and `Pallet` still has the problem.**

Also corrected: `recommendTypes.ts` declared `least_cost_vs_table` as
`{ saving_inr_per_ha }` and `recommended_mix` without its `nutrients_supplied`
/ `target`. The live payload carries a nested `lp` block, per-option table
costs and both nutrient vectors. The types now match what the engine actually
sends.

**The ontology is provably live.** In the rendered HTML the engine's `Gram` /
`चणे` appears as **Chickpea / हरभरा**, and `Jowar` appears only inside the
serialised data — never in visible markup. The app's hand-checked names win,
exactly as designed.

**Phase 5 — done, and since superseded.** The soil photograph was a check, not an
input. It is now an input: see *The photograph became an input* below and §6 of
`ML_PLAN.md`. The rest of this section describes the state Phase 5 left behind.

- **Engine**: `_surveyed_soil()` in `pipeline.py` puts the survey's own words —
  soil type, secondary type, share %, texture, depth, drainage, parent
  material — into `context.surveyed_soil`. Description only at the time; it
  changed no score. It is now additionally the *prior* for `soil_fusion`.
- **Backend**: `POST /api/soil` — the photograph alone. One input where
  `/api/predict` took nine, and **no `document_id`**: naming a soil from a
  picture never needed a card, and requiring one would be demanding a document
  to satisfy a dependency that no longer exists.
- **App**: `/api/soil` route handler, `soilTypes.ts` (`compareSoil` + the
  8-class → 6-type mapping), and `SoilAgreement.tsx`, which shows agreement,
  disagreement, or "these two vocabularies don't meet" — and **never resolves
  a disagreement**. It also states on its face that the photo is not an input,
  and names texture/depth/drainage as coming from the survey.
- **The four invented numbers are gone.** `<PredictionInputs>` is off the page
  and nothing calls `/api/predict` any more. Both of its jobs moved: the card
  readings are confirmed in `<LocationSeason>`'s panel (twelve, not four), and
  temperature/humidity/rainfall/moisture are derived by the engine from the
  taluka. The component is left in the tree, as `<Outcomes>` was.
- The worked-example soil card now yields to a real classification, the same
  way the crop decks yield to the board.

**Verified by rendering all three verdicts** against the live payload, both
languages, both themes: `black` vs `Black (Regur)` agrees; `laterite` vs
`Black (Regur)` differs and says so in amber; `peat` returns unmapped rather
than being forced to a nearest neighbour. The `context: null` case (photo
classified before any recommendation) degrades correctly.

One thing the screenshots caught: soil thumbnails rendered as black squares on
the first pass. Not a bug — Next's image optimiser simply hadn't produced them
yet; they load. The harness now waits for `networkidle`.

Lint is back at its **pre-existing baseline of 10 errors** (none from this
work). The one error this phase introduced — classifying inside a
`useEffect`, which sets state during render — was fixed properly rather than
suppressed: `usePicked` now hands the accepted file to its listener, so
classification happens in the event handler that already exists.

**Phase 6 — done.** The twelve new crops have pages worth opening.

- **`cultivation.ts`**: 12 sowing/harvest calendars added, so all 19
  recommendable crops now have one. Compiled from ICAR package-of-practices
  and state sowing windows, under the file's existing standing flag —
  **NEEDS AGRONOMIST REVIEW, and it is a non-agronomist's careful first pass.**
  Two entries carry a complication the single `season` field cannot hold:
  sorghum and sunflower are grown in more than one season, and in Maharashtra
  the *rabi* crop is the important one — rabi jowar (शाळू) on stored monsoon
  moisture is the state's signature dryland crop. The window is the national
  one, as this file's header requires, and the note carries the rest.
- **`soilSuitability.ts`**: the new crops added across the eight soils, and
  the header corrected. It described itself as a mirror of
  `backend/soil_crop_suitability.py`, "the source of truth — it is what
  actually re-ranks the crop model's output". That is no longer true: the
  engine's S2 gate decides crop-by-soil from surveyed texture, depth and
  drainage through FAO envelopes. The file is now editorial content for a
  soil page opened cold, and says so.
- **`backend/agents/topics.py`** was already synced in Phase 2 (34 crops,
  9 fertilisers).
- **`check-ontology.mjs` extended** to two more lockstep failures, both
  silent by nature: a recommendable crop with no calendar (the detail page
  renders and simply loses the band — `CropVisuals` returns `null` rather
  than drawing an empty year), and a crop named in the soil table that
  `CROPS` has never heard of (a dead chip on a soil page). **Both verified
  by deliberately breaking them.**

**Verified by opening the pages.** `/prediction/crop/{wheat,sorghum,sugarcane,safflower}`
all return 200, and the sorghum page renders its full band: sowing Jun–Jul in
dark green, growth Aug–Sep, harvest Oct–Nov in gold, the states map with 9
states lit, 100–130 days, low water, and the Marathi note. The hero image slot
holds its space with the designed placeholder, as intended.

### Left undone, deliberately

`src/data/prediction.ts` — the 404-line worked example — still shows **rice,
mango and coconut with confidence scores**. Two of those three are crops the
engine can never return. It is clearly labelled "Sample prediction … add your
card above and these become your field's", and it only appears before anyone
has run anything, so it misleads nobody about *their* field. But it is now a
demonstration of a product that no longer exists.

Replacing it means writing fresh bilingual editorial copy (`why`, `facts`,
`notes`) for engine crops, which is authoring, not integration — so it is
called out here rather than done quietly or left unmentioned.

**Phase 7 — done.** The integration is checked from both sides.

**New: `ml engine.../tests/test_app_contract.py`** — 10 tests, and two of them
are cross-repo on purpose. `check-ontology.mjs` fails the app's build when
somebody edits `cropOntology.ts` and leaves a crop unnamed, but it reads only
the app's own files — it cannot see *this repo* growing a nineteenth crop into
a twentieth. That failure would be silent and would reach a farmer as a card
with a raw APY string on it (`Arhar/Tur`) and a detail link that 404s. So the
engine now asserts, from its side, that everything it can emit the app can
name. It skips rather than fails when the app is not checked out beside it.

Also covered: every field `recommendTypes.ts` declares actually arrives;
`surveyed_soil` has exactly the eight keys `SoilAgreement` reads and a
`soil_type` drawn from the survey's own vocabulary; and a smoke test over
**one taluka per soil type in the state** asserting no ranked crop, no vetoed
crop and no fertiliser product comes back without a name.

Verified by breaking it: removing `Wheat` from `ENGINE_TO_CROP_KEY` fails both
the ontology test and the smoke test, with a message naming the file to edit.

**Engine suite: 195 passing** (was 185).

**The browser walk — and the fix that made it possible.** Phase 3's note said
the interaction could not be driven because of the Clerk problem. It can now:

- `allowedDevOrigins` needed the **exact hostname**. `"*.clerk.accounts.dev"`
  is *not* honoured — the chunks still 403'd with the wildcard alone, which is
  why the first attempt appeared to change nothing. Recorded in
  `next.config.ts`, along with the warning that this is instance-specific: a
  teammate with their own Clerk instance will hit the same dead page.
- With that, in **Marathi/light/normal motion** and **English/dark/reduced
  motion**: 0 chunk 4xx, React hydrates, 34 districts load, and **selecting
  Solapur lists its 11 talukas** — the §3.5 casing bug, confirmed fixed in a
  real browser rather than inferred from a payload. Labels render title-cased
  (Akkalkot, Barshi, Karmala…) while the stored value stays the engine's key.
  The atlas draws all 351 talukas shaded by aridity with Sangole marked.
  Submitting returns the bilingual 401 in the right language each time.

`npm run build` passes with `check:csp-hash` and `check:ontology` both green.

---

## The soil classifier is weak, and now it says so

Running the four reference photographs in `public/img/soils/` through
`POST /api/soil` — files `assets.ts` records as coming from **the classifier's
own training sets**:

| file | returned | correct? |
|:--|:--|:--|
| `black.jpg` | black 99.8% | yes |
| `laterite.jpg` | **red 50.7%** | no — laterite not in the top three |
| `red.jpg` | **alluvial 66.0%** | no — red second at 33.9% |
| `alluvial.jpg` | **yellow 91.1%** | no — alluvial third at 3.2% |

One of four, on data it was trained on. It is EfficientNet-B0 over roughly 28
photographs per class, and it shows.

This does not break Phase 5's design — showing a disagreement rather than
resolving it is exactly right, and more so now. But it broke Phase 5's
*copy*, which said a disagreement meant "your own field can genuinely differ
from it". That over-trusted the photograph. `SoilAgreement` now names both
explanations, leads with the weaker link, and prints the runner-up beside the
top guess ("Red soil 51% — or possibly: Black soil 25%, Alluvial soil 12%"),
because one confident-looking noun is not a truthful summary of what this
model knows.

**Worth acting on separately:** the soil model needs retraining on more data
before its output deserves much weight. Nothing downstream depends on it —
the recommendation never reads it — so this is contained.

## Where this leaves the integration

Working end to end: the engine as a service, the vocabulary bridge, the input
step, the results surface, the soil-photo check, the detail pages, and guards
on both sides of the contract.

Outstanding, and none of it blocking:

1. **The Marathi needs a native speaker.** Twelve crop names and two
   fertiliser transliterations were written here, hand-checked but not by a
   Marathi speaker.
2. **The cultivation calendars need an agronomist.** Twelve sowing windows,
   under the flag that file already carries. This is the one figure on the
   page a farmer acts on with a tractor.
3. **Twelve crop photographs and two fertiliser bags.** Slots reserved, layout
   holds, drop-in contract documented in `assets.ts`.
4. **`prediction.ts`'s worked example is stale** — rice, mango and coconut,
   two of which the engine can never return. Labelled a sample, shown only
   before anyone runs anything.
5. **`POST /api/recommend` is still gated** (§ Phase 3). One line either way.
6. **The theme script's CSP hash is unquoted** and silently ignored, so
   dark-mode users get the white flash it exists to prevent. Pre-existing,
   untouched, belongs to the theme system.

---

## 1. Ground truth, measured

### 1.1 The engine runs, and it is fast enough

Booted with `uvicorn src.serve.api:app --port 8001`, then exercised with the
exact JSON body `src/app/api/recommend/route.ts` sends:

| Step | Measured |
|:--|--:|
| `import src.pipeline` | 11.2 s |
| `load_pipeline()` (cache hit on `artifacts/pipeline_c882ddca7dd733fa.joblib`) | 0.3 s |
| First `/recommend` — builds the 351×305 feature store | **4.6 s** |
| Every subsequent `/recommend` | **0.13 s** |
| `GET /health` | `{"status":"ok","talukas":351}` |

A live call returned, for Solapur / Sangole / Rabi with a card attached:

```
crops:  Jowar (S1, model, p50 0.46) · Gram (S1) · Wheat (S2) · Maize (S3) · Safflower (S1)
fert:   {DAP: 115.65, MOP: 88.67, Urea: 186.05} kg/ha
N split: basal 50.2 kg/ha → 30-35 DAS 50.2 kg/ha
micro:  Zn (from farmer's card) · Mn, Fe (from taluka distribution)
factors: rain .757 · temp .931 · pH 1.0 · depth 1.0 · drainage 1.0 · salinity 1.0 · LGP 1.0 · texture 1.0
soil_test_source: "farmer soil health card"
```

**This is a much better answer than the site currently gives.** Today's
`/api/predict` returns "Urea, 88%, apply". The engine returns a dose in kg/ha,
a split schedule by growth stage, three micronutrient corrections each labelled
with *which reading decided it*, and the eight factor scores behind the ranking.

> **Note the accepted casing.** I posted `"Solapur"`/`"Sangole"` (title case) and
> got HTTP 200 — `pipeline.py:312` upper-cases both. The engine is
> casing-tolerant; the bug in §3.5 is purely client-side.

### 1.2 What is already built (uncommitted, in `git status`)

The transport half of this integration exists and is good work:

| File | State |
|:--|:--|
| `src/lib/recommendTypes.ts` | Complete, 248 lines, matches the engine's dataclasses |
| `src/lib/recommendApi.ts` | Complete — `server-only`, typed errors, 30 s timeout |
| `src/lib/soilTest.ts` | Complete — card's 12 metrics → engine's `soil_test` |
| `src/app/api/recommend/route.ts` | Complete — validation, bilingual failures |
| `src/app/api/recommend/meta/route.ts` | Complete — talukas + atlas + seasons, 1 h revalidate |
| `src/components/site/LocationSeason.tsx` | Built, **orphaned + one bug** (§3.5) |
| `src/components/site/TalukaMap.tsx` | Built, **orphaned** |
| `src/lib/format.ts` | `title()` added |

`grep` confirms **nothing imports `LocationSeason` or `TalukaMap`**. The input
step exists but is not mounted, and the entire *results* half is missing.

So this plan is not a green field. It is: fix one bug, mount what exists,
reconcile two vocabularies, and build the results surface.

### 1.3 The four numbers that prove the user's instinct right

`backend/app.py:266-273`, in the codebase's own words:

> *"The four for the field. Every one of these carried a default until now —
> 26°C, 68%, 110mm, 34% — and the frontend never sent any of them, so those four
> numbers are what every prediction this product has made was actually computed
> from. There is no weather feed that knows somebody's plot."*

`/api/predict` requires the farmer to type `temperature`, `humidity`,
`rainfall`, `moisture`. The engine derives all four from taluka climatology —
`rain_annual`, Hargreaves ET0, LGP, aridity, root-zone available water —
measured per taluka across three weather years.

**This is the single strongest argument for the migration, and it is already
written in the repo.** Four typed guesses become four measured descriptors.

---

## 2. Architecture: two Python services, not one

Keep them separate. `recommendApi.ts` already assumes this, and it is correct:

```
                    browser
                       │
              ┌────────▼────────┐
              │   Next.js       │  Clerk auth · bilingual errors · validation
              │   :3000         │
              └───┬─────────┬───┘
     /api/card    │         │   /api/recommend · /api/recommend/meta
     /api/soil    │         │
        ┌─────────▼──┐   ┌──▼──────────────┐
        │ backend    │   │ Regur engine    │
        │ :8000      │   │ :8001           │
        │ torch      │   │ lightgbm/pandas │
        │ EfficientNet│  │ no torch        │
        │ OCR·Clerk  │   │ stateless       │
        │ agents     │   │ read-only       │
        │ 2 GB · vol │   │ ~700 MB · no vol│
        └────────────┘   └─────────────────┘
```

**Why not merge them:**
- Dependency trees are disjoint — torch + EfficientNet vs lightgbm + pyarrow.
  Merging forces a ~2.5 GB image where two images are ~250 MB and ~700 MB.
- `fly.toml` pins the backend to **exactly one machine** because the research
  scheduler is a thread inside it ("a second would run a second scheduler
  against the same volume, researching the same topics twice and billing OpenAI
  twice"). The engine is stateless and *wants* to scale horizontally. Merging
  would permanently cap the engine at one replica for a reason that has nothing
  to do with the engine.
- The backend needs a 3 GB volume. The engine needs none.

**Security gap to close:** `recommendApi.ts` sends `authedServiceHeaders()`
(Clerk bearer + `X-AgroSense-Key`) but `src/serve/api.py` validates neither.
Today that is harmless only because the engine is bound to `127.0.0.1`. Before
it ever gets a public address it needs the same shared-secret check
`backend/auth.py` uses. **Never deploy the engine on a public address without
this.**

---

## 3. The five real gaps

### 3.1 GAP — Crop vocabulary: the site cannot name what the engine recommends

The engine ranks **19 crops** (`src/ontology/crop_map.py: CROP_ONTOLOGY`).
`src/data/crops.ts` defines **22**. They overlap on **7**.

**Engine → site, mapped (7):**

| Engine (APY) | Site key | Photo |
|:--|:--|:--:|
| `Rice` | `rice` | ✓ |
| `Maize` | `maize` | ✓ |
| `Gram` | `chickpea` | ✓ |
| `Arhar/Tur` | `pigeonpeas` | ✓ |
| `Moong(Green Gram)` | `mungbean` | ✓ |
| `Urad` | `blackgram` | ✓ |
| `Cotton(lint)` | `cotton` | ✓ |

**Engine crops with no card, no photo, no detail page, no calendar (12):**

`Jowar` (Sorghum) · `Bajra` (Pearl Millet) · `Wheat` · `Soyabean` ·
`Sugarcane` · `Groundnut` · `Safflower` · `Sunflower` · `Sesamum` ·
`Linseed` · `Ragi` (Finger Millet) · `Rapeseed &Mustard`

**Site crops the engine can never return (15):**

`lentil` · `mothbeans` · `kidneybeans` · `banana` · `mango` · `grapes` ·
`pomegranate` · `orange` · `papaya` · `coconut` · `watermelon` · `muskmelon` ·
`apple` · `jute` · `coffee`

Read that twice. **Wheat, jowar, bajra, soybean, sugarcane and groundnut — the
crops Maharashtra actually grows — have no presence on this site at all**,
while apple, coffee and jute do. `crops.ts:8-10` already confesses it: *"the set
spans the whole country (apple, coffee and jute are not Maharashtra crops)"*.

This is precisely the "data which is not relevant now" the migration is for.

### 3.2 GAP — The engine's Marathi names are not usable as UI copy

`crop_marathi` comes from the government table's `Crop_Local_Name`. Pulled from
the engine directly:

| Engine crop | `crop_marathi` returned | Problem |
|:--|:--|:--|
| `Mungbean` | `मॉथ बीन` | **Wrong.** मॉथ बीन is *moth* bean (मटकी). Mung bean is मूग. |
| `Rice` | `तांदूळ/धान/भात/साळ` | Four synonyms, slash-separated |
| `Ragi` | `रागी/नाचणी/नागली` | Three synonyms |
| `Pigeon Pea` | `Pigeon Pea` | No Marathi at all |
| `Cotton(lint)` | `टेट्राप्लॉइड कापूस` | Botanical variety, not कापूस |
| `Indian Mustard` | `भारतीय मोहरी` | Stilted |

**Do not pipe `crop_marathi` to the UI.** The app's hand-checked names in
`crops.ts` (भात, मका, हरभरा, तूर, मूग, उडीद, कापूस) are correct and stay
authoritative. Treat the engine's crop string as a **join key only**. Use
`crop_marathi` only as a last-resort fallback for a crop the app has no entry
for, and even then take the segment before the first `/`.

### 3.3 GAP — Fertiliser vocabulary barely overlaps

Distinct `Fertilizer` values in the engine's table are
**Urea · DAP · MOP · SSP** (plus organic and method rows: FYM, compost,
vermicompost, oil cake, bio-fertilizers, mulching, seed treatment…).

`src/data/fertilizers.ts` has 7 grades: `urea` `dap` `14-35-14` `28-28`
`17-17-17` `20-20-20` `10-26-26`.

- Overlap: **`urea`, `dap` only.**
- `MOP` and `SSP` have **no entry and no photo** — and the live call above
  returned 88.67 kg/ha of MOP.
- Five site grades (`14-35-14`, `28-28`, `17-17-17`, `20-20-20`, `10-26-26`)
  can **never** be recommended by the engine.

The framing changes too, and for the better. Today: *"which bag, ranked by
confidence"*. The engine: *"this many kg/ha of each product, split across these
growth stages, plus these micronutrients"*. `FertiliserPlan` in
`recommendTypes.ts` already models the richer shape.

### 3.4 GAP — The soil image has nowhere to go — **CLOSED**

*Closed 12 September 2026.* The engine now accepts the classifier's probability
vector (`RecommendIn.soil_photo`) and fuses it with the taluka survey in
`src/rules/soil_fusion.py`: survey area shares as the prior, the classifier's
measured confusion matrix as the likelihood, reported back as
`context.soil_fusion`.

The gap as originally written was half right, and the half that still holds is
what bounds the feature. A photograph cannot determine depth, drainage or
salinity, so fusion never moves them — it moves the soil-class flags and
available water only. A picture can therefore add a caution and can never lift
a veto, which the `gate_photo` hard gate checks exhaustively (2,304 fusions
across every surveyed pair and class) rather than by sampling.

The original gap analysis follows, for the reasoning that produced the design.

But the two soil vocabularies **do** meet:

| Classifier (EfficientNet, 8) | Engine `Soil_Type` (6) |
|:--|:--|
| `alluvial` | `Alluvial` ✓ |
| `black` | `Black (Regur)` ✓ |
| `laterite` | `Laterite` ✓ |
| `red` | `Red & Yellow` ✓ |
| `yellow` | `Red & Yellow` ✓ |
| `clay`, `cinder`, `peat` | *no counterpart* |
| — | `Mountain / Forest`, `Saline / Alkaline` |

So the photo has an honest job: **agreement check, not model input.** The
taluka's mapped soil type is known; the photo either corroborates it or
contradicts it, and a contradiction is worth showing the farmer ("your taluka
is mapped black cotton soil; this photo reads laterite — worth confirming
before sowing"). That keeps the soil-classification feature alive and truthful
without inventing an input the engine does not have.

This is the only defensible option. Feeding a photo-derived soil class into the
engine as if it were surveyed texture would be exactly the invented input the
codebase refuses everywhere else.

### 3.5 BUG — the taluka dropdown can never populate

`LocationSeason.tsx`:

```ts
// district is stored title-cased …
onChange={(e) => onChange({ district: titleCase(e.target.value), taluka: "" })}
const pickTaluka = (row) => onChange({ district: titleCase(row.District), … });

// … but filtered against the engine's UPPERCASE rows
const talukasInDistrict = (meta?.talukas.talukas ?? [])
  .filter((t) => t.District === values.district);   // "SOLAPUR" === "Solapur" → false
```

`/talukas` returns `District` upper-cased (`ml engine.../src/data/load.py:5-6`
canonicalises every location string). The filter is always empty, so **after
picking a district the taluka list stays empty and the form can never be
completed.**

`TalukaMap.tsx` is **not** affected — line 124 upper-cases both sides before
comparing, so map selection already works:

```ts
points.find((p) => p.d === value.district.toUpperCase()
                && p.t === value.taluka.toUpperCase())
```

That line is the fix, applied in one place and not the other. Fix: keep engine
casing (`UPPERCASE`) as the stored value — it is the join key — and apply
`titleCase()` at render only. That is what `format.ts`'s new `title()` docstring
already says it is for: *"this is only ever for display."* One line in
`LocationSeason.tsx:96`; `TalukaMap` needs no change.

### 3.6 Two operational snags

- **The engine's `.venv` is broken.** It was built against the python.org
  framework 3.14, which is no longer installed; `.venv/bin/python` →
  `python3.14` → missing. `pyvenv.cfg` also still points at an old path
  (`/Volumes/dishan project/C & F Engine/.venv`). Its `python3.13` symlink still
  resolves and I used it for every measurement above. **Rebuild the venv.**
- **Startup does not warm the feature store.** `@app.on_event("startup")` calls
  `load_pipeline()` (0.3 s) but not `build_feature_store()`, so the *first
  farmer* pays the 4.6 s. Also `on_event` is deprecated — move to a `lifespan`
  handler and warm both. One-line win: 4.6 s → 0.13 s for the first real user.

---

## 4. The plan

Seven phases. Each is independently shippable and leaves the site working.

### Phase 1 — Make the engine a first-class service *(no frontend change)*

1. Rebuild the venv against a Python that exists:
   `python3.13 -m venv .venv && .venv/bin/pip install -r requirements.txt`
2. `src/serve/api.py`: replace the deprecated `@app.on_event("startup")` with a
   `lifespan` handler that warms **both** `load_pipeline()` *and*
   `build_feature_store()`.
3. Add a shared-secret guard (mirror `backend/auth.py`): reject requests without
   `X-AgroSense-Key` when the env var is set. Off by default for local dev.
4. Add `RECOMMEND_API_BASE=http://127.0.0.1:8001` to `.env` — **it is missing**;
   `recommendApi.ts` only has its hardcoded fallback.
5. Add `npm run recommend` to `package.json`, alongside the existing `api`
   script, so both services start the same way.
6. Second `fly.toml` (or a second `[processes]` entry) for the engine:
   no volume, `auto_stop_machines` may be `true`, health check
   `/health`, `grace_period` ~60 s.

**Done when:** `curl :8001/health` returns 351 talukas on a cold container and
the first `/recommend` is ≤ 0.5 s.

### Phase 2 — Reconcile the vocabularies *(the crux; do before any UI)*

This is the phase that makes everything after it easy. One new module,
`src/data/cropOntology.ts`:

```ts
/** Engine crop string (APY name) -> the site's own key. The engine's name is
 *  a join key; the display name is always ours (see §3.2 — the table's
 *  Crop_Local_Name calls mung bean "मॉथ बीन", which is moth bean). */
export const ENGINE_TO_CROP_KEY: Record<string, string> = {
  "Rice": "rice", "Maize": "maize", "Gram": "chickpea",
  "Arhar/Tur": "pigeonpeas", "Moong(Green Gram)": "mungbean",
  "Urad": "blackgram", "Cotton(lint)": "cotton",
  "Jowar": "sorghum", "Bajra": "pearlmillet", "Wheat": "wheat",
  "Soyabean": "soybean", "Sugarcane": "sugarcane", "Groundnut": "groundnut",
  "Safflower": "safflower", "Sunflower": "sunflower", "Sesamum": "sesame",
  "Linseed": "linseed", "Ragi": "fingermillet",
  "Rapeseed &Mustard": "mustard",
};
```

Then:

1. **Add the 12 missing crops to `crops.ts`** — key, `mr`, `en`, category.
   Marathi comes from the app's own dictionary, *hand-checked*, not from the
   engine. Suggested (confirm each with a Marathi speaker before shipping):
   ज्वारी · बाजरी · गहू · सोयाबीन · ऊस · भुईमूग · करडई · सूर्यफूल · तीळ ·
   जवस · नाचणी · मोहरी.
   New category needed: `oilseed` (safflower, sunflower, sesame, linseed,
   mustard, groundnut) — `categoryLabel`/`categoryTint` gain one entry each,
   using an existing hue, no new colour.
2. **Mark which crops the engine can return.** Add `engine: boolean` to `Crop`,
   or better, derive `RECOMMENDABLE_KEYS` from `ENGINE_TO_CROP_KEY`. The 15
   orphans (mango, banana, apple…) stay on the site as *content* — they have
   photos, cultivation calendars and detail pages, and removing them would
   delete real work — but they are no longer presented as model output.
3. **Fertilisers**: add `mop` and `ssp` to `fertilizers.ts` (MOP 0-0-60,
   SSP 0-16-0). Keep the five complex grades as catalogue entries; drop them
   from the recommendable set.
4. **Photography — every recommendable crop gets an image slot, reserved now.**

   **Requirement: all 19 crops the engine can recommend must render with an
   image frame, whether or not the photograph exists yet.** A recommendation
   that appears as a bare text row while its neighbours carry photographs
   reads as a lesser result, and it isn't one — the engine ranked it the same
   way. So the frame is drawn for all 19 from the first commit; only its
   *contents* arrive later.

   The mechanism already exists and needs no invention. `assets.ts` holds a
   `DELIVERED` set and `photo(path)` returns `undefined` for anything absent;
   every photographic surface already falls back to the designed placeholder
   (`field-rows`, the drawn furrow texture). `crops.ts` computes
   `img: crops/${key}.jpg` for every crop regardless of delivery.

   Therefore:

   - Each of the 12 new crops gets its `crops/<key>.jpg` path the moment its
     `crop()` entry lands — automatic, no extra step.
   - **Reserve the layout.** Every crop card and every result row renders a
     fixed-aspect image box (the existing card aspect) with the placeholder
     inside. Space is held whether or not a file exists, so dropping a
     photograph in later changes pixels, never layout — no reflow, no
     re-tuning of the deck.
   - **The drop-in contract, documented at the top of `assets.ts`:** to add a
     photograph, (1) save it as `public/img/crops/<key>.jpg`, (2) add
     `"crops/<key>.jpg"` to `DELIVERED`. Nothing else changes.
   - Add a commented block in `DELIVERED` listing all 12 awaited paths, so the
     file names are already written down and adding one is uncommenting a line:

     ```ts
     // ---- Crops: the 12 the engine recommends, awaiting photographs. -----
     // Uncomment each line as the file lands in public/img/crops/.
     // "crops/sorghum.jpg",      // Jowar · ज्वारी
     // "crops/pearlmillet.jpg",  // Bajra · बाजरी
     // "crops/wheat.jpg",        // Wheat · गहू
     // ... (all 12)
     ```

   - Same treatment for `fertilizers/mop.jpg` and `fertilizers/ssp.jpg`.
   - The placeholder must never be captioned "image missing" or similar. It is
     a designed texture, and it is what the site already shows for any
     undelivered shot.

   **This blocks nothing.** All 19 crops are fully functional — ranked, scored,
   dosed, linked to a detail page — with placeholders throughout.

   > Note: `upload/wheat.jpg` already exists in `DELIVERED`, but it is a
   > deliberately bokeh-soft atmospheric background for the upload zone, not a
   > crop card portrait. `crops/wheat.jpg` is a separate, still-needed shot.

**Done when:** every one of the 19 engine crop strings resolves to a `Crop`
with a label in both languages, and a unit test asserts exactly that — the
`test_ontology.py` idea, on the TypeScript side.

### Phase 3 — Mount the input step

1. Fix the casing bug (§3.5): store engine casing, `titleCase()` at render.
   Check `TalukaMap.tsx` for the same comparison.
2. Mount `LocationSeason` in `Prediction.tsx`, replacing `PredictionInputs`'
   eight-field form. Its four field-condition inputs disappear entirely —
   they are §1.3's four guesses.
3. Wire submit → `POST /api/recommend` → store the `Recommendation` in
   `cardState.tsx` alongside `prediction` (same in-memory, non-persisted
   policy — `cardState.tsx:20-26` is explicit that persistence "is not ours to
   decide").
4. Keep the card upload exactly as is. `soilTestFromCard` already bridges it.

**Done when:** a farmer can pick Solapur / Sangole / Rabi, with or without a
card, and a `Recommendation` lands in context.

### Phase 4 — The results surface

Replace the fixture-backed decks in `Prediction.tsx`. New components under
`src/components/site/recommend/`:

| Component | Renders | Source field |
|:--|:--|:--|
| `CropRanking` | the ranked crops, one card each | `crops[]` |
| `LiebigStaves` | the eight factor scores, shortest marked | `crops[].factors` |
| `YieldBand` | p10–p50–p90 + below/typical/above | `yield_*` |
| `DosePlan` | kg/ha per product + N split schedule | `fertiliser` |
| `Micronutrients` | corrections, each labelled by source | `micronutrients[]` |
| `VetoedCrops` | what was ruled out and why | `vetoed[]` |
| `ConfidenceNote` | OOD abstention, `water_limited` | `confident`, `abstention_reason` |
| `ContextAudit` | every value used, and where it came from | `context` |

**Port the Liebig stave chart.** It is the engine's signature idea — the S2 gate
literally computes `score = min(eight factors)`, and the barrel-stave picture
has illustrated that law since 1840. `factors` is already in
`recommendTypes.ts`. Rebuild it as inline SVG in the app's own palette
(`--color-leaf-1..5` for the ramp, `--color-anar` for the limiting stave), not
by copying `src/serve/static/app.js`.

**`ContextAudit` is not optional.** The engine tells you, per field, whether a
number came from the farmer's card or the taluka distribution
(`soil_test_source`, `ph_source`, `ec_source`, and `source` on every
micronutrient). Surfacing that is the direct expression of the rule this
codebase already lives by — a reading is either the farmer's or it is labelled
as not being theirs.

### Phase 5 — Reposition the soil image

1. Split `backend/app.py`'s `/api/predict` into a soil-image-only route
   (`POST /api/soil`: `document_id` + `soil_image` → `PredictedSoil`). The crop
   and fertilizer LightGBM heads in `backend/models.py` are superseded; keep the
   code but stop calling it, exactly as `Outcomes.tsx` was kept in the tree.
2. Compare the classifier's class to the taluka's mapped `Soil_Type` via the
   §3.4 table. Render agreement plainly; render disagreement as a flag, never
   silently resolved.
3. Expose the taluka's surveyed soil type through the engine — `/atlas` already
   returns per-taluka rows; add `Soil_Type`, `Soil_Texture`, `Soil_Depth`,
   `Soil_Drainage` to the `/recommend` `context` block.

**Done when:** uploading a soil photo produces a class, a comparison, and no
crop or fertilizer claim of its own.

### Phase 6 — Routes, detail pages, research topics

Adding 12 crops has a lockstep tail. All of these must move together:

- `src/data/topics.ts` — `CROP_KEYS` derives from `CROPS`, so it follows
  automatically; **verify** `SOIL_KEYS`, which is a hand-written list.
- `backend/agents/topics.py` — mirrors `topics.ts`. Out of sync means detail
  pages exist with no research report behind them.
- `src/data/cultivation.ts` — 12 new sowing/harvest calendars. These are
  Maharashtra staples, so ICAR calendars are readily available; the file already
  carries a `NEEDS AGRONOMIST REVIEW` flag and the new rows inherit it.
- `src/data/soilSuitability.ts` — favoured/discouraged lists per soil.
- `dynamicParams = false` is set on **all three** detail routes —
  `prediction/crop/[key]/page.tsx:25`, `fertilizer/[key]/page.tsx:14`,
  `soil/[key]/page.tsx:15` — so any key not in the list is a hard 404, silently.
  Adding crops without adding them here produces recommendations that link to
  nothing. **Verify the build** after the crop list grows.
- `src/data/prediction.ts` — the 404-line fixture. Once Phase 4 lands, its
  `PREDICTED_*` arrays are dead as *predictions*. Its bilingual editorial copy
  (`why`, `facts`, `notes`) is still valuable; keep that, drop the fake
  confidence numbers.

### Phase 7 — Verification

- `tests/test_frontend.py` in the engine already covers the serving contract —
  extend it to assert the response shape `recommendTypes.ts` declares.
- New: a TypeScript test asserting every `ENGINE_TO_CROP_KEY` value exists in
  `CROPS` (catches the §3.1 class of bug forever).
- New: a smoke test hitting `/api/recommend` for a taluka in each of the six
  soil types, asserting no crop renders without a label.
- `npm run build` must pass — it runs `check:csp-hash`, and any inline script
  added for the map would break the CSP hash.
- Walk the whole flow in both languages and both themes, with
  `prefers-reduced-motion: reduce` on.

---

## 5. Frontend consistency contract

Non-negotiable for every new component, drawn from the existing code:

1. **Colour only through tokens.** `text-ink`, `bg-surface`, `border-line`,
   `--color-leaf-1..5`, `--color-anar`, `--color-haldi`, `--color-jal`.
   No new hues. The palette is Deccan basalt, black cotton soil, turmeric and
   laterite, and it is already complete.
2. **`<Section>` for every band** — vertical rhythm (`py-20 md:py-28`) lives in
   one place. `eager` only above the fold.
3. **`<Reveal>` for entrance**, spring `{stiffness: 140, damping: 22}`,
   stagger ~0.06 s. Branch the `transition`, **never the markup**, on
   `useReducedMotion()` — it is `null` on the server and would hydrate-mismatch.
4. **Type through `Type.tsx`**: `<SectionHead tone="output">` is reserved for
   model output and is why the recommendation section is green.
5. **Every string bilingual, from `dict` in `i18n.tsx`** via `t()` / `pair()`.
   No inline English. Marathi never compresses (`--wdth-statement: 100`) and
   Marathi eyebrows never uppercase.
6. **`cn()` for every className**, prop-override last.
7. **Numbers get `tnum`** — doses, scores and yields are compared down a column.
8. **`--radius-card: 20px`, `--shadow-card`, `--ease-regur`.** No ad-hoc radii.
9. **Dark mode is free** if rule 1 is followed; `--color-on-light`,
   `--color-chalk` and `--color-mist` deliberately do *not* swap.
10. **Min 48 px tap targets, 15 px base type.** This is used outdoors, in
    sunlight, with a thumb.

## 6. Engine features that must reach the app

The ask was to keep the engine's features. Checklist — each maps to a field
already typed in `recommendTypes.ts`:

- [ ] Ranked crops with `decided_by` (model / rules / blend / OOD)
- [ ] Liebig stave chart + named `limiting_factor`
- [ ] `suitability_class` S1/S2/S3/N
- [ ] Yield p10/p50/p90 **and** `yield_class` (below/typical/above)
- [ ] `yield_abstained` — the engine declining to guess is a feature, show it
- [ ] Conformal `yield_interval_note`
- [ ] OOD guard: `confident`, `novelty`, `abstention_reason`
- [ ] `water_limited` — irrigation would change the answer
- [ ] `vetoed[]` with reasons — what was ruled out is advice too
- [ ] `not_assessable[]` — APY aggregates the engine won't pretend to rank
- [ ] Exact fertiliser dose, `estimated` flag for state-median fallback
- [ ] N split schedule keyed to leach risk
- [ ] Micronutrients with per-item source attribution
- [ ] Sulphur swap (DAP→SSP)
- [ ] `product_ranges_across_districts` — the honest spread
- [ ] Taluka atlas map, shaded by aridity
- [ ] Full `context` audit trail

## 7. Risks

| Risk | Severity | Mitigation |
|:--|:--|:--|
| 12 crops ship without photographs | Medium | Image slot reserved for all 19 (§4 P2.4); `assets.ts` placeholder fills it; layout holds so backfill causes no reflow |
| Engine Marathi is wrong (§3.2) | **High** | App-side names only; engine string is a join key |
| MOP/SSP recommended with no product card | Medium | Add both in Phase 2 before Phase 4 renders a dose |
| Feature-store rebuild on first request | Low | Phase 1.2 warms it |
| Engine exposed without auth | **High** | Phase 1.3, before any public deploy |
| `dynamicParams=false` 404s new crops | Medium | Phase 6, verify the build |
| Losing the 15 non-engine crops' content | Low | Keep as content, demote from model output |
| Two services to run locally | Low | `npm run recommend` |

## 8. Sequencing

Phase 1 and Phase 2 are independent — do them in parallel. Phase 2 gates
everything visual. Phases 5 and 6 can trail the launch.

```
P1 service ──┐
             ├── P3 input ── P4 results ── P7 verify
P2 ontology ─┘                    │
                                  ├── P5 soil image
                                  └── P6 routes + topics
```

The one-line summary: **the engine is ready, the transport is written, and the
work that remains is a vocabulary reconciliation plus a results surface.**
