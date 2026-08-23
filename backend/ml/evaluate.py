"""Leakage-free evaluation of the acquisition classifier.

Reads ``data/ground_truth_labeled.csv`` (see ``build_ground_truth.py`` for how
the labels are derived and the PU-learning caveat on negatives), computes the
same 9 features the production classifier uses -- directly from raw data, never
from a heuristic label -- and reports:

  * 5-fold stratified cross-validated recall / precision / F1 / ROC-AUC for
    XGBoost (class-weighted) and a logistic-regression baseline;
  * recall at the operating point where FPR on the negatives is <= 10 %;
  * the rule-based heuristic (``_infer_type_from_name``) scored on the same rows.

The best model (by CV ROC-AUC) is refit on all rows and saved to
``data/classifier_gt_model.joblib``.

Reproduce:  ``.venv/bin/python -m backend.ml.evaluate``
"""

import csv
from datetime import date
from pathlib import Path

import numpy as np

from backend.agent.gemini_client import _infer_type_from_name
from backend.ml.build_training_data import jaccard_similarity
from backend.ml.classifier import SUFFIX_MAP

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
LABELED_CSV = DATA_DIR / "ground_truth_labeled.csv"
MODEL_PATH = DATA_DIR / "classifier_gt_model.joblib"

FEATURE_NAMES = ["cross_cik", "name_similarity", "suffix_type", "first_seen_lag",
                 "batch_size", "has_functional", "has_geographic", "token_count", "is_active"]
MAX_FPR = 0.10
N_FOLDS = 5
SEED = 42

# Keyword lists mirror backend/ml/classifier.py::predict (the production path).
FUNC_KW = ["trust", "funding", "finance", "holding", "properties",
           "realty", "real estate", "insurance", "leasing"]
GEO_KW = ["america", "europe", "asia", "pacific", "canada", "uk",
          "japan", "china", "india", "international", "global"]


def suffix_type(sub_lower: str) -> str:
    if any(sub_lower.rstrip(".").endswith(s) for s in ("inc", "corp", "corporation")):
        return "inc_corp"
    if "llc" in sub_lower or "l.l.c" in sub_lower:
        return "llc"
    if "lp" in sub_lower or "l.p." in sub_lower:
        return "lp"
    if "ltd" in sub_lower or "limited" in sub_lower:
        return "ltd"
    if "trust" in sub_lower:
        return "trust"
    return "other"


def lag_days(first_seen: str, first_filing: str) -> int:
    try:
        return (date.fromisoformat(first_seen[:10]) - date.fromisoformat(first_filing[:10])).days
    except (ValueError, TypeError):
        return 0


def featurize(row: dict) -> list:
    """The 9 production features, computed from raw columns only."""
    sub_lower = row["sub_name"].lower()
    return [
        int(row["cross_cik"]),
        jaccard_similarity(row["sub_name"], row["parent_name"]),
        SUFFIX_MAP[suffix_type(sub_lower)],
        lag_days(row["first_seen"], row["first_filing"]),
        int(row["batch_size"]),
        int(any(k in sub_lower for k in FUNC_KW)),
        int(any(k in sub_lower for k in GEO_KW)),
        len(row["sub_name"].split()),
        int("Active" in row["time_out"]),
    ]


def heuristic_predict(row: dict) -> int:
    t = _infer_type_from_name(
        row["sub_name"], row["parent_name"],
        first_seen=row["first_seen"], first_filing=row["first_filing"],
        batch_size=int(row["batch_size"]), is_cross_cik=bool(int(row["cross_cik"])),
    )
    return int(t == "External Acquisition")


def load():
    with open(LABELED_CSV) as f:
        rows = list(csv.DictReader(f))
    X = np.array([featurize(r) for r in rows], dtype=float)
    y = np.array([int(r["label"]) for r in rows])
    h = np.array([heuristic_predict(r) for r in rows])
    return rows, X, y, h


def make_models(pos_weight: float):
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    from xgboost import XGBClassifier

    return {
        "logistic": make_pipeline(
            StandardScaler(),
            LogisticRegression(class_weight="balanced", max_iter=2000, random_state=SEED),
        ),
        "xgboost": XGBClassifier(
            n_estimators=200, max_depth=4, learning_rate=0.05,
            subsample=0.8, colsample_bytree=0.8, scale_pos_weight=pos_weight,
            random_state=SEED, eval_metric="logloss",
        ),
    }


def binary_metrics(y, pred):
    from sklearn.metrics import precision_score, recall_score, f1_score
    return {
        "recall": recall_score(y, pred, zero_division=0),
        "precision": precision_score(y, pred, zero_division=0),
        "f1": f1_score(y, pred, zero_division=0),
    }


def recall_at_fpr(y, score, max_fpr=MAX_FPR):
    """Highest recall achievable with FPR <= max_fpr, and the threshold used."""
    from sklearn.metrics import roc_curve
    fpr, tpr, thr = roc_curve(y, score)
    ok = fpr <= max_fpr
    i = int(np.argmax(np.where(ok, tpr, -1)))
    return float(tpr[i]), float(thr[i]), float(fpr[i])


def cross_validate(models, X, y):
    from sklearn.metrics import roc_auc_score
    from sklearn.model_selection import StratifiedKFold, cross_val_predict

    skf = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=SEED)
    results = {}
    for name, model in models.items():
        proba = cross_val_predict(model, X, y, cv=skf, method="predict_proba")[:, 1]
        m = binary_metrics(y, (proba >= 0.5).astype(int))
        m["auc"] = roc_auc_score(y, proba)
        m["recall@fpr10"], m["thr@fpr10"], m["fpr@fpr10"] = recall_at_fpr(y, proba)
        results[name] = m
    return results


def print_table(results, y, h):
    from sklearn.metrics import roc_auc_score
    hm = binary_metrics(y, h)
    hm["auc"] = roc_auc_score(y, h)          # binary output -> AUC of a single point
    h_fpr = float(((h == 1) & (y == 0)).sum() / (y == 0).sum())
    hm["recall@fpr10"] = hm["recall"] if h_fpr <= MAX_FPR else float("nan")
    hm["fpr@fpr10"] = h_fpr
    table = {"heuristic (rule-based)": hm, **results}

    hdr = f"{'model':24s} {'recall':>7s} {'precision':>9s} {'F1':>6s} {'ROC-AUC':>8s} {'recall@FPR<=10%':>16s} {'FPR@op':>7s}"
    print("\n" + hdr)
    print("-" * len(hdr))
    for name, m in table.items():
        print(f"{name:24s} {m['recall']:7.3f} {m['precision']:9.3f} {m['f1']:6.3f} "
              f"{m['auc']:8.3f} {m['recall@fpr10']:16.3f} {m['fpr@fpr10']:7.3f}")
    print(f"\nHeuristic FPR on negatives at its fixed operating point: {h_fpr:.3f}")
    return table


def main():
    import joblib

    rows, X, y, h = load()
    n_pos, n_neg = int(y.sum()), int((y == 0).sum())
    print(f"Labeled set: {len(rows)} rows  ({n_pos} positives, {n_neg} presumed-negatives)")
    print(f"{N_FOLDS}-fold stratified CV, seed={SEED}; threshold 0.5 unless stated")

    models = make_models(pos_weight=n_neg / n_pos)
    results = cross_validate(models, X, y)
    table = print_table(results, y, h)

    best_name = max(results, key=lambda k: results[k]["auc"])
    best = models[best_name].fit(X, y)
    joblib.dump({"model": best, "features": FEATURE_NAMES, "name": best_name,
                 "threshold_fpr10": results[best_name]["thr@fpr10"]}, str(MODEL_PATH))
    print(f"\nBest by CV ROC-AUC: {best_name} -> saved to {MODEL_PATH}")

    if best_name == "xgboost":
        imp = best.feature_importances_
        print("Feature importance (gain-normalised):")
        for n, v in sorted(zip(FEATURE_NAMES, imp), key=lambda t: -t[1]):
            print(f"  {n:16s} {v:.3f}")
    return table


if __name__ == "__main__":
    main()
