"""Build leakage-free grouped folds from the project's eight-class soil photos.

`data set of the project` cannot be trained on as delivered. Its own Train/test
split is not a split: 68 of its 700 scene groups have the same photograph on
both sides, so any score measured against that split is partly measuring
memorisation. This script rebuilds the split from scratch.

What it removes, in order:

1. **Exact duplicates.** 2,575 files collapse to 1,674 distinct images by MD5;
   901 are byte-for-byte copies, mostly `Copy of X.jpg` beside `X.jpg`.
2. **Near-duplicates.** One photograph rotated and saved several times, or
   burst frames of one soil patch, differ by a few bits of nothing. A perceptual
   hash taken as the **minimum over the eight dihedral transforms** gives a
   rotated or mirrored copy the same hash as its original, and images within
   `--hamming` bits of each other are unioned into one group. Filename stems
   are unioned too, but only inside one class and never for bare numbers.
3. **Label conflicts.** 7 groups carry the same pixels under two different
   soil labels (four Alluvial/Clay, two Laterite/Red, one Alluvial/Black). One
   label of each pair is wrong and there is no way to tell which, so the whole
   group is dropped rather than guessed at.

The surviving 1,651 images in 700 groups are split with `StratifiedGroupKFold`,
so every copy, rotation and burst-frame of one scene lands in exactly one fold.
This is the difference between a real score and the 0.906 the previous model
reported on folds built without grouping.

Nothing is copied. The folds are written as a manifest of paths, which avoids
duplicating images on disk the way the old `prepare_soil_dataset.py` did, and
makes the fold assignment auditable after the fact.

Usage:
    python ML/prepare_soil_v2.py
    python ML/prepare_soil_v2.py --hamming 6 --folds 5
    python ML/prepare_soil_v2.py --classes "Alluvial soil" "Black Soil"
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import re
import time
from pathlib import Path

import numpy as np
import scipy.fftpack as fftpack
from PIL import Image
from sklearn.model_selection import StratifiedGroupKFold

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SRC = ROOT / "data set of the project"
OUT = ROOT / "ml" / "data" / "soil_v2"

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tif", ".tiff"}

#: All eight classes in the project dataset. The earlier `4 soils in use` folder
#: populated only four of them; this one carries 150-520 training images per
#: class, so every directory is a live class.
CLASSES_IN_USE = (
    "Alluvial soil", "Black Soil", "Cinder Soil", "Clay soil",
    "Laterite Soil", "Peat Soil", "Red soil", "Yellow Soil",
)

#: How a predicted class maps onto the engine's Maharashtra survey vocabulary
#: (`Black (Regur)`, `Red & Yellow`, `Laterite`, `Alluvial`, `Saline/Alkaline`,
#: `Mountain/Forest`). Clay is a *texture*, not a soil order, so it has no
#: survey counterpart: fusion may read it as a texture signal but must never
#: treat it as a vote for a surveyed soil type. Cinder and peat are not
#: Maharashtra soils, so they cast no vote either.
SURVEY_VOCABULARY = {
    "Alluvial soil": "Alluvial",
    "Black Soil": "Black (Regur)",
    "Laterite Soil": "Laterite",
    "Red soil": "Red & Yellow",
    "Yellow Soil": "Red & Yellow",
    "Clay soil": None,
    "Cinder Soil": None,
    "Peat Soil": None,
}


def image_paths(src: Path, classes: tuple[str, ...]) -> list[Path]:
    """Every image under `src` whose class directory is one we train on."""
    keep = set(classes)
    out = []
    for path in sorted(src.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        parts = path.relative_to(src).parts
        if len(parts) >= 2 and parts[1] in keep:
            out.append(path)
    return out


def class_of(path: Path, src: Path) -> str:
    return path.relative_to(src).parts[1]


def dihedral_phash(image: Image.Image, side: int = 8) -> np.ndarray:
    """A 64-bit DCT perceptual hash, canonicalised over the dihedral group.

    Hashing all eight rotations/flips and keeping the numerically smallest means
    a rotated copy and its original produce identical bits, which is exactly the
    `Sample9.0 / .90 / .180` case this dataset is full of.
    """
    grey = np.asarray(image.convert("L").resize((32, 32), Image.LANCZOS), dtype=float)
    candidates = []
    for turns in range(4):
        rotated = np.rot90(grey, turns)
        for oriented in (rotated, np.fliplr(rotated)):
            coefficients = fftpack.dct(
                fftpack.dct(oriented.T, norm="ortho").T, norm="ortho"
            )[:side, :side]
            median = np.median(coefficients[1:, 1:])
            candidates.append((coefficients > median).flatten().astype(np.uint8))
    smallest = min(range(len(candidates)),
                   key=lambda i: int("".join(map(str, candidates[i])), 2))
    return candidates[smallest]


def normalised_stem(path: Path) -> str | None:
    """`Copy of Sample9.90` and `Sample9` collapse to the same key.

    The perceptual hash catches most of these already; the filename catches the
    ones where a copy was also re-cropped, which changes the pixels enough to
    clear the Hamming threshold while still being the same photograph.

    A purely numeric stem returns None. Cinder, Laterite, Peat and Yellow are
    each numbered `1.jpg` upwards, so `Cinder Soil/21.jpg` and `Peat Soil/21.jpg`
    share a name while sitting 24-30 pHash bits apart: different photographs.
    Grouping on such names fused unrelated images and then discarded them as
    label conflicts.
    """
    stem = re.sub(r"^Copy of ", "", path.stem)
    stem = re.sub(r"\.\d+$", "", stem)          # Sample9.90 -> Sample9
    stem = re.sub(r"[-_ ]?\(\d+\)$", "", stem)  # image (1)  -> image
    stem = stem.strip().lower()
    return None if stem.isdigit() else stem


class UnionFind:
    def __init__(self, n: int):
        self.parent = list(range(n))

    def find(self, x: int) -> int:
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a: int, b: int) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[ra] = rb


def build(src: Path, classes: tuple[str, ...], hamming: int, folds: int, seed: int) -> dict:
    paths = image_paths(src, classes)
    print(f"{len(paths)} image files across {len(classes)} classes")

    # --- 1. exact duplicates -------------------------------------------------
    by_digest: dict[str, list[Path]] = collections.defaultdict(list)
    for path in paths:
        by_digest[hashlib.md5(path.read_bytes()).hexdigest()].append(path)
    representatives = [sorted(group)[0] for group in by_digest.values()]
    print(f"  {len(representatives)} distinct by MD5 "
          f"({len(paths) - len(representatives)} exact copies removed)")

    # --- 2. near duplicates --------------------------------------------------
    hashes = {}
    for path in representatives:
        with Image.open(path) as image:
            hashes[path] = dihedral_phash(image)
    order = list(hashes)
    matrix = np.stack([hashes[p] for p in order])
    distance = (matrix[:, None, :] != matrix[None, :, :]).sum(2)

    union = UnionFind(len(order))
    rows, columns = np.where(np.triu(distance <= hamming, 1))
    for a, b in zip(rows, columns):
        union.union(int(a), int(b))

    # Names are only evidence inside one class directory. Across classes, a
    # shared name is a coincidence unless the pixels agree, and the hash above
    # has already unioned every pair whose pixels do.
    by_stem: dict[tuple[str, str], list[int]] = collections.defaultdict(list)
    for index, path in enumerate(order):
        stem = normalised_stem(path)
        if stem is not None:
            by_stem[(class_of(path, src), stem)].append(index)
    for indices in by_stem.values():
        for other in indices[1:]:
            union.union(indices[0], other)

    groups: dict[int, list[Path]] = collections.defaultdict(list)
    for index, path in enumerate(order):
        groups[union.find(index)].append(path)
    print(f"  {len(groups)} distinct scenes after grouping "
          f"(pHash Hamming <= {hamming}, unioned with same-class filename stems)")

    # --- 3. label conflicts --------------------------------------------------
    kept, conflicts = {}, []
    for key, members in groups.items():
        labels = {class_of(p, src) for p in members}
        if len(labels) > 1:
            conflicts.append({"labels": sorted(labels),
                              "files": [p.relative_to(src).as_posix() for p in members]})
        else:
            kept[key] = members
    print(f"  {len(conflicts)} groups dropped: one image, two different soil labels")

    # --- 4. grouped, stratified folds ---------------------------------------
    records = []
    for key, members in kept.items():
        label = class_of(members[0], src)
        for path in members:
            records.append({"path": str(path), "label": label, "group": int(key)})

    labels = np.array([r["label"] for r in records])
    group_ids = np.array([r["group"] for r in records])
    splitter = StratifiedGroupKFold(n_splits=folds, shuffle=True, random_state=seed)
    for fold, (_, validation) in enumerate(splitter.split(records, labels, group_ids)):
        for index in validation:
            records[index]["fold"] = fold

    # How badly the delivered split leaks: scene groups with members on both
    # sides of it. Measured, not quoted, so it stays true for any source.
    sides = {key: {p.relative_to(src).parts[0] for p in members}
             for key, members in kept.items()}
    straddling = sum(len(s) > 1 for s in sides.values())
    print(f"  {straddling} of {len(kept)} scene groups straddle the delivered split")

    counts = collections.Counter(r["label"] for r in records)
    scenes = {name: len({r["group"] for r in records if r["label"] == name})
              for name in counts}
    print("\n  class            images   scenes")
    for name in sorted(counts):
        print(f"  {name:<16}{counts[name]:>7}{scenes[name]:>9}")

    print("\n  fold    " + "".join(f"{n.split()[0]:>11}" for n in sorted(counts)))
    for fold in range(folds):
        row = collections.Counter(r["label"] for r in records if r["fold"] == fold)
        print(f"  {fold:<8}" + "".join(f"{row.get(n, 0):>11}" for n in sorted(counts)))

    return {
        "source": str(src),
        "built_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "classes": sorted(counts),
        "survey_vocabulary": {k: v for k, v in SURVEY_VOCABULARY.items() if k in counts},
        "folds": folds,
        "hamming_threshold": hamming,
        "seed": seed,
        "files_scanned": len(paths),
        "distinct_by_md5": len(representatives),
        "distinct_scenes": len(groups),
        "dropped_label_conflicts": conflicts,
        "images_per_class": dict(counts),
        "scenes_per_class": scenes,
        "records": records,
        "groups_straddling_delivered_split": straddling,
        "note": (
            f"The delivered Train/test split shares {straddling} of {len(kept)} "
            "scene groups across both sides and cannot be used. These folds group every copy, "
            "rotation and burst-frame of one scene together, so a model is "
            "never validated on a photograph it has already seen."
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--src", type=Path, default=DEFAULT_SRC)
    parser.add_argument("--out", type=Path, default=OUT)
    parser.add_argument("--classes", nargs="+", default=list(CLASSES_IN_USE))
    parser.add_argument("--hamming", type=int, default=6,
                        help="pHash bits within which two images are one scene")
    parser.add_argument("--folds", type=int, default=5)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    if not args.src.is_dir():
        raise SystemExit(f"no such dataset: {args.src}")

    manifest = build(args.src, tuple(args.classes), args.hamming, args.folds, args.seed)
    args.out.mkdir(parents=True, exist_ok=True)
    target = args.out / "manifest.json"
    target.write_text(json.dumps(manifest, indent=2))
    print(f"\nwrote {target}")
    print(f"  {len(manifest['records'])} images, {manifest['distinct_scenes']} scenes, "
          f"{manifest['folds']} grouped folds")


if __name__ == "__main__":
    main()
