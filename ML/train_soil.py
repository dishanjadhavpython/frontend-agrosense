"""Train the eight-class soil classifier — two architectures, best one ships.

ResNet18 and EfficientNet-B0 are both fine-tuned under an identical protocol
(same folds, same epochs, same augmentation, same schedule) and scored on the
same held-out images, because a comparison where the two candidates were
trained differently measures the protocol, not the architecture.

Both are transfer-learned from ImageNet. That matters more than the choice
between them: the rare soils have 22-24 real training images each, and a
backbone that already knows edges and textures is the only reason a head can
learn anything from 22 examples.

ViT stays out of serving on size — the checkpoint from the earlier notebook is
343 MB against ResNet18's 45 MB and B0's 16 MB, and this has to load inside a
web request on a machine also running Next.js. It remains a fair baseline in
the notebook.

The winner is chosen on **cross-validated macro-F1**, not accuracy. Alluvial is
a third of the real data, so a model that never once predicts Cinder still
posts a good accuracy; macro-F1 is the number that notices. Ties inside one
standard deviation go to the smaller model, since at that point the honest
statement is that they are indistinguishable on this data and size is the only
remaining reason to prefer one.

What the training does that the original notebook's flat `Adam(lr=1e-4)` did
not:

  * **Staged fine-tuning.** The head trains against a frozen backbone first,
    then the last blocks unfreeze at a much smaller learning rate. With 22 real
    Laterite images, fine-tuning everything from step one destroys the
    pretrained features before the head knows what it wants from them.
  * **Label smoothing**, because a web-scraped soil dataset certainly contains
    mislabelled images and a confidently wrong target is expensive.
  * **Mixup**, worth more at this size than any architecture change.
  * **Early stopping on macro-F1**, per above.
  * **Test-time augmentation** and **temperature scaling**, so the confidence
    the UI prints means roughly what it says.

Class weights are deliberately *not* used: the training folds were already
balanced by augmentation, so weighting would correct the same imbalance twice.

Usage:
    python ML/train_soil.py --folds 5 --epochs 12
    python ML/train_soil.py --architectures efficientnet_b0     # just one
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from torch.utils.data import DataLoader
from torchvision import models, transforms
from torchvision.datasets import ImageFolder

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "ml" / "data" / "soil"
OUT = ROOT / "ML" / "models"

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]


def device_of() -> torch.device:
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def loaders(fold_dir: Path, batch_size: int, size: int):
    # The heavy augmentation already happened offline and is on disk. What is
    # left here is the cheap online jitter that should differ every epoch.
    train_tf = transforms.Compose(
        [
            transforms.RandomResizedCrop(size, scale=(0.75, 1.0)),
            transforms.RandomHorizontalFlip(),
            transforms.ColorJitter(0.2, 0.2, 0.2, 0.03),
            transforms.ToTensor(),
            transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
            transforms.RandomErasing(p=0.25, scale=(0.02, 0.12)),
        ]
    )
    eval_tf = transforms.Compose(
        [
            transforms.Resize(int(size * 1.14)),
            transforms.CenterCrop(size),
            transforms.ToTensor(),
            transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
        ]
    )

    train_set = ImageFolder(fold_dir / "train", transform=train_tf)
    val_set = ImageFolder(fold_dir / "val", transform=eval_tf)

    return (
        DataLoader(train_set, batch_size=batch_size, shuffle=True, num_workers=0, drop_last=True),
        DataLoader(val_set, batch_size=batch_size, shuffle=False, num_workers=0),
        train_set.classes,
    )


#: The candidates, with their checkpoint sizes. Kept small on purpose: this
#: loads inside a request, not on a training box.
ARCHITECTURES = ("efficientnet_b0", "resnet18")


def build_model(architecture: str, num_classes: int) -> nn.Module:
    """One backbone, ImageNet-pretrained, with a fresh head of the right width."""
    if architecture == "efficientnet_b0":
        model = models.efficientnet_b0(weights=models.EfficientNet_B0_Weights.IMAGENET1K_V1)
        in_features = model.classifier[1].in_features
        model.classifier = nn.Sequential(
            nn.Dropout(0.3, inplace=True), nn.Linear(in_features, num_classes)
        )
        return model

    if architecture == "resnet18":
        model = models.resnet18(weights=models.ResNet18_Weights.IMAGENET1K_V1)
        model.fc = nn.Sequential(
            nn.Dropout(0.3, inplace=True), nn.Linear(model.fc.in_features, num_classes)
        )
        return model

    raise ValueError(f"unknown architecture: {architecture}")


def backbone_stages(model: nn.Module, architecture: str) -> list[nn.Module]:
    """The backbone in coarse-to-fine order, so the last N can be unfrozen.

    EfficientNet keeps its stages in `features`; ResNet spreads them across
    named `layer1..layer4` attributes. Normalising here is what lets one
    training loop drive both.
    """
    if architecture == "efficientnet_b0":
        return list(model.features)
    return [model.layer1, model.layer2, model.layer3, model.layer4]


def head_parameters(model: nn.Module, architecture: str):
    return (
        model.classifier.parameters()
        if architecture == "efficientnet_b0"
        else model.fc.parameters()
    )


def set_backbone_grad(model: nn.Module, architecture: str, *, unfrozen_blocks: int) -> None:
    """Freeze the backbone, then re-enable the last `unfrozen_blocks` stages.

    The early stages are edges and colour blobs — universal, and nothing 22
    images should be allowed to rewrite. The late ones are where "this texture
    is laterite" can live.
    """
    stages = backbone_stages(model, architecture)
    for stage in stages:
        for param in stage.parameters():
            param.requires_grad = False
    if unfrozen_blocks > 0:
        for stage in stages[-unfrozen_blocks:]:
            for param in stage.parameters():
                param.requires_grad = True


def trainable_backbone_parameters(model: nn.Module, architecture: str):
    seen = []
    for stage in backbone_stages(model, architecture):
        seen.extend(p for p in stage.parameters() if p.requires_grad)
    return seen


def mixup(x: torch.Tensor, y: torch.Tensor, alpha: float):
    if alpha <= 0:
        return x, y, y, 1.0
    lam = float(np.random.beta(alpha, alpha))
    index = torch.randperm(x.size(0), device=x.device)
    return lam * x + (1 - lam) * x[index], y, y[index], lam


@torch.no_grad()
def predict_logits(model: nn.Module, loader: DataLoader, device: torch.device, tta: bool):
    model.eval()
    all_logits, all_targets = [], []
    for images, targets in loader:
        images = images.to(device)
        logits = model(images)
        if tta:
            # Averaging the two orientations costs one extra forward pass and
            # reliably steadies a small-data model.
            logits = (logits + model(torch.flip(images, dims=[3]))) / 2
        all_logits.append(logits.float().cpu())
        all_targets.append(targets)
    return torch.cat(all_logits), torch.cat(all_targets)


def fit_temperature(logits: torch.Tensor, targets: torch.Tensor) -> float:
    """One scalar that divides the logits so the softmax stops overclaiming.

    A model trained on augmented, balanced data is overconfident by
    construction, and the UI prints its confidence as a percentage next to a
    farmer's decision. This makes "91%" mean something nearer nine times in ten.
    """
    log_t = torch.zeros(1, requires_grad=True)
    optimizer = torch.optim.LBFGS([log_t], lr=0.1, max_iter=60)

    def closure():
        optimizer.zero_grad()
        loss = F.cross_entropy(logits / log_t.exp(), targets)
        loss.backward()
        return loss

    optimizer.step(closure)
    return float(log_t.exp().item())


def run_fold(fold_dir: Path, architecture: str, args, device: torch.device) -> dict:
    train_loader, val_loader, classes = loaders(fold_dir, args.batch_size, args.size)
    model = build_model(architecture, len(classes)).to(device)
    criterion = nn.CrossEntropyLoss(label_smoothing=args.label_smoothing)

    best = {"macro_f1": -1.0, "state": None, "epoch": -1}
    history = []

    for epoch in range(args.epochs):
        # Stage one: head only. Stage two: head plus the last blocks, with the
        # backbone on a learning rate 100x smaller than the head's.
        if epoch == 0:
            set_backbone_grad(model, architecture, unfrozen_blocks=0)
            optimizer = torch.optim.AdamW(
                head_parameters(model, architecture),
                lr=args.head_lr,
                weight_decay=args.weight_decay,
            )
            scheduler = None
        elif epoch == args.warmup_epochs:
            set_backbone_grad(model, architecture, unfrozen_blocks=args.unfrozen_blocks)
            optimizer = torch.optim.AdamW(
                [
                    {"params": trainable_backbone_parameters(model, architecture),
                     "lr": args.backbone_lr},
                    {"params": head_parameters(model, architecture), "lr": args.head_lr},
                ],
                weight_decay=args.weight_decay,
            )
            scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
                optimizer, T_max=max(1, args.epochs - args.warmup_epochs)
            )

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
        preds = logits.argmax(1)
        macro_f1 = f1_score(targets, preds, average="macro", zero_division=0)
        accuracy = (preds == targets).float().mean().item()
        history.append({"epoch": epoch, "loss": running / max(seen, 1),
                        "macro_f1": macro_f1, "accuracy": accuracy})
        print(f"    epoch {epoch:>2}  loss {running/max(seen,1):.3f}  "
              f"macro-F1 {macro_f1:.3f}  acc {accuracy:.3f}")

        if macro_f1 > best["macro_f1"]:
            best = {
                "macro_f1": macro_f1,
                "state": {k: v.detach().cpu().clone() for k, v in model.state_dict().items()},
                "epoch": epoch,
            }

    model.load_state_dict(best["state"])
    logits, targets = predict_logits(model, val_loader, device, tta=args.tta)
    temperature = fit_temperature(logits, targets)
    preds = logits.argmax(1)

    report = classification_report(
        targets, preds, target_names=classes, output_dict=True, zero_division=0
    )
    return {
        "classes": classes,
        "macro_f1": best["macro_f1"],
        "accuracy": float((preds == targets).float().mean()),
        "best_epoch": best["epoch"],
        "temperature": temperature,
        "report": report,
        "confusion": confusion_matrix(targets, preds).tolist(),
        "history": history,
        "state": best["state"],
    }


def evaluate(architecture: str, args, device: torch.device) -> dict:
    """One architecture across every fold."""
    print(f"\n{'=' * 62}\n{architecture}\n{'=' * 62}")
    folds = []
    for fold in range(args.folds):
        fold_dir = DATA / f"fold{fold}"
        if not fold_dir.is_dir():
            raise SystemExit(f"missing {fold_dir} — run ML/prepare_soil_dataset.py first")
        print(f"  fold {fold}")
        folds.append(run_fold(fold_dir, architecture, args, device))

    macro = np.array([f["macro_f1"] for f in folds])
    accuracy = np.array([f["accuracy"] for f in folds])
    classes = folds[0]["classes"]
    best_index = int(macro.argmax())

    print(f"\n  {architecture}: macro-F1 {macro.mean():.3f} +/- {macro.std():.3f}"
          f" | accuracy {accuracy.mean():.3f} +/- {accuracy.std():.3f}")

    return {
        "architecture": architecture,
        "classes": classes,
        "macro_f1_mean": float(macro.mean()),
        "macro_f1_std": float(macro.std()),
        "accuracy_mean": float(accuracy.mean()),
        "accuracy_std": float(accuracy.std()),
        "per_class_recall": {
            name: float(np.mean([f["report"][name]["recall"] for f in folds]))
            for name in classes
        },
        "per_class_recall_std": {
            name: float(np.std([f["report"][name]["recall"] for f in folds]))
            for name in classes
        },
        "best_fold": best_index,
        "best_fold_macro_f1": float(macro[best_index]),
        "temperature": folds[best_index]["temperature"],
        "confusion_best_fold": folds[best_index]["confusion"],
        "state": folds[best_index]["state"],
        "params": None,  # filled in below, once the model object exists
    }


def choose(results: list[dict]) -> dict:
    """Best cross-validated macro-F1, with ties broken towards the smaller model.

    "Tie" means inside one standard deviation. At 769 images with 5-6
    validation examples in the rare classes, a 0.01 macro-F1 gap is noise, and
    picking the bigger checkpoint on the strength of noise costs 29 MB in a web
    request for nothing.
    """
    ranked = sorted(results, key=lambda r: r["macro_f1_mean"], reverse=True)
    leader = ranked[0]
    margin = leader["macro_f1_std"]

    contenders = [r for r in ranked if leader["macro_f1_mean"] - r["macro_f1_mean"] <= margin]
    if len(contenders) > 1:
        winner = min(contenders, key=lambda r: r["checkpoint_bytes"])
        if winner is not leader:
            print(
                f"\n{leader['architecture']} leads by "
                f"{leader['macro_f1_mean'] - winner['macro_f1_mean']:.3f} macro-F1, inside its own "
                f"std of {margin:.3f}. Taking {winner['architecture']} — same result within noise, "
                f"{leader['checkpoint_bytes'] // 1_000_000} MB -> "
                f"{winner['checkpoint_bytes'] // 1_000_000} MB."
            )
        return winner
    return leader


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--folds", type=int, default=5)
    parser.add_argument("--epochs", type=int, default=12)
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
    parser.add_argument(
        "--architectures", nargs="+", default=list(ARCHITECTURES), choices=ARCHITECTURES
    )
    args = parser.parse_args()

    device = device_of()
    print(f"device: {device}")
    print(f"candidates: {', '.join(args.architectures)}")
    OUT.mkdir(parents=True, exist_ok=True)

    started = time.time()
    results = []
    for architecture in args.architectures:
        result = evaluate(architecture, args, device)
        # Checkpoint size is a real deployment cost and part of the decision.
        result["checkpoint_bytes"] = sum(
            tensor.numel() * tensor.element_size() for tensor in result["state"].values()
        )
        results.append(result)

    classes = results[0]["classes"]

    print(f"\n{'=' * 62}\nComparison\n{'=' * 62}")
    print(f"{'architecture':<20}{'macro-F1':>18}{'accuracy':>18}{'size':>10}")
    for result in sorted(results, key=lambda r: r["macro_f1_mean"], reverse=True):
        print(
            f"{result['architecture']:<20}"
            f"{result['macro_f1_mean']:>10.3f} ±{result['macro_f1_std']:<6.3f}"
            f"{result['accuracy_mean']:>10.3f} ±{result['accuracy_std']:<6.3f}"
            f"{result['checkpoint_bytes'] // 1_000_000:>7} MB"
        )

    print("\nper-class recall (mean over folds) — the number that matters for the")
    print("rare soils, because accuracy hides them:")
    header = "  " + f"{'soil':<10}" + "".join(f"{r['architecture']:>20}" for r in results)
    print(header)
    for name in classes:
        row = f"  {name:<10}"
        for result in results:
            row += f"{result['per_class_recall'][name]:>13.3f} ±{result['per_class_recall_std'][name]:<5.3f}"
        print(row)

    winner = choose(results)
    print(f"\nshipping: {winner['architecture']} "
          f"(fold {winner['best_fold']}, macro-F1 {winner['best_fold_macro_f1']:.3f}, "
          f"T={winner['temperature']:.2f})")

    torch.save(winner["state"], OUT / "soil_model.pth")
    (OUT / "soil_classes.json").write_text(json.dumps(classes, indent=2))

    metadata = {
        "architecture": winner["architecture"],
        "classes": classes,
        "image_size": args.size,
        "normalize": {"mean": IMAGENET_MEAN, "std": IMAGENET_STD},
        "temperature": winner["temperature"],
        "shipped_fold": winner["best_fold"],
        "cv_macro_f1_mean": winner["macro_f1_mean"],
        "cv_macro_f1_std": winner["macro_f1_std"],
        "cv_accuracy_mean": winner["accuracy_mean"],
        "per_class_recall": winner["per_class_recall"],
        "confusion_best_fold": winner["confusion_best_fold"],
        "checkpoint_bytes": winner["checkpoint_bytes"],
        # Every candidate's numbers, so the choice can be re-examined without
        # retraining.
        "comparison": [
            {k: v for k, v in r.items() if k not in {"state", "confusion_best_fold"}}
            for r in results
        ],
        "trained_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "args": vars(args),
    }
    (OUT / "soil_metadata.json").write_text(json.dumps(metadata, indent=2))

    print(f"wrote {OUT}/soil_model.pth  ({winner['checkpoint_bytes'] // 1_000_000} MB)")
    print(f"total {time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
