"""Train the eight-class soil classifier on the project's soil photographs.

Candidates are fine-tuned under one identical protocol — same folds, same
epochs, same augmentation, same schedule — because a comparison where the
candidates were trained differently measures the protocol, not the model. The
winner is chosen on cross-validated **macro-F1**, ties inside one standard
deviation going to the smaller checkpoint.

    efficientnet_b0        ImageNet initialisation
    resnet18               ImageNet initialisation
    efficientnet_b0_warm   initialised from the previous soil checkpoint
                           (opt-in, and refused on `data set of the project`)

The warm arm was worth having when this script trained on the separate
`4 soils in use` folder. The previous eight-class checkpoint was trained by
`prepare_soil_dataset.py` on `data set of the project` itself, so warm-starting
from it here would put validation photographs in the backbone's history and
inflate every fold score. Against that source it is refused rather than run.

Three things differ from `train_soil.py`, each because of something measured:

* **Folds come from a manifest.** The delivered Train/test split shares 68 of
  its 700 scene groups across both sides. `prepare_soil_v2.py` groups every
  copy, rotation and burst-frame of a scene so none of them straddle a boundary.

* **Resolution is normalised and jittered.** Cinder, Laterite, Peat and Yellow
  arrive almost entirely at 640x640, Alluvial at a median 1160x522, Black and Red
  at 275x190, so file dimensions alone predict the class at 0.387 against a
  0.174 majority baseline. Untreated, a network learns the source, not the soil.

* **Sampling is class-balanced.** Alluvial has 288 images to Clay's 115.

Out-of-fold predictions are written for every image, so the winner can be
compared against the old model on exactly the same photographs.

Usage:
    python ML/train_soil_v2.py --epochs 18
    python ML/train_soil_v2.py --architectures efficientnet_b0
"""

from __future__ import annotations

import argparse
import collections
import json
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler
from torchvision import models, transforms

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "ml" / "data" / "soil_v2" / "manifest.json"
OUT = ROOT / "ML" / "models" / "soil_v2"
OLD_CHECKPOINT = ROOT / "ML" / "models" / "soil_model.pth"
#: What `prepare_soil_dataset.py` trained OLD_CHECKPOINT on. Warm-starting from
#: it while validating on the same folder puts validation photographs in the
#: backbone's history, so the warm arm is refused against this source.
OLD_CHECKPOINT_SOURCE = ROOT / "data set of the project"

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]

ARCHITECTURES = ("efficientnet_b0", "resnet18")
WARM_ARMS = ("efficientnet_b0_warm",)


def family_of(architecture: str) -> str:
    """The backbone underneath an arm name. `_warm` changes the start, not the shape."""
    return architecture.removesuffix("_warm")


def device_of() -> torch.device:
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


# --------------------------------------------------------------------------
# Data
# --------------------------------------------------------------------------
class ResolutionJitter:
    """Randomly throw away detail, so sharpness cannot identify the class.

    These classes were photographed by different people with different
    equipment, and the resolution gap is large enough to be learnable on its
    own. Downscaling by a random factor and scaling straight back up destroys
    detail without touching framing or colour.
    """

    def __init__(self, probability: float = 0.5, worst: float = 0.35):
        self.probability, self.worst = probability, worst

    def __call__(self, image: Image.Image) -> Image.Image:
        if np.random.rand() > self.probability:
            return image
        scale = float(np.random.uniform(self.worst, 1.0))
        width, height = image.size
        small = image.resize((max(8, int(width * scale)), max(8, int(height * scale))),
                             Image.BILINEAR)
        return small.resize((width, height), Image.BILINEAR)


class ManifestDataset(Dataset):
    """Images named by the fold manifest, so grouping survives into training."""

    def __init__(self, records: list[dict], classes: list[str], transform):
        self.records, self.classes, self.transform = records, classes, transform
        self.index = {name: i for i, name in enumerate(classes)}

    def __len__(self) -> int:
        return len(self.records)

    def __getitem__(self, position: int):
        record = self.records[position]
        with Image.open(record["path"]) as handle:
            image = handle.convert("RGB")
        return self.transform(image), self.index[record["label"]]


def transforms_for(size: int):
    """Both pipelines put every image on one scale before anything else."""
    train = transforms.Compose([
        transforms.Resize(int(size * 1.14)),
        ResolutionJitter(probability=0.5, worst=0.35),
        transforms.RandomResizedCrop(size, scale=(0.6, 1.0)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomVerticalFlip(),       # soil has no canonical "up"
        transforms.ColorJitter(0.25, 0.25, 0.25, 0.04),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
        transforms.RandomErasing(p=0.25, scale=(0.02, 0.12)),
    ])
    evaluate = transforms.Compose([
        transforms.Resize(int(size * 1.14)),
        transforms.CenterCrop(size),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])
    return train, evaluate


def loaders(manifest: dict, fold: int, batch_size: int, size: int):
    classes = manifest["classes"]
    train_tf, eval_tf = transforms_for(size)
    train_records = [r for r in manifest["records"] if r["fold"] != fold]
    val_records = [r for r in manifest["records"] if r["fold"] == fold]

    counts = collections.Counter(r["label"] for r in train_records)
    weights = [1.0 / counts[r["label"]] for r in train_records]
    sampler = WeightedRandomSampler(weights, num_samples=len(train_records), replacement=True)

    return (
        DataLoader(ManifestDataset(train_records, classes, train_tf), batch_size=batch_size,
                   sampler=sampler, num_workers=0, drop_last=len(train_records) > batch_size),
        DataLoader(ManifestDataset(val_records, classes, eval_tf), batch_size=batch_size,
                   shuffle=False, num_workers=0),
        classes,
        val_records,
    )


# --------------------------------------------------------------------------
# Model
# --------------------------------------------------------------------------
def build_model(architecture: str, num_classes: int) -> nn.Module:
    family = family_of(architecture)
    warm = architecture.endswith("_warm")

    if family == "efficientnet_b0":
        model = models.efficientnet_b0(weights=models.EfficientNet_B0_Weights.IMAGENET1K_V1)
        in_features = model.classifier[1].in_features
        if warm:
            # Rebuild the old head so the checkpoint loads, then discard it: the
            # point of the warm start is the backbone, not the decision layer.
            old = json.loads((OLD_CHECKPOINT.parent / "soil_metadata.json").read_text())
            model.classifier = nn.Sequential(
                nn.Dropout(0.3), nn.Linear(in_features, len(old["classes"])))
            model.load_state_dict(torch.load(OLD_CHECKPOINT, map_location="cpu"))
        model.classifier = nn.Sequential(
            nn.Dropout(0.3, inplace=True), nn.Linear(in_features, num_classes))
        return model

    if family == "resnet18":
        model = models.resnet18(weights=models.ResNet18_Weights.IMAGENET1K_V1)
        model.fc = nn.Sequential(
            nn.Dropout(0.3, inplace=True), nn.Linear(model.fc.in_features, num_classes))
        return model

    raise ValueError(f"unknown architecture: {architecture}")


def backbone_stages(model: nn.Module, architecture: str) -> list[nn.Module]:
    if family_of(architecture) == "efficientnet_b0":
        return list(model.features)
    return [model.layer1, model.layer2, model.layer3, model.layer4]


def head_parameters(model: nn.Module, architecture: str):
    return (model.classifier.parameters()
            if family_of(architecture) == "efficientnet_b0" else model.fc.parameters())


def set_backbone_grad(model: nn.Module, architecture: str, *, unfrozen_blocks: int) -> None:
    stages = backbone_stages(model, architecture)
    for stage in stages:
        for parameter in stage.parameters():
            parameter.requires_grad = False
    if unfrozen_blocks > 0:
        for stage in stages[-unfrozen_blocks:]:
            for parameter in stage.parameters():
                parameter.requires_grad = True


def trainable_backbone_parameters(model: nn.Module, architecture: str):
    found = []
    for stage in backbone_stages(model, architecture):
        found.extend(p for p in stage.parameters() if p.requires_grad)
    return found


def mixup(x: torch.Tensor, y: torch.Tensor, alpha: float):
    if alpha <= 0:
        return x, y, y, 1.0
    lam = float(np.random.beta(alpha, alpha))
    index = torch.randperm(x.size(0), device=x.device)
    return lam * x + (1 - lam) * x[index], y, y[index], lam


@torch.no_grad()
def predict_logits(model: nn.Module, loader: DataLoader, device: torch.device, tta: bool):
    model.eval()
    logits_out, targets_out = [], []
    for images, targets in loader:
        images = images.to(device)
        logits = model(images)
        if tta:
            logits = (logits + model(torch.flip(images, dims=[3]))) / 2
        logits_out.append(logits.float().cpu())
        targets_out.append(targets)
    return torch.cat(logits_out), torch.cat(targets_out)


def fit_temperature(logits: torch.Tensor, targets: torch.Tensor) -> float:
    """One scalar dividing the logits, so the printed confidence means something."""
    log_t = torch.zeros(1, requires_grad=True)
    optimizer = torch.optim.LBFGS([log_t], lr=0.1, max_iter=60)

    def closure():
        optimizer.zero_grad()
        loss = F.cross_entropy(logits / log_t.exp(), targets)
        loss.backward()
        return loss

    optimizer.step(closure)
    return float(log_t.exp().item())


def expected_calibration_error(probabilities: np.ndarray, targets: np.ndarray,
                               bins: int = 10) -> float:
    confidence = probabilities.max(1)
    correct = (probabilities.argmax(1) == targets).astype(float)
    edges = np.linspace(0, 1, bins + 1)
    error = 0.0
    for low, high in zip(edges[:-1], edges[1:]):
        inside = (confidence > low) & (confidence <= high)
        if inside.sum():
            error += inside.mean() * abs(correct[inside].mean() - confidence[inside].mean())
    return float(error)


def run_fold(manifest: dict, fold: int, architecture: str, args, device) -> dict:
    train_loader, val_loader, classes, val_records = loaders(
        manifest, fold, args.batch_size, args.size)
    model = build_model(architecture, len(classes)).to(device)
    criterion = nn.CrossEntropyLoss(label_smoothing=args.label_smoothing)

    best = {"macro_f1": -1.0, "state": None, "epoch": -1}
    optimizer, scheduler = None, None

    for epoch in range(args.epochs):
        if epoch == 0:
            set_backbone_grad(model, architecture, unfrozen_blocks=0)
            optimizer = torch.optim.AdamW(head_parameters(model, architecture),
                                          lr=args.head_lr, weight_decay=args.weight_decay)
            scheduler = None
        elif epoch == args.warmup_epochs:
            set_backbone_grad(model, architecture, unfrozen_blocks=args.unfrozen_blocks)
            optimizer = torch.optim.AdamW([
                {"params": trainable_backbone_parameters(model, architecture),
                 "lr": args.backbone_lr},
                {"params": head_parameters(model, architecture), "lr": args.head_lr},
            ], weight_decay=args.weight_decay)
            scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
                optimizer, T_max=max(1, args.epochs - args.warmup_epochs))

        model.train()
        running, seen = 0.0, 0
        for images, targets in train_loader:
            images, targets = images.to(device), targets.to(device)
            mixed, y_a, y_b, lam = mixup(images, targets, args.mixup)
            optimizer.zero_grad()
            logits = model(mixed)
            loss = lam * criterion(logits, y_a) + (1 - lam) * criterion(logits, y_b)
            loss.backward()
            optimizer.step()
            running += loss.item() * images.size(0)
            seen += images.size(0)

        if scheduler is not None:
            scheduler.step()

        logits, targets = predict_logits(model, val_loader, device, tta=args.tta)
        predictions = logits.argmax(1)
        macro_f1 = f1_score(targets, predictions, average="macro", zero_division=0)
        print(f"    epoch {epoch:>2}  loss {running/max(seen,1):.3f}  macro-F1 {macro_f1:.3f}  "
              f"acc {(predictions == targets).float().mean().item():.3f}")

        if macro_f1 > best["macro_f1"]:
            best = {"macro_f1": macro_f1,
                    "state": {k: v.detach().cpu().clone() for k, v in model.state_dict().items()},
                    "epoch": epoch}

    model.load_state_dict(best["state"])
    logits, targets = predict_logits(model, val_loader, device, tta=args.tta)
    temperature = fit_temperature(logits, targets)
    predictions = logits.argmax(1)
    probabilities = torch.softmax(logits / max(temperature, 1e-3), dim=1).numpy()

    # One row per held-out image, so the winner can be set against the old model
    # on exactly the same photographs rather than across two protocols.
    out_of_fold = [
        {"path": record["path"], "group": record["group"], "truth": record["label"],
         "predicted": classes[int(p)], "confidence": float(probabilities[i].max())}
        for i, (record, p) in enumerate(zip(val_records, predictions.tolist()))
    ]

    return {
        "classes": classes,
        "macro_f1": best["macro_f1"],
        "accuracy": float((predictions == targets).float().mean()),
        "best_epoch": best["epoch"],
        "temperature": temperature,
        "ece": expected_calibration_error(probabilities, targets.numpy()),
        "report": classification_report(targets, predictions, target_names=classes,
                                        output_dict=True, zero_division=0),
        "confusion": confusion_matrix(targets, predictions,
                                      labels=list(range(len(classes)))).tolist(),
        "out_of_fold": out_of_fold,
        "state": best["state"],
    }


def evaluate(manifest: dict, architecture: str, args, device) -> dict:
    print(f"\n{'=' * 62}\n{architecture}\n{'=' * 62}")
    folds = []
    for fold in range(manifest["folds"]):
        print(f"  fold {fold}")
        folds.append(run_fold(manifest, fold, architecture, args, device))

    macro = np.array([f["macro_f1"] for f in folds])
    accuracy = np.array([f["accuracy"] for f in folds])
    classes = folds[0]["classes"]
    best_index = int(macro.argmax())

    print(f"\n  {architecture}: macro-F1 {macro.mean():.3f} +/- {macro.std():.3f} "
          f"| accuracy {accuracy.mean():.3f} +/- {accuracy.std():.3f}")

    out_of_fold = [row for f in folds for row in f["out_of_fold"]]
    # Pooled over every held-out image, not one fold's: Phase 8 reads this as a
    # likelihood, so it needs the whole panel.
    pooled = np.sum([np.array(f["confusion"]) for f in folds], axis=0)

    return {
        "architecture": architecture,
        "classes": classes,
        "macro_f1_mean": float(macro.mean()),
        "macro_f1_std": float(macro.std()),
        "macro_f1_per_fold": [float(x) for x in macro],
        "accuracy_mean": float(accuracy.mean()),
        "accuracy_std": float(accuracy.std()),
        "ece_mean": float(np.mean([f["ece"] for f in folds])),
        "per_class_recall": {
            name: float(np.mean([f["report"][name]["recall"] for f in folds]))
            for name in classes},
        "per_class_recall_std": {
            name: float(np.std([f["report"][name]["recall"] for f in folds]))
            for name in classes},
        "best_fold": best_index,
        "best_fold_macro_f1": float(macro[best_index]),
        "temperature": folds[best_index]["temperature"],
        "confusion_pooled": pooled.tolist(),
        "out_of_fold": out_of_fold,
        "state": folds[best_index]["state"],
    }


def choose(results: list[dict]) -> dict:
    """Best macro-F1; a tie inside one standard deviation goes to the smaller model."""
    ranked = sorted(results, key=lambda r: r["macro_f1_mean"], reverse=True)
    leader = ranked[0]
    margin = leader["macro_f1_std"]
    contenders = [r for r in ranked if leader["macro_f1_mean"] - r["macro_f1_mean"] <= margin]
    if len(contenders) > 1:
        winner = min(contenders, key=lambda r: r["checkpoint_bytes"])
        if winner is not leader:
            print(f"\n{leader['architecture']} leads by "
                  f"{leader['macro_f1_mean'] - winner['macro_f1_mean']:.3f} macro-F1, inside its "
                  f"own std of {margin:.3f}. Taking {winner['architecture']} — same result "
                  f"within noise, {leader['checkpoint_bytes'] // 1_000_000} MB -> "
                  f"{winner['checkpoint_bytes'] // 1_000_000} MB.")
        return winner
    return leader


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    parser.add_argument("--out", type=Path, default=OUT)
    parser.add_argument("--epochs", type=int, default=18)
    parser.add_argument("--warmup-epochs", type=int, default=2)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--size", type=int, default=224)
    parser.add_argument("--head-lr", type=float, default=1e-3)
    parser.add_argument("--backbone-lr", type=float, default=1e-5)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--label-smoothing", type=float, default=0.08)
    parser.add_argument("--mixup", type=float, default=0.2)
    parser.add_argument("--unfrozen-blocks", type=int, default=3)
    parser.add_argument("--tta", action="store_true", default=True)
    parser.add_argument("--architectures", nargs="+", default=list(ARCHITECTURES),
                        choices=ARCHITECTURES + WARM_ARMS)
    args = parser.parse_args()

    if not args.manifest.exists():
        raise SystemExit(f"missing {args.manifest} — run ML/prepare_soil_v2.py first")
    manifest = json.loads(args.manifest.read_text())
    if (any(a in WARM_ARMS for a in args.architectures)
            and Path(manifest["source"]).resolve() == OLD_CHECKPOINT_SOURCE.resolve()):
        raise SystemExit("the warm arm starts from a checkpoint trained on this same "
                         "folder; its fold scores would include memorised photographs")

    device = device_of()
    print(f"device: {device}")
    print(f"data:   {len(manifest['records'])} images, {manifest['distinct_scenes']} scenes, "
          f"{manifest['folds']} grouped folds")
    print(f"classes: {', '.join(manifest['classes'])}")
    print(f"candidates: {', '.join(args.architectures)}", flush=True)
    args.out.mkdir(parents=True, exist_ok=True)

    started = time.time()
    results = []
    for architecture in args.architectures:
        result = evaluate(manifest, architecture, args, device)
        result["checkpoint_bytes"] = sum(t.numel() * t.element_size()
                                         for t in result["state"].values())
        results.append(result)

    classes = results[0]["classes"]
    print(f"\n{'=' * 62}\nComparison\n{'=' * 62}")
    print(f"{'architecture':<24}{'macro-F1':>18}{'accuracy':>18}{'ECE':>8}{'size':>10}")
    for result in sorted(results, key=lambda r: r["macro_f1_mean"], reverse=True):
        print(f"{result['architecture']:<24}"
              f"{result['macro_f1_mean']:>10.3f} ±{result['macro_f1_std']:<6.3f}"
              f"{result['accuracy_mean']:>10.3f} ±{result['accuracy_std']:<6.3f}"
              f"{result['ece_mean']:>8.3f}{result['checkpoint_bytes'] // 1_000_000:>7} MB")

    print("\nper-class recall (mean over folds) — the number accuracy hides:")
    print("  " + f"{'soil':<16}" + "".join(f"{r['architecture']:>24}" for r in results))
    for name in classes:
        row = f"  {name:<16}"
        for result in results:
            row += (f"{result['per_class_recall'][name]:>17.3f} "
                    f"±{result['per_class_recall_std'][name]:<5.3f}")
        print(row)

    winner = choose(results)
    print(f"\nshipping: {winner['architecture']} (fold {winner['best_fold']}, "
          f"macro-F1 {winner['best_fold_macro_f1']:.3f}, T={winner['temperature']:.2f})")

    torch.save(winner["state"], args.out / "soil_model.pth")
    (args.out / "soil_classes.json").write_text(json.dumps(classes, indent=2))
    (args.out / "out_of_fold.json").write_text(json.dumps(
        {r["architecture"]: r["out_of_fold"] for r in results}, indent=1))

    metadata = {
        "architecture": family_of(winner["architecture"]),
        "arm": winner["architecture"],
        "classes": classes,
        "survey_vocabulary": manifest.get("survey_vocabulary", {}),
        "image_size": args.size,
        "normalize": {"mean": IMAGENET_MEAN, "std": IMAGENET_STD},
        "temperature": winner["temperature"],
        "shipped_fold": winner["best_fold"],
        "cv_macro_f1_mean": winner["macro_f1_mean"],
        "cv_macro_f1_std": winner["macro_f1_std"],
        "cv_macro_f1_per_fold": winner["macro_f1_per_fold"],
        "cv_accuracy_mean": winner["accuracy_mean"],
        "cv_ece_mean": winner["ece_mean"],
        "per_class_recall": winner["per_class_recall"],
        "confusion_pooled": winner["confusion_pooled"],
        "checkpoint_bytes": winner["checkpoint_bytes"],
        "comparison": [{k: v for k, v in r.items()
                        if k not in {"state", "confusion_pooled", "out_of_fold"}}
                       for r in results],
        "dataset": {
            "source": manifest["source"],
            "files_scanned": manifest["files_scanned"],
            "distinct_by_md5": manifest["distinct_by_md5"],
            "distinct_scenes": manifest["distinct_scenes"],
            "hamming_threshold": manifest["hamming_threshold"],
            "dropped_label_conflicts": len(manifest["dropped_label_conflicts"]),
        },
        "protocol": (
            "StratifiedGroupKFold over perceptual-hash scene groups, so no copy, "
            "rotation or burst-frame of a validation photograph appears in "
            "training. Resolution normalised and jittered, because file "
            "dimensions alone separated these classes at 0.387 against a 0.174 "
            "majority baseline before correction. Class-balanced sampling."
        ),
        "trained_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "args": {k: (str(v) if isinstance(v, Path) else v) for k, v in vars(args).items()},
    }
    (args.out / "soil_metadata.json").write_text(json.dumps(metadata, indent=2))

    print(f"\nwrote {args.out}/soil_model.pth ({winner['checkpoint_bytes'] // 1_000_000} MB)")
    print(f"total {time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
