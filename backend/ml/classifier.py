"""XGBoost classifier for subsidiary type prediction."""

import csv
import os
import numpy as np
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
TRAINING_CSV = DATA_DIR / "training_data.csv"
MODEL_PATH = DATA_DIR / "classifier_model.joblib"

SUFFIX_MAP = {"inc_corp": 0, "llc": 1, "lp": 2, "ltd": 3, "trust": 4, "other": 5}


def load_training_data():
    """Load and prepare training data."""
    X, y = [], []
    with open(TRAINING_CSV) as f:
        for row in csv.DictReader(f):
            features = [
                int(row["cross_cik"]),
                float(row["name_similarity"]),
                SUFFIX_MAP.get(row["suffix_type"], 5),
                int(row["first_seen_lag_days"]),
                int(row["batch_size"]),
                int(row["has_functional"]),
                int(row["has_geographic"]),
                int(row["token_count"]),
                int(row["is_active"]),
            ]
            X.append(features)
            y.append(1 if row["label"] == "acquisition" else 0)
    return np.array(X), np.array(y)


def train():
    """Train XGBoost classifier and save model."""
    from xgboost import XGBClassifier
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import classification_report, accuracy_score
    import joblib

    if not TRAINING_CSV.exists():
        print("No training data found. Run build_training_data.py first.")
        return

    X, y = load_training_data()
    print(f"Training data: {len(X)} samples, {sum(y)} acquisitions, {len(y)-sum(y)} internal")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    model = XGBClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        eval_metric="logloss",
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    print(f"\nAccuracy: {accuracy_score(y_test, y_pred):.4f}")
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred, target_names=["Internal", "Acquisition"]))

    # Feature importance
    feature_names = ["cross_cik", "name_similarity", "suffix_type",
                     "first_seen_lag", "batch_size", "has_functional",
                     "has_geographic", "token_count", "is_active"]
    importances = model.feature_importances_
    print("\nFeature Importance:")
    for name, imp in sorted(zip(feature_names, importances), key=lambda x: -x[1]):
        print(f"  {name:20s} {imp:.4f}")

    joblib.dump(model, str(MODEL_PATH))
    print(f"\nModel saved to {MODEL_PATH}")
    return model


def predict(sub_name: str, parent_name: str, cross_cik: bool = False,
            first_seen: str = "", first_filing: str = "",
            batch_size: int = 0, time_out: str = "") -> str:
    """Predict subsidiary type using trained model."""
    import joblib

    if not MODEL_PATH.exists():
        return None  # Fall back to heuristic

    model = joblib.load(str(MODEL_PATH))

    # Compute features
    from backend.ml.build_training_data import jaccard_similarity, meaningful_words, NOISE

    sim = jaccard_similarity(sub_name, parent_name)
    sub_lower = sub_name.lower()

    suffix_type = "other"
    for sfx in ["inc", "corp", "corporation"]:
        if sub_lower.rstrip(".").endswith(sfx):
            suffix_type = "inc_corp"
            break
    if suffix_type == "other":
        for sfx in ["llc", "l.l.c"]:
            if sfx in sub_lower:
                suffix_type = "llc"
                break
    if suffix_type == "other":
        for sfx in ["lp", "l.p."]:
            if sfx in sub_lower:
                suffix_type = "lp"
                break
    if suffix_type == "other":
        for sfx in ["ltd", "limited"]:
            if sfx in sub_lower:
                suffix_type = "ltd"
                break
    if suffix_type == "other" and "trust" in sub_lower:
        suffix_type = "trust"

    lag_days = 0
    if first_seen and first_filing:
        try:
            from datetime import datetime
            fs = datetime.strptime(first_seen[:10], "%Y-%m-%d")
            ff = datetime.strptime(first_filing[:10], "%Y-%m-%d")
            lag_days = (fs - ff).days
        except (ValueError, TypeError):
            pass

    func_kw = ["trust", "funding", "finance", "holding", "properties",
                "realty", "real estate", "insurance", "leasing"]
    has_func = int(any(kw in sub_lower for kw in func_kw))

    geo_kw = ["america", "europe", "asia", "pacific", "canada", "uk",
               "japan", "china", "india", "international", "global"]
    has_geo = int(any(kw in sub_lower for kw in geo_kw))

    token_count = len(sub_name.split())
    is_active = int(time_out and "Active" in str(time_out))

    features = np.array([[
        int(cross_cik), sim, SUFFIX_MAP.get(suffix_type, 5),
        lag_days, batch_size, has_func, has_geo, token_count, is_active
    ]])

    pred = model.predict(features)[0]
    return "External Acquisition" if pred == 1 else "Internal Creation"


if __name__ == "__main__":
    train()
