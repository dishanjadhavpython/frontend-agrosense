#!/usr/bin/env bash
# Copy what the recommendation engine needs from the app tree into its own
# build context, before `docker build` of the engine image.
#
# The engine's soil fusion weighs a soil photograph by the serving classifier's
# confusion matrix (ML/models/soil_metadata.json). Locally it reads that file
# from beside the engine; in a container the app tree is not there, so the file
# travels inside the image and AGROSENSE_SOIL_MODEL_META points at it. Run this
# whenever the soil classifier is promoted, or fusion would weigh photos by the
# errors of a model no request runs.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
src="$root/ML/models/soil_metadata.json"
dst="$root/ml engine for Recommendation/artifacts/soil_classifier_metadata.json"
test -f "$src" || { echo "missing $src — promote a soil model first" >&2; exit 1; }
cp "$src" "$dst"
echo "copied $(basename "$src") -> artifacts/$(basename "$dst")"
