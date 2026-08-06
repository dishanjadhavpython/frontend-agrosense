# Quarantined — not imported by the running backend

These modules came from the earlier AWS deployment of AgroSense. They are kept because the
code is sound, but none of them can run in *this* repository: each depends on a file,
directory or credential that is not here. Nothing in `backend/` imports them.

Do not wire one back in without first satisfying its row below.

| Module | Needs before it can run again |
| --- | --- |
| `prediction.py` | Six model artifacts in `MODEL_DIR`: `soil_classes.pkl`, `crop_recommendation_xgb_model.pkl`, `label_encoder.pkl`, `fertilizer_xgb_model.pkl`, `scaler.pkl`, `target_label_encoder.pkl`, plus `custom_cnn_model.pth` and `Crop_recommendation.csv`. Also `torch`, `torchvision`, `pandas`, `boto3`. The notebooks that train these are in `ML/`. |
| `crop_economics.py` | `pricecrop/price.csv` (referenced by `PRICECROP_CSV_FILE`). The directory does not exist. |
| `clerk_auth.py` | `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`. The Next.js app has `@clerk/nextjs` as a dependency but no `ClerkProvider` yet, so auth is unwired on both sides. |
| `agents/` | `OPENAI_API_KEY`, the `openai-agents` SDK, and `YOUTUBE_API_KEY` for the research tool. Runs a scheduled report pipeline that nothing currently reads. |

The live backend deliberately does none of this. It reads a Soil Health Card, extracts the
twelve printed readings, scores them with the rule-based `prediction_engine.py`, and indexes
the document for retrieval — all in pure Python with no model artifacts.

See `../../BACKEND_PLAN.md` §4 for why each was set aside.
