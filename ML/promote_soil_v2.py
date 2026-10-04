"""Promote the `soil_v2` winner into `ML/models/`, where the backend serves it.

`train_soil_v2.py` labels classes by the dataset's folder names (`Black Soil`),
while `backend/models.py`, `backend/soil_crop_suitability.py` and the fertilizer
mapping key on slugs (`black`). Promotion rewrites every label to its slug so
the serving side needs no change. The checkpoint being replaced is moved to
`ML/models/legacy_8class/` first, so a rollback is a copy back.

Usage:
    python ML/promote_soil_v2.py
"""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / "ML" / "models"
CHALLENGER = MODELS / "soil_v2"
LEGACY = MODELS / "legacy_8class"
FILES = ("soil_model.pth", "soil_metadata.json", "soil_classes.json")


def slug(label: str) -> str:
    """`Black Soil` -> `black`, the same rule as the engine's soil_fusion.normalise."""
    return re.sub(r"[^a-z]+", " ", label.lower()).replace("soil", "").strip()


def main() -> None:
    metadata = json.loads((CHALLENGER / "soil_metadata.json").read_text())
    slugs = [slug(c) for c in metadata["classes"]]
    if len(set(slugs)) != len(slugs):
        raise SystemExit(f"labels collide after slugging: {metadata['classes']}")

    if not LEGACY.exists():
        LEGACY.mkdir()
        for name in FILES:
            if (MODELS / name).exists():
                shutil.move(MODELS / name, LEGACY / name)
        print(f"moved the previous serving model to {LEGACY}")

    metadata["display_names"] = dict(zip(slugs, metadata["classes"]))
    metadata["classes"] = slugs
    metadata["per_class_recall"] = {slug(k): v for k, v in metadata["per_class_recall"].items()}
    metadata["survey_vocabulary"] = {slug(k): v for k, v in metadata["survey_vocabulary"].items()}
    for entry in metadata.get("comparison", []):
        entry["classes"] = [slug(c) for c in entry.get("classes", [])]

    shutil.copy2(CHALLENGER / "soil_model.pth", MODELS / "soil_model.pth")
    (MODELS / "soil_metadata.json").write_text(json.dumps(metadata, indent=2))
    (MODELS / "soil_classes.json").write_text(json.dumps(slugs, indent=2))
    print(f"promoted {metadata['architecture']} ({len(slugs)} classes, "
          f"CV macro-F1 {metadata['cv_macro_f1_mean']:.3f}) -> {MODELS}")


if __name__ == "__main__":
    main()
