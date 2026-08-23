"""Build a leakage-free labeled set for evaluating the acquisition classifier.

Why this exists
---------------
``data/training_data.csv`` is NOT usable for measuring accuracy: every
"acquisition" row was labeled by the cross-CIK heuristic and every "internal"
row by the parent-name-match heuristic, and both signals are also model
features.  Any model trained on it simply re-learns the labeling rules.

This script builds labels from an *external* source instead:

Positives (label = 1, "acquisition")
    Wikidata "owned by / acquired by" pairs (``data/wikidata_ma_ground_truth.csv``)
    matched to rows of ``data/subsidiaries.csv.gz``:

    * acquirer  -> a row of ``companies.csv.gz`` whose ``meaningful_words``
      tuple equals the acquirer's ``meaningful_words`` tuple (exact match on
      noise-stripped name);
    * acquired  -> the subsidiary of that company with the highest Jaccard
      similarity to the Wikidata company name.  Accepted when
      Jaccard >= 0.5, OR Jaccard >= 0.4 and every meaningful word of the
      Wikidata name appears in the subsidiary name (handles
      "Instagram" vs "Instagram, LLC Delaware" style suffix padding).
    * one subsidiary per Wikidata pair (best match only), de-duplicated on
      (cik, sub_name).

Negatives (label = 0, presumed "internal")
    A seeded (``random.Random(42)``) sample of NEGATIVE_RATIO x positives drawn
    from subsidiaries that (a) were not matched to any Wikidata pair and
    (b) do not share a normalized name with any positive (so a positive's
    cross-CIK twin can never end up in the negative set).

    **PU-learning caveat: negatives are unlabeled, not verified.**  Wikidata's
    M&A coverage is far from complete, so an unknown fraction of these
    "negatives" are real acquisitions that Wikidata simply does not list.
    Consequently every precision / false-positive-rate number computed on this
    set is a *lower bound* on true precision, and a classifier that "wrongly"
    flags a negative may in fact be right.  Recall on the positives is the
    trustworthy number.

Output
------
``data/ground_truth_labeled.csv`` with the raw columns needed to recompute
features (no heuristic label is stored as a feature):

    cik, sub_name, parent_name, first_seen, first_filing, time_out,
    batch_size, cross_cik, label, match_jaccard, wikidata_company,
    wikidata_acquirer

Reproduce:  ``.venv/bin/python -m backend.ml.build_ground_truth``
"""

import csv
import gzip
import random
from collections import Counter, defaultdict
from pathlib import Path

from backend.ml.build_training_data import jaccard_similarity, meaningful_words

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
COMPANIES_CSV = DATA_DIR / "companies.csv.gz"
SUBSIDIARIES_CSV = DATA_DIR / "subsidiaries.csv.gz"
WIKIDATA_CSV = DATA_DIR / "wikidata_ma_ground_truth.csv"
OUTPUT_CSV = DATA_DIR / "ground_truth_labeled.csv"

STRICT_JACCARD = 0.5      # accept unconditionally
RELAXED_JACCARD = 0.4     # accept only if acquired words are a subset of sub words
NEGATIVE_RATIO = 5
SEED = 42

OUTPUT_FIELDS = [
    "cik", "sub_name", "parent_name", "first_seen", "first_filing", "time_out",
    "batch_size", "cross_cik", "label", "match_jaccard",
    "wikidata_company", "wikidata_acquirer",
]


def norm(name: str) -> str:
    return name.lower().strip()


def load_raw():
    """Load companies, subsidiaries and the derived batch/cross-CIK indexes.

    Returns (companies_by_cik, subs_by_cik, batch_size, name_ciks):
      batch_size[(cik, first_seen)] -> number of subs first seen that day
      name_ciks[norm(sub_name)]     -> set of CIKs the name appears under
    """
    companies = {}
    with gzip.open(COMPANIES_CSV, "rt") as f:
        for r in csv.DictReader(f):
            companies[r["cik"]] = r

    subs_by_cik = defaultdict(list)
    batch_size = Counter()
    name_ciks = defaultdict(set)
    with gzip.open(SUBSIDIARIES_CSV, "rt") as f:
        for r in csv.DictReader(f):
            subs_by_cik[r["cik"]].append(r)
            batch_size[(r["cik"], r["first_seen"])] += 1
            name_ciks[norm(r["sub_name"])].add(r["cik"])
    return companies, subs_by_cik, batch_size, name_ciks


def match_positives(companies, subs_by_cik):
    """Match Wikidata acquisitions to dataset subsidiaries. Returns dict keyed
    by (cik, norm(sub_name)) -> match info, plus match statistics."""
    comp_by_words = defaultdict(list)
    for c in companies.values():
        key = tuple(meaningful_words(c["company_name"]))
        if key:
            comp_by_words[key].append(c)

    stats = Counter()
    positives = {}
    with open(WIKIDATA_CSV) as f:
        gt = list(csv.DictReader(f))
    stats["wikidata_pairs"] = len(gt)

    for g in gt:
        acq_key = tuple(meaningful_words(g["acquirer"]))
        if acq_key not in comp_by_words:
            continue
        stats["acquirer_in_dataset"] += 1
        acquired_words = set(meaningful_words(g["company"]))
        if not acquired_words:
            continue

        best, best_j = None, 0.0
        for c in comp_by_words[acq_key]:
            for s in subs_by_cik.get(c["cik"], []):
                j = jaccard_similarity(g["company"], s["sub_name"])
                if j > best_j:
                    best_j, best = j, (c, s)
        if best is None:
            continue

        c, s = best
        subset = acquired_words <= set(meaningful_words(s["sub_name"]))
        if best_j >= STRICT_JACCARD:
            stats["matched_strict"] += 1
        elif best_j >= RELAXED_JACCARD and subset:
            stats["matched_relaxed_subset"] += 1
        else:
            continue

        key = (c["cik"], norm(s["sub_name"]))
        if key in positives:
            stats["duplicate_sub_hits"] += 1
            continue
        positives[key] = {
            "company": c, "sub": s, "jaccard": best_j,
            "wikidata_company": g["company"], "wikidata_acquirer": g["acquirer"],
        }
    stats["positives_unique"] = len(positives)
    return positives, stats


def sample_negatives(positives, subs_by_cik, n):
    """Seeded sample of unmatched subs not sharing a name with any positive."""
    positive_names = {k[1] for k in positives}
    pool = [
        s for rows in subs_by_cik.values() for s in rows
        if (s["cik"], norm(s["sub_name"])) not in positives
        and norm(s["sub_name"]) not in positive_names
    ]
    pool.sort(key=lambda s: (s["cik"], s["sub_name"], s["first_seen"]))  # determinism
    rng = random.Random(SEED)
    return rng.sample(pool, min(n, len(pool)))


def make_row(s, c, batch_size, name_ciks, label, jaccard=0.0, wd_company="", wd_acquirer=""):
    return {
        "cik": s["cik"],
        "sub_name": s["sub_name"],
        "parent_name": c["company_name"],
        "first_seen": s["first_seen"],
        "first_filing": c["first_filing"],
        "time_out": s["time_out"],
        "batch_size": batch_size[(s["cik"], s["first_seen"])],
        "cross_cik": int(len(name_ciks[norm(s["sub_name"])]) > 1),
        "label": label,
        "match_jaccard": round(jaccard, 4),
        "wikidata_company": wd_company,
        "wikidata_acquirer": wd_acquirer,
    }


def build():
    companies, subs_by_cik, batch_size, name_ciks = load_raw()
    positives, stats = match_positives(companies, subs_by_cik)

    rows = [
        make_row(p["sub"], p["company"], batch_size, name_ciks, 1,
                 p["jaccard"], p["wikidata_company"], p["wikidata_acquirer"])
        for p in positives.values()
    ]
    negatives = sample_negatives(positives, subs_by_cik, NEGATIVE_RATIO * len(positives))
    rows += [make_row(s, companies[s["cik"]], batch_size, name_ciks, 0) for s in negatives]
    stats["negatives"] = len(negatives)

    with open(OUTPUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=OUTPUT_FIELDS)
        w.writeheader()
        w.writerows(rows)

    print("Ground-truth matching")
    for k in ["wikidata_pairs", "acquirer_in_dataset", "matched_strict",
              "matched_relaxed_subset", "duplicate_sub_hits", "positives_unique", "negatives"]:
        print(f"  {k:24s} {stats[k]}")
    print(f"Wrote {len(rows)} rows to {OUTPUT_CSV}")
    return stats


if __name__ == "__main__":
    build()
