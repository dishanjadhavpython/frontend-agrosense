# Maharashtra Data

> **Status: reference — generated 10 August 2026.** Coverage has grown since: the weather panel now
> runs 1997-98 to 2025-26 (29 years) rather than the three years this describes. The DES crop
> portal (`data.desagri.gov.in`) was unreachable throughout 12 September 2026, so the 1997–2014
> crop years remain outstanding. See [ML_PLAN.md](ML_PLAN.md) §2.
>
> **Four file references below no longer resolve**, and were stale before this document moved:
> `ok data sets/` is now empty, and `output/` holds weather through 2024-25 and APY from 2015-16 —
> not the 2025-26 weather or 2022-23 APY filenames cited here. The authoritative copy of every
> dataset the engine actually reads, with an md5 per file, is
> `ml engine for Recommendation/data/raw/` (45 files; see its `MANIFEST.md5`).

Everything scraped for Maharashtra, what it covers, where it came from, and what it
cannot tell you. All sources are Government of India portals.

Generated 10 August 2026.

---

## 1. File inventory

| File | Rows | Level | Period | Source |
|---|---|---|---|---|
| [`output/maharashtra_daily_weather_taluka_2025-04-01_to_2026-03-31.csv`](../scrape data imp/output/maharashtra_daily_weather_taluka_2025-04-01_to_2026-03-31.csv) | 130,670 | taluka × day | Apr 2025 – Mar 2026 | NASA POWER |
| [`output/maharashtra_soil_type_talukas.csv`](../scrape data imp/output/maharashtra_soil_type_talukas.csv) | 358 | taluka | static map | ICAR-NBSS&LUP 1:1M soil map |
| [`output/maharashtra_all_parameters_2025-26_talukas.csv`](../scrape data imp/output/maharashtra_all_parameters_2025-26_talukas.csv) | 351 | taluka | cycle 2025-26 | Soil Health Card |
| [`ok data sets/maharashtra_all_parameters_2025-26_districts.csv`](../scrape data imp/ok data sets/maharashtra_all_parameters_2025-26_districts.csv) | 34 | district | cycle 2025-26 | Soil Health Card |
| [`ok data sets/maharashtra_all_parameters_2025-26_states.csv`](../scrape data imp/ok data sets/maharashtra_all_parameters_2025-26_states.csv) | 1 | state | cycle 2025-26 | Soil Health Card |
| [`output/maharashtra_fertilizer_recommendations.csv`](../scrape data imp/output/maharashtra_fertilizer_recommendations.csv) | 41,070 | district × crop × fertilizer | current | Soil Health Card |
| [`output/maharashtra_crops_apy_2022-23.csv`](../scrape data imp/output/maharashtra_crops_apy_2022-23.csv) | 1,000 | district × crop × season | **2022-23** | DES (Min. of Agriculture) |

**Vintages differ and cannot be made to match.** Weather and soil are 2025-26; crop
statistics are 2022-23, because that is the newest year published anywhere at district
level (see §7).

---

## 2. How the files join

```
weather ──┐
          ├── (State, District, Taluka)  ── soil type ── soil nutrients
soil type ┘

crops ─── (State, District) ──────────────── fertilizer recommendations
```

- **Taluka level** — weather, soil type and soil nutrients share one key.
  Weather and soil type both cover all **358** talukas and their keys are identical.
  Nutrients cover **351**; the 7 missing are Andheri, Borivali, Kurla, Thane,
  Ulhasnagar, Pune City and Nagpur (Urban) — urban talukas with no soil samples.
- **District level** — crops and fertilizer recommendations. Roll the taluka files up
  to district to join them to these.
- Taluka spellings were aligned to the Soil Health portal's subdistrict registry with
  `scraper.py --align-talukas`; without it the nutrient file uses its own spellings
  (`CHANDUR RIL`, `OSMANABAD`) and will not join.

```python
import pandas as pd
w = pd.read_csv("output/maharashtra_daily_weather_taluka_2025-04-01_to_2026-03-31.csv")
s = pd.read_csv("output/maharashtra_soil_type_talukas.csv")
df = w.merge(s, on=["State", "District", "Taluka"], how="left")
```

---

## 3. Daily weather — taluka level

`maharashtra_daily_weather_taluka_2025-04-01_to_2026-03-31.csv` — 358 talukas × 365
days, complete: every taluka has all 365 days and there is not one empty cell.

| Column | Unit | Source field |
|---|---|---|
| `Max_temperature` / `Min_temperature` | °C | `T2M_MAX` / `T2M_MIN` |
| `Humidity` | % | `RH2M` |
| `Rainfall` | mm/day | `PRECTOTCORR` |
| `Wind_speed` | m/s | `WS2M` (2 m, agronomic standard) |

Source: [NASA POWER](https://power.larc.nasa.gov/) daily point API — MERRA-2
reanalysis, free, no key. IMD was checked first and rejected: its free APIs are
forecast-only, its free gridded archive lacks humidity and wind and stops at 2024, and
daily station data is a paid requisition. See `README.md` §2.

Observed range: max temperature 21.1–45.4 °C, rainfall 0–143.9 mm/day. Annual rainfall
runs from **629 mm** (Dhule) to **3,346 mm** (Ulhasnagar), mean 1,544 mm — the Konkan
and Ghat talukas at the wet end, the Deccan rain shadow at the dry end.

> **Resolution caveat.** NASA POWER's grid is ~0.5° (~55 km); a Maharashtra taluka
> averages ~30 km across. Neighbouring talukas often fall in the same grid cell and
> get near-identical series. The rows are correctly labelled and give a finer join
> key, but this is district-scale weather interpolated to taluka centroids — not 358
> independent stations.

---

## 4. Soil type — taluka level

`maharashtra_soil_type_talukas.csv` — one row per taluka, all 358 classified.

Source: **ICAR-NBSS&LUP 1:1 million soil map of India** via the
[BHOOMI geoportal](https://bhoomigeoportal-nbsslup.in/) WMS. Nine points are sampled
in a grid (0.06°, ~7 km) around each taluka centroid; points landing in another state
are dropped; the modal soil group wins.

| Soil type | Talukas |
|---|---|
| Black (Regur) | 223 |
| Red & Yellow | 53 |
| Mountain / Forest | 43 |
| Saline / Alkaline | 23 |
| Alluvial | 15 |
| Laterite | 1 |

That is the Deccan trap picture you would expect: black cotton soil across Vidarbha,
Marathwada and the western plateau, hill soils along the Sahyadri, saline patches on
the coast and in the Purna tract (Hingoli, Washim).

Alongside the group, each row carries the raw map attributes — `Soil_Order`,
`Soil_Taxonomy`, `Soil_Texture`, `Soil_Depth`, `Soil_Drainage`, `Soil_pH_Class`,
`Soil_Parent_Material` — plus `Soil_Type_Share_pct` (how many of the 9 points agreed;
mean 80.7%, and 145 talukas are unanimous) and the centroid used.

> **The group is derived.** The map is USDA Soil Taxonomy; black/red/laterite is an
> older, different classification. `crop_scraper.indian_soil_type()` is the
> correspondence used. Its known weak spot is laterite: the Konkan and Goa laterite
> plateaus read as red or mountain soils because the NBSS units there carry no
> lateritic marker. Ratnagiri and Sindhudurg are the talukas to treat with suspicion.

---

## 5. Soil nutrients — taluka, district, state

`maharashtra_all_parameters_2025-26_talukas.csv` (351 talukas, 45 columns) and the
district and state roll-ups.

Source: [Soil Health Card nutrient dashboard](https://soilhealth.dac.gov.in/nutrient-dashboard),
cycle 2025-26, Soil Health Card RKVY scheme. Built on **926,777** soil samples
state-wide.

Each parameter is reported as the share of tested samples in each class, plus the
sample count: N, P, K and organic carbon as Low/Medium/High; pH as
Acidic/Neutral/Alkaline; EC as Saline/Non-saline; and S, Fe, Zn, Cu, B, Mn as
Sufficient/Deficient.

State-level headline (2025-26):

| Finding | Value |
|---|---|
| Nitrogen low | **87.4%** of samples |
| Organic carbon low | **56.1%** |
| Potassium high | **66.4%** |
| Phosphorus low / high | 19.8% / 17.9% |
| Zinc deficient | 50.5% |
| Iron deficient | 50.0% |
| Sulphur deficient | 48.0% |
| Boron deficient | 46.2% |

Nitrogen and organic carbon are the binding constraints across Maharashtra; potassium
mostly is not. That is the agronomic reason the fertilizer recommendations in §6 lean
on urea and on organic matter.

---

## 6. Fertilizer recommendations — district × crop

`maharashtra_fertilizer_recommendations.csv` — **41,070 rows**, 34 districts, 78 crops
(311 distinct crop × variety × irrigation × season entries), produced by
`fertilizer_scraper.py` in 1,356 API calls.

Source: the [Soil Health Card fertilizer recommendation
service](https://soilhealth.dac.gov.in/fertilizer-recommendation) (`getRecommendations`
on the same GraphQL backend as the nutrient dashboard).

| Category | Rows | What it holds |
|---|---|---|
| Inorganic | 25,174 | Urea, DAP, MOP, SSP quantities in two interchangeable combinations |
| Natural farming | 9,198 | Ghanjeevamrit, Jeevamrit, green manuring, mulching, seed treatment, with the purpose of each |
| Organic | 6,698 | FYM, compost, vermicompost, oil cake, bio-fertilizers, application method |

One row per fertilizer, in long form so organic and inorganic sit in one file:

| Column | Meaning |
|---|---|
| `Crop`, `Crop_Variety`, `Crop_Irrigation`, `Crop_Season`, `Crop_Local_Name` | the crop as the portal defines it — sorghum irrigated-rabi is a different row from sorghum rainfed-kharif |
| `Soil_Class` + `Soil_N/P/K_kg_per_ha`, `Soil_OC_pct` | the soil test the recommendation answers (blank for organic and natural rows) |
| `Category` | `Inorganic`, `Organic`, or `Natural farming` |
| `Option` | `1` (DAP-based) or `2` (SSP-based) — interchangeable alternatives |
| `Fertilizer`, `Quantity`, `Unit` | e.g. Urea, 139.89, Kg per Hectare |
| `N_kg_per_ha`, `P2O5_kg_per_ha`, `K2O_kg_per_ha` | nutrients supplied by that option |

**A recommendation is a function, not a constant.** The dose depends on the soil test,
so each crop is queried at three soil fertility levels — Low, Medium, High — using a
representative value inside each Soil Health Card rating band. Pick the `Soil_Class`
row matching your field, or join to §5 to see which class dominates a district. Doses
fall sharply as fertility rises: chickpea in Pune needs 115.7 kg/ha DAP on Low-fertility
soil and 29.6 kg/ha on High.

**N/P/K are derived.** The portal returns fertilizer products, not nutrient doses, so
N, P₂O₅ and K₂O are computed from standard grades — Urea 46% N, DAP 18% N + 46% P₂O₅,
SSP 16% P₂O₅, MOP 60% K₂O. Because options 1 and 2 must supply the same nutrients, the
scraper derives both and compares them, which checks the grades as much as the data.
Worked example — sorghum, irrigated rabi, Pune, Medium soil:

| Option | Fertilizers (kg/ha) | N | P₂O₅ | K₂O |
|---|---|---|---|---|
| 1 | DAP 86.96 + MOP 66.67 + Urea 139.89 | 80.0 | 40.0 | 40.0 |
| 2 | SSP 250.00 + MOP 66.67 + Urea 173.91 | 80.0 | 40.0 | 40.0 |

**Read `Data_Flag` before using a row.** 7,901 of the 41,070 rows carry one; **17,273
inorganic rows have clean, unflagged N/P/K** (median 53.2 kg N, 50.0 kg P₂O₅, 39.9 kg
K₂O per hectare).

| Flag | Rows | Meaning |
|---|---|---|
| `dose is per plant/tree` | 7,729 | orchard and plantation crops are quoted per plant or per tree; without a planting density there is no per-hectare figure, so N/P/K are left blank and the published quantity kept |
| `implausible per-hectare dose` | 114 | derived nutrients above 1,000 kg/ha — no real recommendation approaches that, so these are per-plant figures the portal has labelled per-hectare. Sapota in Sangli reads 5,782 kg/ha DAP |
| `incomplete: no P2O5 source published` | 18 | the portal's option 2 omits the phosphorus source option 1 supplies (sesame, one sugarcane, safflower). Use option 1 |
| `options differ by N kg/ha` | 35 | 2.9–12.7 kg/ha gaps from the portal's own rounding when it back-computes urea. Harmless |

**Organic and natural farming.** Organic rows give FYM, compost, vermicompost, oil cake
and bio-fertilizers per crop. Natural-farming rows (the portal's `naturalFarming` mode)
give practice recommendations — pre-kharif green manuring, basal Ghanjeevamrit, liquid
Jeevamrit, cropping system, mulching, seed treatment — with the purpose of each. Neither
varies with the soil test, so both are emitted once per crop with `Soil_Class` blank.

One crop/district pair, banana in Hingoli, has organic guidance but no inorganic dose
published at all.

---

## 7. Crops — district level, 2022-23

`maharashtra_crops_apy_2022-23.csv` — 1,000 rows, 34 districts, 25 crops, seasons
Kharif / Rabi / Summer / Whole Year, with the district's soil type joined on.

Source: [DES Area–Production–Yield](https://data.desagri.gov.in/website/crops-apy-report-web),
the official APY series. Area in hectares, production in tonnes, yield in t/ha; cotton
and jute are conventionally reported in bales.

Largest crops by area: soyabean 4.92 M ha, cotton (lint) 4.24 M ha, gram 2.93 M ha,
rice 1.69 M ha, jowar 1.51 M ha, sugarcane 1.49 M ha.

> **Why this is not taluka-wise, and not 2025-26.** Two independent blockers, neither
> fixable by scraping harder:
>
> 1. **Granularity** — DES publishes APY at district level only. There is no
>    tehsil/block crop series. The Maharashtra State Data Bank is district-level and
>    stops at 2011-12; the DES "Selected Zone/Tehsil/District block" category holds the
>    *sampling design* file for the cost-of-cultivation scheme, not crop statistics.
> 2. **Vintage** — the DES portal offers crop years 1997 through 2022 and nothing
>    later; this was confirmed against the live portal. District figures are compiled
>    by state statistics offices years in arrears. For 2025-26 only state-level Advance
>    Estimates exist, with no district or taluka breakdown.
>
> So 2022-23 at district level is the finest and newest crop data that exists. Join it
> to the taluka files by district, not by taluka.

---

## 8. Known limitations

| # | Limitation | Where it bites |
|---|---|---|
| 1 | Crop data is 2022-23 and district-level | §7 — cannot be joined to talukas or to the 2025-26 weather year |
| 2 | Weather grid (~55 km) is coarser than a taluka (~30 km) | §3 — adjacent talukas share a series |
| 3 | Laterite under-detected in Konkan | §4 — Ratnagiri, Sindhudurg read as red / mountain |
| 4 | Fertilizer doses depend on the soil test | §6 — a row is only valid for its `Soil_Class` |
| 5 | 7,901 fertilizer rows carry a `Data_Flag` | §6 — per-plant doses, implausible per-hectare values, and incomplete combinations are flagged, not corrected. Filter on the column |
| 6 | 7 urban talukas have no soil nutrient data | §2 — left unjoined rather than imputed |
| 7 | Soil type is a map snapshot, not a survey of the current year | §4 — it has no vintage to align with 2025-26 |
| 8 | Fertilizer recommendations are district-level and undated | §6 — they are current portal guidance, not a 2025-26 time series |

---

## 9. Reproducing

```bash
# weather, taluka level, agricultural year 2025-26
python3 weather_scraper.py --state MAHARASHTRA --level taluka \
    --start 2025-04-01 --end 2026-03-31

# soil type, taluka level
python3 soil_type_scraper.py --state MAHARASHTRA --level taluka

# soil nutrients, all parameters, names aligned so the files join
python3 scraper.py --state MAHARASHTRA --cycle 2025-26 --include-micro --align-talukas

# fertilizer recommendations, all districts and crops
python3 fertilizer_scraper.py --state MAHARASHTRA

# crops (district level, latest published year)
python3 crop_scraper.py --state MAHARASHTRA
```

Geocoding and soil-map sampling are cached in `output/taluka_coords.json` and
`output/taluka_soil_types.json`, so re-runs skip straight to the data.

---

## 10. Sources

| Dataset | Portal | Department |
|---|---|---|
| Weather | [power.larc.nasa.gov](https://power.larc.nasa.gov/) | NASA Langley Research Center |
| Soil type | [bhoomigeoportal-nbsslup.in](https://bhoomigeoportal-nbsslup.in/) | ICAR-NBSS&LUP |
| Soil nutrients | [soilhealth.dac.gov.in](https://soilhealth.dac.gov.in/nutrient-dashboard) | Dept. of Agriculture & Farmers Welfare |
| Fertilizer recommendations | [soilhealth.dac.gov.in](https://soilhealth.dac.gov.in/fertilizer-recommendation) | Dept. of Agriculture & Farmers Welfare |
| Crops | [data.desagri.gov.in](https://data.desagri.gov.in/website/crops-apy-report-web) | Directorate of Economics & Statistics |
| Taluka / district registry, centroids | Soil Health portal; [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/) | — |
