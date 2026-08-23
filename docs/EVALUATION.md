# Honest Classifier Evaluation

This document replaces the earlier "~94% accuracy" claims, which were not
supported by a leakage-free measurement. It records how the acquisition
classifier is actually evaluated, the measured numbers, and the caveats.

## Why the old numbers were wrong

`data/training_data.csv` (40,050 rows) was labeled by two heuristics:

- every **"acquisition"** row came from the **cross-CIK** rule (same subsidiary
  name under more than one parent CIK);
- every **"internal"** row came from the **parent-name-match** rule.

Both signals are also model features (`cross_cik`, `name_similarity`), so a
model trained and tested on that file mostly re-learns the labeling rules —
that is where the "~94%" / "~85–90%" figures came from. Measured against
independent labels (below), the true numbers are far lower.

## Method

1. **Labels** — `backend/ml/build_ground_truth.py` matches Wikidata
   "acquired by" pairs (`data/wikidata_ma_ground_truth.csv`, 5,000 pairs) to
   the SEC Exhibit-21 dataset:
   - acquirer → company via exact match on noise-stripped name words;
   - acquired → the best-Jaccard subsidiary of that company, accepted at
     Jaccard ≥ 0.5, or ≥ 0.4 when the acquired name's meaningful words are a
     subset of the subsidiary name's;
   - deduplicated on (CIK, normalized subsidiary name).

   Negatives are a seeded (seed 42) random sample of 5× as many subsidiaries
   that were not matched and share no name with any positive.

2. **Features** — `backend/ml/evaluate.py` recomputes the production
   classifier's 9 features from the raw CSVs (cross_cik, name_similarity,
   suffix_type, first_seen_lag, batch_size, has_functional, has_geographic,
   token_count, is_active). No heuristic label is used as a feature;
   `cross_cik` is kept because it is derived from the raw data, not from a
   label.

3. **Models** — XGBoost (class-weighted, `scale_pos_weight = neg/pos`) and a
   logistic-regression baseline, 5-fold stratified cross-validation
   (seed 42). The rule-based heuristic (`_infer_type_from_name`) is scored on
   the same rows. The best model by CV ROC-AUC is refit on all rows and saved
   to `data/classifier_gt_model.joblib` (with the ≤10%-FPR threshold).

## Counts

| | |
|---|---|
| Wikidata M&A pairs | 5,000 |
| … with acquirer present in dataset | 839 |
| Matched to a subsidiary (Jaccard ≥ 0.5) | 321 |
| Matched via relaxed subset rule (≥ 0.4) | 1 |
| Duplicate hits collapsed | 44 |
| **Unique positives** | **278** |
| **Presumed negatives (5×)** | **1,390** |

## Results (5-fold stratified CV, threshold 0.5 unless stated)

| Model | Recall | Precision | F1 | ROC-AUC | Recall @ FPR ≤ 10% |
|---|---|---|---|---|---|
| Heuristic (rule-based) | 0.500 | 0.235 | 0.320 | 0.587 | n/a (its FPR is 32.5%) |
| Logistic regression | 0.705 | 0.283 | 0.404 | 0.730 | 0.338 |
| **XGBoost (saved)** | 0.597 | 0.369 | 0.456 | **0.771** | **0.406** |

Interpretation:

- The heuristic finds **half** of known acquisitions and is wrong about
  **3 out of 4** subsidiaries it flags, while flagging 32.5% of presumed
  internals as acquisitions.
- XGBoost on the same 9 features improves ranking quality (AUC 0.77 vs 0.59)
  and precision, but at a 0.5 threshold its recall (0.60) is only modestly
  above the heuristic's 0.50. If you require the false-positive rate on
  presumed internals to stay at or below 10%, you only catch **41%** of known
  acquisitions.
- Nothing here is anywhere near 94%. This is a hard problem: Exhibit 21 names
  alone carry limited signal about how an entity was obtained.

## Caveats

- **Negatives are unlabeled, not verified (PU learning).** Wikidata's M&A
  coverage is incomplete, so some "negatives" are real acquisitions. All
  precision/FPR figures are therefore *lower bounds*; recall on the 278
  verified positives is the trustworthy number.
- **Match bias.** Positives are acquisitions whose acquired name survived
  into Exhibit 21 roughly intact; acquisitions that were renamed on
  integration are under-represented, which likely *flatters* name-based
  features.
- 278 positives is a small set; 5-fold metrics move by a few points across
  seeds.
- The "Fast" and "Full AI" enrichment modes have **not** been independently
  measured; no accuracy figure is claimed for them.

## Reproduce

```bash
.venv/bin/python -m backend.ml.build_ground_truth   # writes data/ground_truth_labeled.csv
.venv/bin/python -m backend.ml.evaluate             # prints the table, saves data/classifier_gt_model.joblib
```

Environment: xgboost 3.4.1, scikit-learn 1.9.0. Both scripts are
deterministic (seed 42; repeated runs are byte-identical).
