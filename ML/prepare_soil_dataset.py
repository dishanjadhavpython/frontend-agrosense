"""Turn `4 soils in use/` into something a model can honestly be trained on.

Three things happen here, in this order, and the order is the whole point.

**De-duplicate.** The source folder holds 1717 files and 818 unique images. 882
of those files are byte-identical copies sitting in *both* `Train` and `test` —
for Cinder, Laterite and Peat, every single training image also appears in the
test set. A model evaluated on that split is being asked to recognise pictures
it memorised, and it will score near-perfect while having learned nothing. So
the supplied split is discarded entirely; it cannot be repaired, only replaced.

**Split.** Stratified k-fold over the unique pool. Not a single hold-out: the
rare classes have 28-30 unique images, so a single 80/20 split leaves six
validation images and one image is worth 16.7 points of recall. K-fold puts
every image in validation exactly once and lets the result carry a standard
deviation instead of pretending to a precision it does not have.

**Augment — after splitting, never before.** Balancing every class up to the
majority count is what makes the loss function stop ignoring Cinder. But if
images were generated before the split, a flipped copy of a training photo
would land in validation and the leakage of step one would be rebuilt by hand.
So generation runs per fold, over that fold's training images only, and writes
into that fold's train directory alone.

What augmentation cannot do is worth stating where the code does it: turning 23
Laterite photographs into 234 produces 234 correlated variations of 23 scenes,
not 234 samples. It corrects the class balance. It does not create diversity,
and the model can still learn those 23 backgrounds.

Usage:
    python -m ml.prepare_soil_dataset --folds 5 --out ml/data/soil
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import shutil
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent.parent

#: Where the soil images live. The folder was renamed from "4 soils in use"
#: once it grew past four classes; the old name is kept as a fallback so an
#: older checkout still builds.
SOURCE_CANDIDATES = [
    ROOT / "data set of the project",
    ROOT / "4 soils in use",
]


def _source() -> Path:
    for candidate in SOURCE_CANDIDATES:
        if (candidate / "Train").is_dir():
            return candidate
    raise SystemExit(
        "Soil image dataset not found. Expected a folder with Train/ and test/ "
        f"subdirectories at one of: {[str(c) for c in SOURCE_CANDIDATES]}"
    )


SOURCE = _source()
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

#: Folder name in the dataset -> the key `src/data/soils.ts` uses. Keeping the
#: join explicit means a renamed folder fails loudly instead of silently
#: training a class the UI cannot render.
CLASS_TO_KEY = {
    "Alluvial soil": "alluvial",
    "Black Soil": "black",
    "Cinder Soil": "cinder",
    "Clay soil": "clay",
    "Laterite Soil": "laterite",
    "Peat Soil": "peat",
    "Red soil": "red",
    "Yellow Soil": "yellow",
}


# --------------------------------------------------------------------------
# De-duplication
# --------------------------------------------------------------------------


def exact_hash(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()


def perceptual_hash(path: Path) -> str | None:
    """A 16x16 average hash, which catches re-encodes and resizes that MD5
    misses. Soil is a flat texture and will collide occasionally, so this is
    only ever used to *remove* a near-duplicate — a false positive costs one
    image, while a false negative costs the integrity of the split."""
    try:
        with Image.open(path) as image:
            grey = image.convert("L").resize((16, 16), Image.LANCZOS)
        pixels = np.asarray(grey, dtype=np.float32)
        return (pixels > pixels.mean()).tobytes().hex()
    except Exception:
        return None


def collect_unique() -> tuple[dict[str, list[Path]], dict[str, int]]:
    """Every unique image, keyed by class. Returns (images, duplicates removed)."""
    by_class: dict[str, list[Path]] = defaultdict(list)
    removed: dict[str, int] = defaultdict(int)

    for class_dir_name, key in CLASS_TO_KEY.items():
        seen_exact: set[str] = set()
        seen_perceptual: set[str] = set()

        # Both supplied splits are pooled. The boundary between them is not
        # information — it is the thing that was wrong.
        candidates: list[Path] = []
        for split in ("Train", "test"):
            directory = SOURCE / split / class_dir_name
            if directory.is_dir():
                candidates.extend(
                    p
                    for p in sorted(directory.iterdir())
                    if p.suffix.lower() in IMAGE_SUFFIXES
                )

        for path in candidates:
            digest = exact_hash(path)
            if digest in seen_exact:
                removed[key] += 1
                continue
            seen_exact.add(digest)

            phash = perceptual_hash(path)
            if phash is None:
                removed[key] += 1  # unreadable
                continue
            if phash in seen_perceptual:
                removed[key] += 1
                continue
            seen_perceptual.add(phash)

            by_class[key].append(path)

    return by_class, removed


# --------------------------------------------------------------------------
# Augmentation
# --------------------------------------------------------------------------


def augment(image: Image.Image, rng: random.Random) -> Image.Image:
    """One randomised variation.

    Weighted towards photometric change rather than geometric. Two photographs
    of the same soil differ mostly by light, camera and white balance; they
    rarely differ by being upside down, and a model that has only ever seen
    rotations of one scene has not learned much about soil.
    """
    out = image

    if rng.random() < 0.5:
        out = out.transpose(Image.FLIP_LEFT_RIGHT)
    if rng.random() < 0.2:
        out = out.transpose(Image.FLIP_TOP_BOTTOM)

    if rng.random() < 0.7:
        out = out.rotate(rng.uniform(-25, 25), resample=Image.BICUBIC, expand=False)

    # Random resized crop: the strongest single augmentation for texture.
    if rng.random() < 0.8:
        scale = rng.uniform(0.7, 1.0)
        width, height = out.size
        crop_w, crop_h = int(width * scale), int(height * scale)
        left = rng.randint(0, max(0, width - crop_w))
        top = rng.randint(0, max(0, height - crop_h))
        out = out.crop((left, top, left + crop_w, top + crop_h))

    for enhancer, spread, chance in (
        (ImageEnhance.Brightness, 0.35, 0.8),
        (ImageEnhance.Contrast, 0.35, 0.8),
        (ImageEnhance.Color, 0.40, 0.7),
        (ImageEnhance.Sharpness, 0.50, 0.3),
    ):
        if rng.random() < chance:
            out = enhancer(out).enhance(1.0 + rng.uniform(-spread, spread))

    if rng.random() < 0.25:
        out = out.filter(ImageFilter.GaussianBlur(rng.uniform(0.3, 1.2)))

    if rng.random() < 0.25:
        pixels = np.asarray(out, dtype=np.float32)
        pixels += np.random.normal(0, rng.uniform(3, 10), pixels.shape)
        out = Image.fromarray(np.clip(pixels, 0, 255).astype(np.uint8))

    return out


def save(image: Image.Image, path: Path, quality: int = 90) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(path, "JPEG", quality=quality)


# --------------------------------------------------------------------------
# Build
# --------------------------------------------------------------------------


def build(folds: int, out_dir: Path, seed: int, size: int) -> dict:
    rng = random.Random(seed)
    np.random.seed(seed)

    by_class, removed = collect_unique()
    keys = sorted(by_class)

    print("De-duplication")
    print(f"  {'class':<12}{'unique':>8}{'removed':>9}")
    for key in keys:
        print(f"  {key:<12}{len(by_class[key]):>8}{removed[key]:>9}")
    total_unique = sum(len(v) for v in by_class.values())
    print(f"  {'TOTAL':<12}{total_unique:>8}{sum(removed.values()):>9}\n")

    # Stratified folds: shuffle within a class, then deal round-robin, so each
    # fold gets as near an equal share of every class as the count allows.
    fold_of: dict[Path, int] = {}
    for key in keys:
        paths = list(by_class[key])
        rng.shuffle(paths)
        for index, path in enumerate(paths):
            fold_of[path] = index % folds

    if out_dir.exists():
        shutil.rmtree(out_dir)

    manifest: dict = {
        "classes": keys,
        "folds": folds,
        "seed": seed,
        "image_size": size,
        "unique_images": total_unique,
        "duplicates_removed": sum(removed.values()),
        "per_class_unique": {k: len(by_class[k]) for k in keys},
        "fold_detail": [],
    }

    for fold in range(folds):
        train_paths: dict[str, list[Path]] = {k: [] for k in keys}
        val_paths: dict[str, list[Path]] = {k: [] for k in keys}
        for key in keys:
            for path in by_class[key]:
                (val_paths if fold_of[path] == fold else train_paths)[key].append(path)

        fold_dir = out_dir / f"fold{fold}"

        # Validation: real images only. Never augmented, never balanced — it has
        # to look like what arrives from a phone, not like the training set.
        for key in keys:
            for i, path in enumerate(val_paths[key]):
                with Image.open(path) as image:
                    save(_fit(image, size), fold_dir / "val" / key / f"{key}_{i:04d}.jpg")

        # Training: the real images, then augmented copies up to the majority
        # count. Generated strictly from this fold's own training images.
        target = max(len(train_paths[k]) for k in keys)
        detail = {"fold": fold, "target_per_class": target, "classes": {}}

        for key in keys:
            originals = train_paths[key]
            destination = fold_dir / "train" / key

            for i, path in enumerate(originals):
                with Image.open(path) as image:
                    save(_fit(image, size), destination / f"{key}_{i:04d}.jpg")

            needed = max(0, target - len(originals))
            for j in range(needed):
                source = originals[j % len(originals)]
                with Image.open(source) as image:
                    variant = augment(_fit(image, size), rng)
                save(variant, destination / f"{key}_aug{j:05d}.jpg")

            detail["classes"][key] = {
                "real": len(originals),
                "augmented": needed,
                "val": len(val_paths[key]),
            }

        manifest["fold_detail"].append(detail)
        summary = ", ".join(
            f"{k}:{detail['classes'][k]['real']}+{detail['classes'][k]['augmented']}"
            for k in keys
        )
        print(f"fold {fold}: target {target} per class | {summary}")

    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"\nWrote {out_dir}")
    return manifest


def _fit(image: Image.Image, size: int) -> Image.Image:
    """Shorter side to `size`, centre-cropped square. Done once here so training
    reads uniform files and does not resize 2000 images every epoch."""
    image = image.convert("RGB")
    width, height = image.size
    scale = size / min(width, height)
    image = image.resize((max(size, int(width * scale)), max(size, int(height * scale))), Image.LANCZOS)
    width, height = image.size
    left, top = (width - size) // 2, (height - size) // 2
    return image.crop((left, top, left + size, top + size))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--folds", type=int, default=5)
    parser.add_argument("--out", type=Path, default=ROOT / "ml" / "data" / "soil")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--size", type=int, default=256, help="stored size; trained at 224")
    args = parser.parse_args()

    if not SOURCE.is_dir():
        raise SystemExit(f"Source dataset not found: {SOURCE}")

    build(args.folds, args.out, args.seed, args.size)


if __name__ == "__main__":
    main()
