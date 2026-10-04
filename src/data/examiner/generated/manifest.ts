// GENERATED — do not edit by hand.
// Written by scripts/build-examiner-data.mjs. Re-run `npm run data:examiner`
// after retraining. `npm run check:examiner` fails the build if a source file
// on disk no longer matches the hash recorded here.
//
// Sources:
//   ML/models/soil_v2/soil_metadata.json
//     sha256 49fb8dc95eeeabc7 · 4814 bytes · 2026-10-03
//   ML/data/soil_v2/manifest.json
//     sha256 86cefad3fb9f0c19 · 381220 bytes · 2026-10-03
//   ML/models/soil_v2/out_of_fold.json
//     sha256 cc7a6bae789c5615 · 440141 bytes · 2026-10-03
//   ML/models/soil_metadata.json
//     sha256 8f3419bed7eb974a · 4903 bytes · 2026-10-03
//   ML/models/legacy_8class/soil_metadata.json
//     sha256 0589f17784292ee1 · 4453 bytes · 2026-08-08
//   ML/models/soil_v2_4class/soil_metadata.json
//     sha256 de20fa1b0aa64302 · 5770 bytes · 2026-09-12
//   ML/models/crop_metadata.json
//     sha256 9b893e2a752964b0 · 2200 bytes · 2026-08-25
//   ML/models/fertilizer_metadata.json
//     sha256 daad5c23cb51176c · 2432 bytes · 2026-08-25
//   ml engine for Recommendation/artifacts/model_selection.json
//     sha256 01e6e2010495f057 · 1780 bytes · 2026-09-12
//   ml engine for Recommendation/artifacts/scorecard_latest.json
//     sha256 c18974e4aedabf36 · 1701 bytes · 2026-09-12
//   ml engine for Recommendation/reports/scorecard_history.csv
//     sha256 e4dfaf00253b799a · 777 bytes · 2026-09-12
//   ml engine for Recommendation/artifacts/s3_regimes.csv
//     sha256 465e9df96ff1701c · 484 bytes · 2026-08-28
//   ml engine for Recommendation/reports/scorecard.md
//     sha256 d3c1adc1d4853678 · 9682 bytes · 2026-09-12
//   ml engine for Recommendation/reports/benchmark_results.md
//     sha256 e32409f6638e4e29 · 9526 bytes · 2026-08-26
//   ml engine for Recommendation/reports/gate_validation.md
//     sha256 c717e27599ff9efa · 4213 bytes · 2026-08-28
//   ml engine for Recommendation/reports/experiments.md
//     sha256 150fb167ab0e9d28 · 6622 bytes · 2026-08-26
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

import type { SourceFile } from "../types";

/** Every artifact this walkthrough was generated from, and its state on disk. */
export const SOURCE_FILES = [
  {
    "path": "ML/models/soil_v2/soil_metadata.json",
    "exists": true,
    "bytes": 4814,
    "sha256": "49fb8dc95eeeabc7",
    "modified": "2026-10-03"
  },
  {
    "path": "ML/data/soil_v2/manifest.json",
    "exists": true,
    "bytes": 381220,
    "sha256": "86cefad3fb9f0c19",
    "modified": "2026-10-03"
  },
  {
    "path": "ML/models/soil_v2/out_of_fold.json",
    "exists": true,
    "bytes": 440141,
    "sha256": "cc7a6bae789c5615",
    "modified": "2026-10-03"
  },
  {
    "path": "ML/models/soil_metadata.json",
    "exists": true,
    "bytes": 4903,
    "sha256": "8f3419bed7eb974a",
    "modified": "2026-10-03"
  },
  {
    "path": "ML/models/legacy_8class/soil_metadata.json",
    "exists": true,
    "bytes": 4453,
    "sha256": "0589f17784292ee1",
    "modified": "2026-08-08"
  },
  {
    "path": "ML/models/soil_v2_4class/soil_metadata.json",
    "exists": true,
    "bytes": 5770,
    "sha256": "de20fa1b0aa64302",
    "modified": "2026-09-12"
  },
  {
    "path": "ML/models/crop_metadata.json",
    "exists": true,
    "bytes": 2200,
    "sha256": "9b893e2a752964b0",
    "modified": "2026-08-25"
  },
  {
    "path": "ML/models/fertilizer_metadata.json",
    "exists": true,
    "bytes": 2432,
    "sha256": "daad5c23cb51176c",
    "modified": "2026-08-25"
  },
  {
    "path": "ml engine for Recommendation/artifacts/model_selection.json",
    "exists": true,
    "bytes": 1780,
    "sha256": "01e6e2010495f057",
    "modified": "2026-09-12"
  },
  {
    "path": "ml engine for Recommendation/artifacts/scorecard_latest.json",
    "exists": true,
    "bytes": 1701,
    "sha256": "c18974e4aedabf36",
    "modified": "2026-09-12"
  },
  {
    "path": "ml engine for Recommendation/reports/scorecard_history.csv",
    "exists": true,
    "bytes": 777,
    "sha256": "e4dfaf00253b799a",
    "modified": "2026-09-12"
  },
  {
    "path": "ml engine for Recommendation/artifacts/s3_regimes.csv",
    "exists": true,
    "bytes": 484,
    "sha256": "465e9df96ff1701c",
    "modified": "2026-08-28"
  },
  {
    "path": "ml engine for Recommendation/reports/scorecard.md",
    "exists": true,
    "bytes": 9682,
    "sha256": "d3c1adc1d4853678",
    "modified": "2026-09-12"
  },
  {
    "path": "ml engine for Recommendation/reports/benchmark_results.md",
    "exists": true,
    "bytes": 9526,
    "sha256": "e32409f6638e4e29",
    "modified": "2026-08-26"
  },
  {
    "path": "ml engine for Recommendation/reports/gate_validation.md",
    "exists": true,
    "bytes": 4213,
    "sha256": "c717e27599ff9efa",
    "modified": "2026-08-28"
  },
  {
    "path": "ml engine for Recommendation/reports/experiments.md",
    "exists": true,
    "bytes": 6622,
    "sha256": "150fb167ab0e9d28",
    "modified": "2026-08-26"
  },
  {
    "path": "scrape data imp/output/maharashtra_all_parameters_2023-24_talukas.csv",
    "exists": true,
    "bytes": 93368,
    "sha256": "e683e8bf69307d37",
    "modified": "2026-08-26"
  },
  {
    "path": "scrape data imp/output/maharashtra_all_parameters_2024-25_talukas.csv",
    "exists": true,
    "bytes": 97400,
    "sha256": "d86aa9acfa7b03e6",
    "modified": "2026-08-26"
  },
  {
    "path": "scrape data imp/output/maharashtra_all_parameters_2025-26_talukas.csv",
    "exists": true,
    "bytes": 98710,
    "sha256": "572663d77917c537",
    "modified": "2026-08-10"
  },
  {
    "path": "scrape data imp/output/maharashtra_crops_apy_2015-16.csv",
    "exists": true,
    "bytes": 171567,
    "sha256": "d4f0a79a838900d2",
    "modified": "2026-08-26"
  },
  {
    "path": "scrape data imp/output/maharashtra_crops_apy_2019-20.csv",
    "exists": true,
    "bytes": 188013,
    "sha256": "ddd6e39f034d5b98",
    "modified": "2026-08-26"
  },
  {
    "path": "scrape data imp/output/maharashtra_crops_apy_2021-22.csv",
    "exists": true,
    "bytes": 211078,
    "sha256": "2d74526c300016af",
    "modified": "2026-08-26"
  },
  {
    "path": "scrape data imp/output/maharashtra_daily_weather_taluka_2023-04-01_to_2024-03-31.csv",
    "exists": true,
    "bytes": 8928567,
    "sha256": "b45cf2ad9b56de2d",
    "modified": "2026-08-26"
  },
  {
    "path": "scrape data imp/output/maharashtra_daily_weather_taluka_2024-04-01_to_2025-03-31.csv",
    "exists": true,
    "bytes": 8906723,
    "sha256": "93b1d542e07ec6f3",
    "modified": "2026-08-26"
  },
  {
    "path": "scrape data imp/output/maharashtra_fertilizer_recommendations.csv",
    "exists": true,
    "bytes": 6371383,
    "sha256": "3aa9aff893f04d27",
    "modified": "2026-08-10"
  },
  {
    "path": "scrape data imp/output/maharashtra_soil_type_talukas.csv",
    "exists": true,
    "bytes": 58666,
    "sha256": "ee999a49a0d98ead",
    "modified": "2026-08-10"
  }
] as const satisfies readonly SourceFile[];

export const GENERATED_AT = "2026-10-03";
