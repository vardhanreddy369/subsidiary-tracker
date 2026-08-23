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

> **Superseded:** the numbers below are the v1 measurement, kept for the
> record. See **[v2](#v2-improved-ground-truth-matching-and-classifier)**
> below for the current method and numbers.

## Counts (v1)

| | |
|---|---|
| Wikidata M&A pairs | 5,000 |
| … with acquirer present in dataset | 839 |
| Matched to a subsidiary (Jaccard ≥ 0.5) | 321 |
| Matched via relaxed subset rule (≥ 0.4) | 1 |
| Duplicate hits collapsed | 44 |
| **Unique positives** | **278** |
| **Presumed negatives (5×)** | **1,390** |

## Results (v1: 5-fold stratified CV, threshold 0.5 unless stated)

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


## v2: improved ground-truth matching and classifier

v2 changes two things — the ground truth got larger *and cleaner*, and the
model got more features plus a small hyperparameter sweep. Method and code:
`backend/ml/build_ground_truth.py` (matching) and `backend/ml/evaluate.py`
(features, CV, sweep).

### Matching improvements (278 → 324 positives)

Normalization now handles `&` → `and`, hyphens, slashes, apostrophes and
leading "The" generically (no hardcoded company renames). New match rules,
each spot-checked on samples before being kept:

- acquirer → CIK: order-insensitive word-set match; initialism ("AMD" →
  "advanced micro devices"); subset with a distinctive token ("Amazon" →
  "amazon com inc"). 1,050 of 5,000 Wikidata pairs now have their acquirer in
  the dataset (was 839).
- acquired → subsidiary: strict Jaccard ≥ 0.5 (with a generic-token guard so
  "Italian Stock Exchange" can no longer match "american stock exchange"),
  plus a containment rule anchored on a rare token ("Rotring" →
  "sanford rotring (gb) limited"). A fuzzy token-set-ratio rule was tried and
  **dropped**: ~half its matches were garbage.
- label-noise guards removed 16 v1 "positives" that a manual audit showed were
  not acquisitions: Wikidata self/rename pairs ("Dell" owned by
  "Dell Technologies") and internal divisions matched to parent-brand
  subsidiaries ("Microsoft TechNet" → "microsoft ag").

| | v1 | v2 |
|---|---|---|
| Wikidata pairs with acquirer in dataset | 839 | 1,050 |
| Matched strict | 321 | 317 |
| Matched containment/relaxed | 1 | 7 |
| **Unique positives** | **278** | **324** (+62 new, −16 noise) |
| Presumed negatives (5×, seed 42) | 1,390 | 1,620 |

10 randomly sampled new matches, all verified correct: DRS Technologies →
Leonardo, Alexa Internet → Amazon, ATI Technologies → AMD (via initialism),
DataMarket → Qlik, Rotring → Newell, Tencent → Naspers, Jofa → Reebok,
Electro-Motive Diesel → Caterpillar, Roundy's → Kroger, LoveFilm → Amazon.

### Features (9 → 19)

The 9 production features, plus 10 leakage-free additions computable for any
subsidiary from the raw CSVs alone (nothing Wikidata-derived): parent
subsidiary count and filing count, first-seen year, whether the subsidiary
appeared in the parent's first filing, batch fraction, parent↔subsidiary brand
containment (both directions), character-trigram Jaccard, brand spread
(distinct CIKs sharing the first name token), and name length.

### Model selection

XGBoost hyperparameters were chosen by a 72-point grid (depth 3–8,
estimators 200–600, lr 0.03–0.1, scale_pos_weight ∈ {1, neg/pos}) scored on a
**separate** CV split (seed 0) so the reported seed-42 numbers are not the
selection numbers. Winner: depth 8, 400 estimators, lr 0.05,
scale_pos_weight = neg/pos. Rerun with
`.venv/bin/python -m backend.ml.evaluate --sweep`.

### Results (v2: 5-fold stratified CV, seed 42, threshold 0.5 unless stated)

| Model | Recall | Precision | F1 | ROC-AUC | Recall @ FPR ≤ 10% |
|---|---|---|---|---|---|
| Heuristic (rule-based) | 0.525 | 0.249 | 0.337 | 0.604 | n/a (its FPR is 31.7%) |
| Logistic regression | 0.704 | 0.304 | 0.424 | 0.758 | 0.373 |
| XGBoost (9 v1 features) | 0.611 | 0.452 | 0.520 | 0.821* | 0.503* |
| **XGBoost tuned, 19 features (saved)** | 0.426 | 0.566 | 0.486 | **0.823** | **0.509** |

\* the "9 v1 features" row above is the default-config XGBoost on all 19
features; the same default config restricted to the original 9 features on
this v2 ground truth scores AUC 0.768 / recall@FPR≤10% 0.432 — i.e. of the
total improvement over v1 (AUC 0.771 → 0.823, recall@FPR≤10% 0.406 → 0.509),
roughly half comes from the cleaner labels and half from the new features;
the sweep adds only a small amount.

At the ≤10%-FPR operating point the saved model now catches **51%** of known
acquisitions (v1: 41%). The tuned model's 0.5-threshold recall is lower
because its scores are better calibrated toward precision (0.57); use the
stored `threshold_fpr10` for the high-recall operating point.

All v1 caveats still apply (PU negatives → precision figures are lower
bounds; match bias toward name-preserving acquisitions; 324 positives is
still small). One more: Wikidata "owned by" includes some internally created
divisions; the v2 guards remove the auditable cases, but coverage is not
perfect.

### Reproduce (v2)

```bash
.venv/bin/python -m backend.ml.build_ground_truth   # writes data/ground_truth_labeled.csv (1,944 rows)
.venv/bin/python -m backend.ml.evaluate             # prints the v2 table, saves data/classifier_gt_model.joblib
.venv/bin/python -m backend.ml.evaluate --sweep     # additionally reruns the selection grid (slow)
```

Environment: xgboost 3.4.1, scikit-learn 1.9.0, numpy 2.5.2. Deterministic
(seeds 42/0).
