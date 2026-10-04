"""Decide honestly whether the new soil model replaces the old one.

The two headline numbers are not comparable and must not be set side by side:

    old   0.949 macro-F1, measured by running a finished model over images
    new   0.891 macro-F1, measured by 5-fold grouped cross-validation

The second is the harder measurement. Each of its folds trains on roughly 314
scenes, while the old model was fitted on 3,532 images and is merely being
*evaluated* here. Comparing them directly would flatter the incumbent for
having had more data, which is a fact about the datasets rather than about the
models.

So this compares both on **exactly the same photographs**: the subset that the
old model has never seen, where the new model's prediction is its held-out
out-of-fold one. Same images, both predictions genuinely out of sample.

The verdict uses McNemar's test, which is the right test for two classifiers on
one sample — it looks only at the images where they disagree, since the ones
they both get right or both get wrong carry no evidence either way. A tie goes
to the incumbent: replacing a shipped model needs a reason, and "numerically
ahead by less than noise" is not one.

Usage:
    python ML/compare_soil_models.py
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import scipy.fftpack as fftpack
import torch
from PIL import Image
from scipy.stats import binomtest
from sklearn.metrics import f1_score
from torchvision import transforms

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "ml" / "data" / "soil_v2" / "manifest.json"
NEW = ROOT / "ML" / "models" / "soil_v2"
OLD = ROOT / "ML" / "models"
OLD_DATA = ROOT / "ml" / "data" / "soil"
PARKED_OLD_DATA = ROOT / "no_now" / "ml" / "data" / "soil"

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tif", ".tiff"}

TO_OLD_CLASS = {"Alluvial soil": "alluvial", "Black Soil": "black",
                "Clay soil": "clay", "Red soil": "red"}


def dihedral_phash(image: Image.Image, side: int = 8) -> np.ndarray:
    grey = np.asarray(image.convert("L").resize((32, 32), Image.LANCZOS), dtype=float)
    candidates = []
    for turns in range(4):
        rotated = np.rot90(grey, turns)
        for oriented in (rotated, np.fliplr(rotated)):
            coefficients = fftpack.dct(
                fftpack.dct(oriented.T, norm="ortho").T, norm="ortho")[:side, :side]
            candidates.append((coefficients > np.median(coefficients[1:, 1:]))
                              .flatten().astype(np.uint8))
    smallest = min(range(len(candidates)),
                   key=lambda i: int("".join(map(str, candidates[i])), 2))
    return candidates[smallest]


def memorised_by_old(records, old_data: Path, hamming: int) -> np.ndarray:
    """Which of these photographs are already inside the old model's folds."""
    if not old_data.is_dir():
        print(f"  (old training set not found at {old_data}; treating all as unseen)")
        return np.zeros(len(records), dtype=bool)

    paths = [p for p in old_data.rglob("*")
             if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES]
    print(f"  hashing {len(paths)} old training images ...", flush=True)
    hashes = []
    for path in paths:
        try:
            with Image.open(path) as image:
                hashes.append(dihedral_phash(image))
        except Exception:                                # noqa: BLE001
            continue
    old = np.stack(hashes)

    seen = np.zeros(len(records), dtype=bool)
    for i, record in enumerate(records):
        with Image.open(record["path"]) as image:
            seen[i] = bool(((old != dihedral_phash(image)).sum(1) <= hamming).any())
    return seen


def old_model_predictions(records, classes) -> list[str]:
    """The shipped model's answer for every image, restricted to these classes."""
    from torchvision import models as tv

    metadata = json.loads((OLD / "soil_metadata.json").read_text())
    old_classes = list(metadata["classes"])
    size = int(metadata.get("image_size", 224))
    temperature = float(metadata.get("temperature", 1.0))

    model = tv.efficientnet_b0(weights=None)
    features = model.classifier[1].in_features
    model.classifier = torch.nn.Sequential(
        torch.nn.Dropout(0.3), torch.nn.Linear(features, len(old_classes)))
    model.load_state_dict(torch.load(OLD / "soil_model.pth", map_location="cpu"))
    model.eval()

    normalize = metadata.get("normalize", {})
    prepare = transforms.Compose([
        transforms.Resize(int(size * 1.14)), transforms.CenterCrop(size),
        transforms.ToTensor(),
        transforms.Normalize(normalize.get("mean", [0.485, 0.456, 0.406]),
                             normalize.get("std", [0.229, 0.224, 0.225]))])

    columns = [old_classes.index(TO_OLD_CLASS[c]) for c in classes]
    out = []
    with torch.no_grad():
        for record in records:
            with Image.open(record["path"]) as handle:
                image = handle.convert("RGB")
            tensor = prepare(image).unsqueeze(0)
            logits = (model(tensor) + model(torch.flip(tensor, dims=[3]))) / 2
            logits = (logits / max(temperature, 1e-3))[0]
            out.append(classes[int(np.argmax(logits[columns].numpy()))])
    return out


def mcnemar(a_correct: np.ndarray, b_correct: np.ndarray) -> dict:
    """Exact McNemar: only the images the two models disagree on carry evidence."""
    b_only = int((~a_correct & b_correct).sum())      # new right, old wrong
    a_only = int((a_correct & ~b_correct).sum())      # old right, new wrong
    n = a_only + b_only
    p = 1.0 if n == 0 else binomtest(b_only, n, 0.5).pvalue
    return {"old_right_new_wrong": a_only, "new_right_old_wrong": b_only,
            "discordant": n, "p_value": float(p)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hamming", type=int, default=6)
    args = parser.parse_args()

    manifest = json.loads(MANIFEST.read_text())
    classes = manifest["classes"]
    records = manifest["records"]

    oof = json.loads((NEW / "out_of_fold.json").read_text())
    new_meta = json.loads((NEW / "soil_metadata.json").read_text())
    arm = new_meta.get("arm", new_meta["architecture"])
    by_path = {row["path"]: row for row in oof[arm]}

    print(f"new model : {arm}  (CV macro-F1 {new_meta['cv_macro_f1_mean']:.3f})")
    print(f"old model : {json.loads((OLD / 'soil_metadata.json').read_text())['architecture']}")
    print("\nfinding which images the old model was trained on ...", flush=True)
    old_data = OLD_DATA if OLD_DATA.is_dir() else PARKED_OLD_DATA
    seen = memorised_by_old(records, old_data, args.hamming)
    print(f"  {int(seen.sum())} of {len(records)} "
          f"({seen.mean():.1%}) are inside its training folds")

    print("\nrunning the old model over every image ...", flush=True)
    old_pred = old_model_predictions(records, classes)

    truth = np.array([r["label"] for r in records])
    old = np.array(old_pred)
    new = np.array([by_path[r["path"]]["predicted"] for r in records])

    results = {}
    for name, mask in (("all images", np.ones(len(records), dtype=bool)),
                       ("UNSEEN by the old model", ~seen)):
        t, o, n = truth[mask], old[mask], new[mask]
        old_f1 = f1_score(t, o, average="macro", labels=classes, zero_division=0)
        new_f1 = f1_score(t, n, average="macro", labels=classes, zero_division=0)
        test = mcnemar(o == t, n == t)
        results[name] = {"images": int(mask.sum()), "old_macro_f1": float(old_f1),
                         "new_macro_f1": float(new_f1), "mcnemar": test}

        print(f"\n--- {name}: {int(mask.sum())} images ---")
        print(f"  old  macro-F1 {old_f1:.3f}   accuracy {(o == t).mean():.3f}")
        print(f"  new  macro-F1 {new_f1:.3f}   accuracy {(n == t).mean():.3f}")
        print(f"  difference    {new_f1 - old_f1:+.3f}")
        print(f"  McNemar: old right/new wrong {test['old_right_new_wrong']}, "
              f"new right/old wrong {test['new_right_old_wrong']}, "
              f"p = {test['p_value']:.4g}")

    decisive = results["UNSEEN by the old model"]
    wins = (decisive["new_macro_f1"] > decisive["old_macro_f1"]
            and decisive["mcnemar"]["p_value"] < 0.05)
    verdict = ("REPLACE — the new model wins on images neither has seen"
               if wins else
               "KEEP THE OLD MODEL — the new one does not win on equal footing")

    print(f"\n{'=' * 66}\n{verdict}\n{'=' * 66}")
    if not wins:
        print("A tie goes to the model already shipped. Replacing one needs a")
        print("reason, and being behind — or ahead by less than noise — is not one.")

    out = NEW / "head_to_head.json"
    out.write_text(json.dumps({
        "new_arm": arm, "hamming_threshold": args.hamming,
        "memorised_by_old": int(seen.sum()), "of": len(records),
        "results": results, "replace": bool(wins), "verdict": verdict,
        "note": ("Both models are measured on the same photographs. The new "
                 "model's prediction is its held-out out-of-fold one; the old "
                 "model's images are ones it never trained on. The CV figure "
                 "and the old model's evaluation figure are not comparable "
                 "directly, because the old model was fitted on 3,532 images "
                 "and this data yields 393 scenes."),
    }, indent=2))
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
