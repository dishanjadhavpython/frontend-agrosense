"""Score the shipped 8-class soil model on the owner's field photographs.

Replacing a model needs something to replace it *against*, and the 0.906 in
`soil_metadata.json` cannot serve: it was measured on web images under a split
that let augmented copies of one photograph sit on both sides of a fold
boundary, and four of its eight classes are not Maharashtra soils.

Scoring it on the owner's data instead looked clean — the two sets share no
file, by MD5 — and produced 0.949. That number is wrong, and this script exists
to show why. A perceptual hash finds that **133 of the 644 images, 20.7%, are
already in the old model's training folds** at a different compression:
`Copy of Sample10.90.jpg` is `fold0/val/alluvial/alluvial_0031.jpg` at Hamming
distance zero. The old model is not transferring to this data, it is reciting a
fifth of it.

So three numbers are reported, and only the third supports a decision:

    all       every image, the flattering and meaningless figure
    seen      the images it memorised, which is what inflates `all`
    unseen    the images it has genuinely never encountered

`unseen` is the bar a challenger has to clear. Logits are restricted to the
four classes the new data labels, which can only help the incumbent — it can no
longer lose a soil to cinder or peat.

Usage:
    python ML/score_old_soil_model.py
    python ML/score_old_soil_model.py --hamming 6
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import scipy.fftpack as fftpack
import torch
from PIL import Image
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from torchvision import transforms

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "ml" / "data" / "soil_v2" / "manifest.json"
OLD_MODELS = ROOT / "ML" / "models"
OLD_DATA = ROOT / "ml" / "data" / "soil"

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tif", ".tiff"}

#: The owner's folder names against the old model's class labels.
TO_OLD_CLASS = {
    "Alluvial soil": "alluvial",
    "Black Soil": "black",
    "Clay soil": "clay",
    "Red soil": "red",
}


def dihedral_phash(image: Image.Image, side: int = 8) -> np.ndarray:
    """Same hash `prepare_soil_v2.py` groups scenes with, so the two agree."""
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


def build_backbone(architecture: str, num_classes: int):
    from torchvision import models as tv

    if architecture == "efficientnet_b0":
        model = tv.efficientnet_b0(weights=None)
        in_features = model.classifier[1].in_features
        model.classifier = torch.nn.Sequential(
            torch.nn.Dropout(0.3), torch.nn.Linear(in_features, num_classes))
        return model
    if architecture == "resnet18":
        model = tv.resnet18(weights=None)
        model.fc = torch.nn.Sequential(
            torch.nn.Dropout(0.3), torch.nn.Linear(model.fc.in_features, num_classes))
        return model
    raise SystemExit(f"unknown architecture: {architecture}")


def find_memorised(records: list[dict], old_data: Path, hamming: int) -> np.ndarray:
    """Which of the new images the old model has already been trained on."""
    old_paths = [p for p in old_data.rglob("*")
                 if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES]
    print(f"hashing {len(old_paths)} images of the old training set ...", flush=True)
    old_hashes = []
    for path in old_paths:
        try:
            with Image.open(path) as image:
                old_hashes.append(dihedral_phash(image))
        except Exception:                                # noqa: BLE001 - skip unreadable
            continue
    old = np.stack(old_hashes)

    print(f"hashing {len(records)} images of the new data ...", flush=True)
    seen = np.zeros(len(records), dtype=bool)
    for i, record in enumerate(records):
        with Image.open(record["path"]) as image:
            bits = dihedral_phash(image)
        seen[i] = bool(((old != bits).sum(1) <= hamming).any())
    return seen


def report(name: str, truth: np.ndarray, predicted: np.ndarray,
           classes: list[str]) -> dict:
    if not len(truth):
        print(f"\n--- {name}: no images ---")
        return {}
    macro_f1 = f1_score(truth, predicted, average="macro", zero_division=0)
    accuracy = float((truth == predicted).mean())
    print(f"\n--- {name}: {len(truth)} images ---")
    print(f"  macro-F1 {macro_f1:.3f}   accuracy {accuracy:.3f}")
    present = sorted(set(truth.tolist()))
    print(classification_report(truth, predicted, labels=present,
                                target_names=[classes[i] for i in present],
                                zero_division=0))
    return {
        "images": int(len(truth)),
        "macro_f1": float(macro_f1),
        "accuracy": accuracy,
        "confusion": confusion_matrix(truth, predicted,
                                      labels=list(range(len(classes)))).tolist(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    parser.add_argument("--models", type=Path, default=OLD_MODELS)
    parser.add_argument("--old-data", type=Path, default=OLD_DATA)
    parser.add_argument("--hamming", type=int, default=6)
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text())
    metadata = json.loads((args.models / "soil_metadata.json").read_text())
    old_classes = list(metadata["classes"])
    architecture = str(metadata.get("architecture", "efficientnet_b0"))
    temperature = float(metadata.get("temperature", 1.0))
    size = int(metadata.get("image_size", 224))

    model = build_backbone(architecture, len(old_classes))
    model.load_state_dict(torch.load(args.models / "soil_model.pth", map_location="cpu"))
    model.eval()

    records = manifest["records"]
    new_classes = manifest["classes"]
    columns = [old_classes.index(TO_OLD_CLASS[name]) for name in new_classes]

    normalize = metadata.get("normalize", {})
    prepare = transforms.Compose([
        transforms.Resize(int(size * 1.14)),
        transforms.CenterCrop(size),
        transforms.ToTensor(),
        transforms.Normalize(normalize.get("mean", [0.485, 0.456, 0.406]),
                             normalize.get("std", [0.229, 0.224, 0.225])),
    ])

    memorised = (find_memorised(records, args.old_data, args.hamming)
                 if args.old_data.is_dir()
                 else np.zeros(len(records), dtype=bool))

    truth, predicted, unrestricted = [], [], []
    with torch.no_grad():
        for record in records:
            with Image.open(record["path"]) as handle:
                image = handle.convert("RGB")
            tensor = prepare(image).unsqueeze(0)
            logits = (model(tensor) + model(torch.flip(tensor, dims=[3]))) / 2
            logits = (logits / max(temperature, 1e-3))[0]
            truth.append(new_classes.index(record["label"]))
            predicted.append(int(np.argmax(logits[columns].numpy())))
            unrestricted.append(old_classes[int(logits.argmax())])

    truth, predicted = np.array(truth), np.array(predicted)
    share = memorised.mean() if len(memorised) else 0.0
    print(f"\n{'=' * 62}")
    print(f"old model: {architecture}, {len(old_classes)} classes, "
          f"restricted to the {len(new_classes)} this data labels")
    print(f"already in its training folds: {int(memorised.sum())} / {len(truth)} "
          f"= {share:.1%}")
    print("=" * 62)

    results = {
        "all": report("all images (inflated by the memorised fifth)",
                      truth, predicted, new_classes),
        "seen": report("SEEN — images the old model was trained on",
                       truth[memorised], predicted[memorised], new_classes),
        "unseen": report("UNSEEN — the honest baseline a challenger must beat",
                         truth[~memorised], predicted[~memorised], new_classes),
    }

    counts: dict[str, int] = {}
    for name in unrestricted:
        counts[name] = counts.get(name, 0) + 1
    print("\nunrestricted (all 8 classes) on this Maharashtra data:")
    for name, count in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"  {name:<12}{count:>5}  {count / len(unrestricted):>6.1%}")

    out = args.models / "soil_v2" / "baseline_old_model.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "architecture": architecture,
        "old_classes": old_classes,
        "restricted_to": new_classes,
        "hamming_threshold": args.hamming,
        "memorised_images": int(memorised.sum()),
        "memorised_share": float(share),
        "scores": results,
        "unrestricted_prediction_share": {
            k: v / len(unrestricted) for k, v in counts.items()},
        "note": (
            "The old model shares no file with this dataset by MD5, which is why "
            "the contamination was invisible at first. A dihedral perceptual hash "
            "finds a fifth of these images inside its training folds at a "
            "different compression. Only the 'unseen' score is a baseline."),
    }, indent=2))
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
