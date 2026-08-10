"""Shared bake-off for the two tabular models.

Crop and fertilizer are the same problem shape — a handful of numeric features,
one categorical outcome — so they get the same two candidates, the same
cross-validation, the same selection rule and the same saved metadata. Writing
that once means the two models cannot be compared under quietly different
protocols, which is the usual way a model-selection claim turns out to be about
the harness rather than the model.

Candidates:

  * **XGBoost** — the incumbent, and what both notebooks used.
  * **LightGBM** — leaf-wise growth rather than level-wise. On the small crop
    table (2,200 rows) that difference is mostly irrelevant; on 750,000 rows of
    fertilizer data it is worth having.

Selection is on **cross-validated macro-F1**, with ties inside one standard
deviation broken towards the faster model to predict. Neither of these tasks
has an accuracy problem that a 30ms-slower inference would fix.
"""

from __future__ import annotations

import json
import pickle
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

import numpy as np
from sklearn.metrics import accuracy_score, f1_score, top_k_accuracy_score
from sklearn.model_selection import StratifiedKFold


@dataclass
class Candidate:
    name: str
    build: Callable[[int], Any]
    #: Median seconds for a single-row `predict_proba`, filled during scoring.
    predict_ms: float = 0.0
    scores: dict[str, Any] = field(default_factory=dict)


def xgboost_candidate(**overrides) -> Candidate:
    from xgboost import XGBClassifier

    def build(num_classes: int):
        params = dict(
            n_estimators=400,
            max_depth=6,
            learning_rate=0.08,
            subsample=0.9,
            colsample_bytree=0.9,
            reg_lambda=1.0,
            objective="multi:softprob",
            num_class=num_classes,
            tree_method="hist",
            n_jobs=4,
            random_state=42,
        )
        params.update(overrides)
        return XGBClassifier(**params)

    return Candidate("xgboost", build)


def lightgbm_candidate(**overrides) -> Candidate:
    import lightgbm as lgb

    def build(num_classes: int):
        params = dict(
            n_estimators=400,
            num_leaves=48,
            max_depth=-1,
            learning_rate=0.08,
            subsample=0.9,
            subsample_freq=1,
            colsample_bytree=0.9,
            reg_lambda=1.0,
            objective="multiclass",
            num_class=num_classes,
            n_jobs=4,
            random_state=42,
            verbose=-1,
        )
        params.update(overrides)
        return lgb.LGBMClassifier(**params)

    return Candidate("lightgbm", build)


def score_candidate(
    candidate: Candidate,
    X: np.ndarray,
    y: np.ndarray,
    *,
    folds: int = 5,
    top_k: int | None = None,
) -> dict[str, Any]:
    """Cross-validate one candidate. Same folds for every candidate — the split
    is seeded, so the comparison is paired rather than two separate lotteries."""
    num_classes = int(len(np.unique(y)))
    splitter = StratifiedKFold(n_splits=folds, shuffle=True, random_state=42)

    accuracies, macros, topk = [], [], []
    for train_index, val_index in splitter.split(X, y):
        model = candidate.build(num_classes)
        model.fit(X[train_index], y[train_index])
        probabilities = model.predict_proba(X[val_index])
        predictions = probabilities.argmax(axis=1)

        accuracies.append(accuracy_score(y[val_index], predictions))
        macros.append(f1_score(y[val_index], predictions, average="macro", zero_division=0))
        if top_k:
            topk.append(
                top_k_accuracy_score(
                    y[val_index], probabilities, k=top_k, labels=np.arange(num_classes)
                )
            )

    # Latency on a single row, which is how this is actually called — one
    # farmer, one card. Batch throughput is irrelevant here.
    model = candidate.build(num_classes)
    model.fit(X, y)
    row = X[:1]
    started = time.perf_counter()
    for _ in range(50):
        model.predict_proba(row)
    candidate.predict_ms = (time.perf_counter() - started) / 50 * 1000

    result = {
        "name": candidate.name,
        "accuracy_mean": float(np.mean(accuracies)),
        "accuracy_std": float(np.std(accuracies)),
        "macro_f1_mean": float(np.mean(macros)),
        "macro_f1_std": float(np.std(macros)),
        "predict_ms": round(candidate.predict_ms, 2),
    }
    if top_k:
        result[f"top{top_k}_mean"] = float(np.mean(topk))
    candidate.scores = result
    return result


def choose(results: list[dict[str, Any]]) -> dict[str, Any]:
    """Best macro-F1; ties inside one standard deviation go to the faster model."""
    ranked = sorted(results, key=lambda r: r["macro_f1_mean"], reverse=True)
    leader = ranked[0]
    margin = max(leader["macro_f1_std"], 1e-9)

    contenders = [r for r in ranked if leader["macro_f1_mean"] - r["macro_f1_mean"] <= margin]
    if len(contenders) > 1:
        winner = min(contenders, key=lambda r: r["predict_ms"])
        if winner is not leader:
            print(
                f"  {leader['name']} leads by "
                f"{leader['macro_f1_mean'] - winner['macro_f1_mean']:.4f} macro-F1, inside its own "
                f"std of {margin:.4f}. Taking {winner['name']} — same result within noise, "
                f"{leader['predict_ms']:.1f}ms -> {winner['predict_ms']:.1f}ms per prediction."
            )
        return winner
    return leader


def report(results: list[dict[str, Any]], *, top_k: int | None = None) -> None:
    print(f"\n{'model':<12}{'macro-F1':>20}{'accuracy':>20}", end="")
    if top_k:
        print(f"{f'top-{top_k}':>10}", end="")
    print(f"{'predict':>11}")
    for result in sorted(results, key=lambda r: r["macro_f1_mean"], reverse=True):
        print(
            f"{result['name']:<12}"
            f"{result['macro_f1_mean']:>12.4f} ±{result['macro_f1_std']:<6.4f}"
            f"{result['accuracy_mean']:>12.4f} ±{result['accuracy_std']:<6.4f}",
            end="",
        )
        if top_k:
            print(f"{result.get(f'top{top_k}_mean', 0):>10.4f}", end="")
        print(f"{result['predict_ms']:>8.2f}ms")


def save(out_dir: Path, prefix: str, model, extras: dict[str, Any]) -> None:
    with (out_dir / f"{prefix}_model.pkl").open("wb") as handle:
        pickle.dump(model, handle)
    for name, obj in extras.items():
        with (out_dir / f"{prefix}_{name}.pkl").open("wb") as handle:
            pickle.dump(obj, handle)


def write_metadata(out_dir: Path, prefix: str, metadata: dict[str, Any]) -> None:
    (out_dir / f"{prefix}_metadata.json").write_text(json.dumps(metadata, indent=2))
