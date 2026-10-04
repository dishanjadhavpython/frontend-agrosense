// GENERATED — do not edit by hand.
// Written by scripts/build-examiner-data.mjs. Re-run `npm run data:examiner`
// after retraining. `npm run check:examiner` fails the build if a source file
// on disk no longer matches the hash recorded here.
//
// Sources:
//   scrape data imp/output/maharashtra_all_parameters_2023-24_talukas.csv
//     sha256 e683e8bf69307d37 · 93368 bytes · 2026-08-26
//   scrape data imp/output/maharashtra_all_parameters_2024-25_talukas.csv
//     sha256 d86aa9acfa7b03e6 · 97400 bytes · 2026-08-26
//   scrape data imp/output/maharashtra_all_parameters_2025-26_talukas.csv
//     sha256 572663d77917c537 · 98710 bytes · 2026-08-10
//   scrape data imp/output/maharashtra_crops_apy_2015-16.csv
//     sha256 d4f0a79a838900d2 · 171567 bytes · 2026-08-26
//   scrape data imp/output/maharashtra_crops_apy_2019-20.csv
//     sha256 ddd6e39f034d5b98 · 188013 bytes · 2026-08-26
//   scrape data imp/output/maharashtra_crops_apy_2021-22.csv
//     sha256 2d74526c300016af · 211078 bytes · 2026-08-26
//   scrape data imp/output/maharashtra_daily_weather_taluka_2023-04-01_to_2024-03-31.csv
//     sha256 b45cf2ad9b56de2d · 8928567 bytes · 2026-08-26
//   scrape data imp/output/maharashtra_daily_weather_taluka_2024-04-01_to_2025-03-31.csv
//     sha256 93b1d542e07ec6f3 · 8906723 bytes · 2026-08-26
//   scrape data imp/output/maharashtra_fertilizer_recommendations.csv
//     sha256 3aa9aff893f04d27 · 6371383 bytes · 2026-08-10
//   scrape data imp/output/maharashtra_soil_type_talukas.csv
//     sha256 ee999a49a0d98ead · 58666 bytes · 2026-08-10

import type { ScrapedFile } from "../types";

export const SCRAPED_FILES = [
  {
    "group": "Soil Health Card",
    "period": "2023-24",
    "path": "scrape data imp/output/maharashtra_all_parameters_2023-24_talukas.csv",
    "name": "maharashtra_all_parameters_2023-24_talukas.csv",
    "rows": 347,
    "columns": 46,
    "bytes": 93368,
    "headers": [
      "State",
      "District",
      "Taluka",
      "Cycle",
      "Scheme",
      "Nitrogen_N_Low_pct"
    ]
  },
  {
    "group": "Soil Health Card",
    "period": "2024-25",
    "path": "scrape data imp/output/maharashtra_all_parameters_2024-25_talukas.csv",
    "name": "maharashtra_all_parameters_2024-25_talukas.csv",
    "rows": 350,
    "columns": 46,
    "bytes": 97400,
    "headers": [
      "State",
      "District",
      "Taluka",
      "Cycle",
      "Scheme",
      "Nitrogen_N_Low_pct"
    ]
  },
  {
    "group": "Soil Health Card",
    "period": "2025-26",
    "path": "scrape data imp/output/maharashtra_all_parameters_2025-26_talukas.csv",
    "name": "maharashtra_all_parameters_2025-26_talukas.csv",
    "rows": 351,
    "columns": 46,
    "bytes": 98710,
    "headers": [
      "State",
      "District",
      "Taluka",
      "Cycle",
      "Scheme",
      "Nitrogen_N_Low_pct"
    ]
  },
  {
    "group": "Crop statistics",
    "period": "2015-16",
    "path": "scrape data imp/output/maharashtra_crops_apy_2015-16.csv",
    "name": "maharashtra_crops_apy_2015-16.csv",
    "rows": 817,
    "columns": 22,
    "bytes": 171567,
    "headers": [
      "State",
      "District",
      "Year",
      "Crop",
      "Season",
      "Area"
    ]
  },
  {
    "group": "Crop statistics",
    "period": "2019-20",
    "path": "scrape data imp/output/maharashtra_crops_apy_2019-20.csv",
    "name": "maharashtra_crops_apy_2019-20.csv",
    "rows": 895,
    "columns": 22,
    "bytes": 188013,
    "headers": [
      "State",
      "District",
      "Year",
      "Crop",
      "Season",
      "Area"
    ]
  },
  {
    "group": "Crop statistics",
    "period": "2021-22",
    "path": "scrape data imp/output/maharashtra_crops_apy_2021-22.csv",
    "name": "maharashtra_crops_apy_2021-22.csv",
    "rows": 1001,
    "columns": 22,
    "bytes": 211078,
    "headers": [
      "State",
      "District",
      "Year",
      "Crop",
      "Season",
      "Area"
    ]
  },
  {
    "group": "Daily weather",
    "period": "2023-24",
    "path": "scrape data imp/output/maharashtra_daily_weather_taluka_2023-04-01_to_2024-03-31.csv",
    "name": "maharashtra_daily_weather_taluka_2023-04-01_to_2024-03-31.csv",
    "rows": 131028,
    "columns": 9,
    "bytes": 8928567,
    "headers": [
      "Date",
      "Taluka",
      "District",
      "State",
      "Max_temperature",
      "Min_temperature"
    ]
  },
  {
    "group": "Daily weather",
    "period": "2024-25",
    "path": "scrape data imp/output/maharashtra_daily_weather_taluka_2024-04-01_to_2025-03-31.csv",
    "name": "maharashtra_daily_weather_taluka_2024-04-01_to_2025-03-31.csv",
    "rows": 130670,
    "columns": 9,
    "bytes": 8906723,
    "headers": [
      "Date",
      "Taluka",
      "District",
      "State",
      "Max_temperature",
      "Min_temperature"
    ]
  },
  {
    "group": "Fertiliser recommendations",
    "period": "current",
    "path": "scrape data imp/output/maharashtra_fertilizer_recommendations.csv",
    "name": "maharashtra_fertilizer_recommendations.csv",
    "rows": 41070,
    "columns": 21,
    "bytes": 6371383,
    "headers": [
      "State",
      "District",
      "Crop",
      "Crop_Variety",
      "Crop_Irrigation",
      "Crop_Season"
    ]
  },
  {
    "group": "Soil type",
    "period": "current",
    "path": "scrape data imp/output/maharashtra_soil_type_talukas.csv",
    "name": "maharashtra_soil_type_talukas.csv",
    "rows": 358,
    "columns": 16,
    "bytes": 58666,
    "headers": [
      "State",
      "District",
      "Taluka",
      "Soil_Type",
      "Soil_Type_Share_pct",
      "Soil_Type_Secondary"
    ]
  }
] as const satisfies readonly ScrapedFile[];

/** Rows per dataset family, summed over the files sampled above. */
export const SCRAPED_TOTALS = {
  "Soil Health Card": 1048,
  "Crop statistics": 2713,
  "Daily weather": 261698,
  "Fertiliser recommendations": 41070,
  "Soil type": 358
};
