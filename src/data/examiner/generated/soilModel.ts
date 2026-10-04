// GENERATED — do not edit by hand.
// Written by scripts/build-examiner-data.mjs. Re-run `npm run data:examiner`
// after retraining. `npm run check:examiner` fails the build if a source file
// on disk no longer matches the hash recorded here.
//
// Sources:
//   ML/models/soil_v2/soil_metadata.json
//     sha256 49fb8dc95eeeabc7 · 4814 bytes · 2026-10-03
//   ML/models/soil_v2/out_of_fold.json
//     sha256 cc7a6bae789c5615 · 440141 bytes · 2026-10-03
//   ML/models/soil_metadata.json
//     sha256 8f3419bed7eb974a · 4903 bytes · 2026-10-03
//   ML/models/legacy_8class/soil_metadata.json
//     sha256 0589f17784292ee1 · 4453 bytes · 2026-08-08
//   ML/models/soil_v2_4class/soil_metadata.json
//     sha256 de20fa1b0aa64302 · 5770 bytes · 2026-09-12
//   ML/data/soil_v2/manifest.json
//     sha256 86cefad3fb9f0c19 · 381220 bytes · 2026-10-03

import type { SoilModel } from "../types";

export const SOIL_MODEL = {
  "dataset": {
    "filesScanned": 2575,
    "distinctByMd5": 1674,
    "distinctScenes": 707,
    "hammingThreshold": 6,
    "droppedLabelConflicts": 7,
    "classes": [
      "Alluvial soil",
      "Black Soil",
      "Cinder Soil",
      "Clay soil",
      "Laterite Soil",
      "Peat Soil",
      "Red soil",
      "Yellow Soil"
    ],
    "surveyVocabulary": {
      "Alluvial soil": "Alluvial",
      "Black Soil": "Black (Regur)",
      "Laterite Soil": "Laterite",
      "Red soil": "Red & Yellow",
      "Yellow Soil": "Red & Yellow",
      "Clay soil": null,
      "Cinder Soil": null,
      "Peat Soil": null
    },
    "imagesPerClass": {
      "Alluvial soil": 288,
      "Black Soil": 120,
      "Cinder Soil": 223,
      "Clay soil": 115,
      "Laterite Soil": 266,
      "Peat Soil": 228,
      "Red soil": 155,
      "Yellow Soil": 256
    },
    "scenesPerClass": {
      "Alluvial soil": 104,
      "Black Soil": 110,
      "Cinder Soil": 79,
      "Clay soil": 75,
      "Laterite Soil": 75,
      "Peat Soil": 72,
      "Red soil": 114,
      "Yellow Soil": 71
    },
    "builtAt": "2026-10-03 13:43:15"
  },
  "protocol": "StratifiedGroupKFold over perceptual-hash scene groups, so no copy, rotation or burst-frame of a validation photograph appears in training. Resolution normalised and jittered, because file dimensions alone separated these classes at 0.387 against a 0.174 majority baseline before correction. Class-balanced sampling.",
  "folds": 5,
  "shippedFold": 3,
  "arms": [
    {
      "name": "efficientnet_b0",
      "macroF1": 0.7661,
      "macroF1Std": 0.0381,
      "perFold": [
        0.7415,
        0.7611,
        0.7808,
        0.8297,
        0.7174
      ],
      "accuracy": 0.7722,
      "ece": 0.0452,
      "temperature": 0.5247,
      "perClassRecall": {
        "Alluvial soil": 0.7849,
        "Black Soil": 0.7917,
        "Cinder Soil": 0.8653,
        "Clay soil": 0.9043,
        "Laterite Soil": 0.6425,
        "Peat Soil": 0.6028,
        "Red soil": 0.8839,
        "Yellow Soil": 0.8277
      },
      "checkpointBytes": 16239640,
      "chosen": true
    }
  ],
  "pooled": {
    "arm": "efficientnet_b0",
    "accuracy": 0.7723,
    "macroF1": 0.7698,
    "support": 1651,
    "classes": [
      {
        "label": "Alluvial soil",
        "precision": 0.8433,
        "recall": 0.7847,
        "f1": 0.8129,
        "support": 288
      },
      {
        "label": "Black Soil",
        "precision": 0.6786,
        "recall": 0.7917,
        "f1": 0.7308,
        "support": 120
      },
      {
        "label": "Cinder Soil",
        "precision": 0.9279,
        "recall": 0.8655,
        "f1": 0.8956,
        "support": 223
      },
      {
        "label": "Clay soil",
        "precision": 0.6842,
        "recall": 0.9043,
        "f1": 0.779,
        "support": 115
      },
      {
        "label": "Laterite Soil",
        "precision": 0.7066,
        "recall": 0.6429,
        "f1": 0.6732,
        "support": 266
      },
      {
        "label": "Peat Soil",
        "precision": 0.8839,
        "recall": 0.6009,
        "f1": 0.7154,
        "support": 228
      },
      {
        "label": "Red soil",
        "precision": 0.6716,
        "recall": 0.8839,
        "f1": 0.7632,
        "support": 155
      },
      {
        "label": "Yellow Soil",
        "precision": 0.7518,
        "recall": 0.8281,
        "f1": 0.7881,
        "support": 256
      }
    ],
    "confusion": [
      [
        226,
        12,
        4,
        26,
        2,
        0,
        15,
        3
      ],
      [
        10,
        95,
        2,
        3,
        2,
        3,
        2,
        3
      ],
      [
        0,
        8,
        193,
        8,
        7,
        4,
        1,
        2
      ],
      [
        7,
        0,
        0,
        104,
        0,
        0,
        0,
        4
      ],
      [
        2,
        3,
        4,
        1,
        171,
        6,
        36,
        43
      ],
      [
        1,
        14,
        5,
        4,
        49,
        137,
        4,
        14
      ],
      [
        3,
        1,
        0,
        1,
        9,
        3,
        137,
        1
      ],
      [
        19,
        7,
        0,
        5,
        2,
        2,
        9,
        212
      ]
    ],
    "meanConfidence": 0.759,
    "meanConfidenceCorrect": 0.8174,
    "meanConfidenceWrong": 0.5612,
    "confidenceBins": [
      {
        "from": 0,
        "to": 0.05,
        "correct": 0,
        "wrong": 0
      },
      {
        "from": 0.05,
        "to": 0.1,
        "correct": 0,
        "wrong": 0
      },
      {
        "from": 0.1,
        "to": 0.15,
        "correct": 0,
        "wrong": 0
      },
      {
        "from": 0.15,
        "to": 0.2,
        "correct": 0,
        "wrong": 0
      },
      {
        "from": 0.2,
        "to": 0.25,
        "correct": 4,
        "wrong": 8
      },
      {
        "from": 0.25,
        "to": 0.3,
        "correct": 10,
        "wrong": 20
      },
      {
        "from": 0.3,
        "to": 0.35,
        "correct": 19,
        "wrong": 33
      },
      {
        "from": 0.35,
        "to": 0.4,
        "correct": 22,
        "wrong": 27
      },
      {
        "from": 0.4,
        "to": 0.45,
        "correct": 31,
        "wrong": 40
      },
      {
        "from": 0.45,
        "to": 0.5,
        "correct": 42,
        "wrong": 41
      },
      {
        "from": 0.5,
        "to": 0.55,
        "correct": 47,
        "wrong": 29
      },
      {
        "from": 0.55,
        "to": 0.6,
        "correct": 42,
        "wrong": 32
      },
      {
        "from": 0.6,
        "to": 0.65,
        "correct": 42,
        "wrong": 23
      },
      {
        "from": 0.65,
        "to": 0.7,
        "correct": 57,
        "wrong": 30
      },
      {
        "from": 0.7,
        "to": 0.75,
        "correct": 68,
        "wrong": 18
      },
      {
        "from": 0.75,
        "to": 0.8,
        "correct": 52,
        "wrong": 16
      },
      {
        "from": 0.8,
        "to": 0.85,
        "correct": 88,
        "wrong": 19
      },
      {
        "from": 0.85,
        "to": 0.9,
        "correct": 116,
        "wrong": 15
      },
      {
        "from": 0.9,
        "to": 0.95,
        "correct": 185,
        "wrong": 13
      },
      {
        "from": 0.95,
        "to": 1,
        "correct": 450,
        "wrong": 12
      }
    ]
  },
  "promoted": true,
  "previous": {
    "architecture": "efficientnet_b0",
    "classes": 8,
    "reportedMacroF1": 0.9058,
    "reportedMacroF1Std": 0.0132
  },
  "fourClass": {
    "classes": 4,
    "scenes": 393,
    "macroF1": 0.8909,
    "macroF1Std": 0.0358
  },
  "sources": [
    "ML/models/soil_v2/soil_metadata.json",
    "ML/models/soil_v2/out_of_fold.json",
    "ML/models/soil_metadata.json",
    "ML/models/legacy_8class/soil_metadata.json",
    "ML/models/soil_v2_4class/soil_metadata.json",
    "ML/data/soil_v2/manifest.json"
  ]
} as const satisfies SoilModel;
