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
    matched to rows of ``data/subsidiaries.csv.gz``.

    Name normalization (both sides): lowercase, ``&`` -> ``and``, hyphens /
    slashes / apostrophes / punctuation collapsed, entity suffixes and filler
    words stripped (``NOISE`` from build_training_data).

    Acquirer -> CIK (first rule that hits wins):
      * exact normalized-word tuple match against ``companies.csv.gz``;
      * order-insensitive word-set match;
      * initialism: a single-token acquirer ("AMD") matches a company whose
        word initials spell it ("advanced micro devices");
      * subset: acquirer words are a subset of the company words, the company
        has at most one extra word, and the acquirer carries a distinctive
        token (document frequency over distinct subsidiary names <= RARE_DF)
        -- matches "Amazon" -> "amazon com inc".

    Acquired -> subsidiary of the matched company, best candidate by
    (rule priority, Jaccard over normalized words):
      * strict: Jaccard >= 0.5, and either the shared words include a
        non-generic token (df <= GENERIC_DF) or Jaccard >= HIGH_JACCARD;
      * containment: every acquired word appears in the subsidiary name, the
        acquired name has a distinctive token (df <= RARE_DF) beyond the
        parent's own brand words, and the extra subsidiary words are few or
        mostly the parent brand (handles "Rotring" vs
        "sanford rotring (gb) limited").

    Label-noise guards (each drops matches that a manual audit showed to be
    internal entities, not acquisitions):
      * skip Wikidata pairs whose acquired words are a subset of the acquirer
        words -- self/rename pairs like "Dell" owned by "Dell Technologies";
      * skip subsidiaries whose words are a subset of the parent's own words
        ("microsoft ag" under Microsoft is a branch, not an acquisition);
      * require the acquired/subsidiary word overlap to contain at least one
        token outside the parent + acquirer brand words (otherwise pairs like
        "Microsoft TechNet" match arbitrary parent-brand subsidiaries).

    One subsidiary per Wikidata pair (best match only), de-duplicated on
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
    trustworthy number.  A smaller caveat applies to positives: Wikidata
    "owned by" also lists some internally-created divisions; the guards above
    remove the auditable cases but coverage is not perfect.

Output
------
``data/ground_truth_labeled.csv`` with the raw columns needed to recompute
features (no heuristic label is stored as a feature):

    cik, sub_name, parent_name, first_seen, first_filing, time_out,
    batch_size, cross_cik, num_subsidiaries, num_filings, first_token_spread,
    label, match_jaccard, match_rule, wikidata_company, wikidata_acquirer

``first_token_spread`` = number of distinct CIKs that have a subsidiary whose
first normalized word equals this subsidiary's first normalized word (brand
spread; computable for any subsidiary, no Wikidata involved).

Reproduce:  ``.venv/bin/python -m backend.ml.build_ground_truth``
"""

import csv
import gzip
import random
import re
from collections import Counter, defaultdict
from pathlib import Path

from backend.ml.build_training_data import NOISE

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
COMPANIES_CSV = DATA_DIR / "companies.csv.gz"
SUBSIDIARIES_CSV = DATA_DIR / "subsidiaries.csv.gz"
WIKIDATA_CSV = DATA_DIR / "wikidata_ma_ground_truth.csv"
OUTPUT_CSV = DATA_DIR / "ground_truth_labeled.csv"

RARE_DF = 100          # df threshold for a "distinctive" token
GENERIC_DF = 800       # df threshold above which a token is "generic"
STRICT_JACCARD = 0.5
HIGH_JACCARD = 0.65    # strict match allowed on generic tokens at this level
NEGATIVE_RATIO = 5
SEED = 42

_PUNCT_RE = re.compile(r"[^\w\s]")

OUTPUT_FIELDS = [
    "cik", "sub_name", "parent_name", "first_seen", "first_filing", "time_out",
    "batch_size", "cross_cik", "num_subsidiaries", "num_filings",
    "first_token_spread", "label", "match_jaccard", "match_rule",
    "wikidata_company", "wikidata_acquirer",
]


def norm(name: str) -> str:
    return name.lower().strip()


def norm_words(name: str) -> list:
    """Normalized meaningful words: & -> and, hyphen/slash/apostrophe/punct
    collapsed, entity suffixes + filler stripped."""
    s = (name.lower().replace("&", " and ").replace("-", " ")
         .replace("/", " ").replace("'", ""))
    s = _PUNCT_RE.sub(" ", s)
    return [w for w in s.split() if w not in NOISE and len(w) > 1]


def jaccard_words(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def initialism(words: list) -> str:
    return "".join(w[0] for w in words) if len(words) >= 2 else ""


def first_token(name: str) -> str:
    w = norm_words(name)
    return w[0] if w else ""


def load_raw():
    """Load companies, subsidiaries and derived indexes.

    Returns (companies, subs_by_cik, batch_size, name_ciks, tok_df, ft_ciks):
      batch_size[(cik, first_seen)] -> number of subs first seen that day
      name_ciks[norm(sub_name)]     -> set of CIKs the name appears under
      tok_df[token]                 -> distinct sub names containing token
      ft_ciks[first_token]          -> set of CIKs with a sub starting with it
    """
    companies = {}
    with gzip.open(COMPANIES_CSV, "rt") as f:
        for r in csv.DictReader(f):
            companies[r["cik"]] = r

    subs_by_cik = defaultdict(list)
    batch_size = Counter()
    name_ciks = defaultdict(set)
    tok_df = Counter()
    ft_ciks = defaultdict(set)
    seen_names = set()
    with gzip.open(SUBSIDIARIES_CSV, "rt") as f:
        for r in csv.DictReader(f):
            subs_by_cik[r["cik"]].append(r)
            batch_size[(r["cik"], r["first_seen"])] += 1
            name_ciks[norm(r["sub_name"])].add(r["cik"])
            ft = first_token(r["sub_name"])
            if ft:
                ft_ciks[ft].add(r["cik"])
            nm = norm(r["sub_name"])
            if nm not in seen_names:
                seen_names.add(nm)
                for w in set(norm_words(r["sub_name"])):
                    tok_df[w] += 1
    return companies, subs_by_cik, batch_size, name_ciks, tok_df, ft_ciks


def build_acquirer_index(companies):
    by_tuple = defaultdict(list)
    by_set = defaultdict(list)
    by_init = defaultdict(list)
    comp_words = {}
    for c in companies.values():
        w = norm_words(c["company_name"])
        comp_words[c["cik"]] = w
        if not w:
            continue
        by_tuple[tuple(w)].append(c)
        by_set[frozenset(w)].append(c)
        ini = initialism(w)
        if ini and len(ini) >= 3:
            by_init[ini].append(c)
    return by_tuple, by_set, by_init, comp_words


def acquirer_candidates(name, idx, companies, tok_df):
    by_tuple, by_set, by_init, comp_words = idx
    w = norm_words(name)
    if not w:
        return [], "none"
    if tuple(w) in by_tuple:
        return by_tuple[tuple(w)], "tuple"
    if frozenset(w) in by_set:
        return by_set[frozenset(w)], "set"
    if len(w) == 1 and w[0] in by_init:
        return by_init[w[0]], "initialism"
    aw = set(w)
    if min((tok_df[t] for t in aw), default=10 ** 9) <= RARE_DF:
        hits = [c for c in companies.values()
                if aw <= set(comp_words[c["cik"]])
                and len(set(comp_words[c["cik"]])) - len(aw) <= 1]
        if hits:
            return hits, "subset"
    return [], "none"


def match_acquired(g_company, g_acquirer, cands, subs_by_cik, comp_words, tok_df):
    """Best (company, sub, jaccard, rule) for one Wikidata pair, or None."""
    aw = set(norm_words(g_company))
    qw = set(norm_words(g_acquirer))
    if not aw or aw <= qw:            # self/rename pair: not identifiable
        return None
    best = None
    for c in cands:
        pw = set(comp_words.get(c["cik"], []))
        for s in subs_by_cik.get(c["cik"], []):
            sw = set(norm_words(s["sub_name"]))
            if not sw or sw <= pw:    # sub is just the parent's own brand
                continue
            inter = aw & sw
            if not inter or inter <= (pw | qw):   # overlap is all parent brand
                continue
            j = jaccard_words(aw, sw)
            cand = None
            if j >= STRICT_JACCARD and (
                    min(tok_df[w] for w in inter) <= GENERIC_DF or j >= HIGH_JACCARD):
                cand = (2, j, "strict")
            elif (aw <= sw
                  and min((tok_df[w] for w in aw - pw - qw), default=10 ** 9) <= RARE_DF
                  and (len(sw - aw) <= 2 or len((sw - aw) - pw) <= 2 or j >= 0.4)):
                cand = (1, j, "containment")
            if cand and (best is None or (cand[0], cand[1]) > (best[0], best[1])):
                best = (cand[0], cand[1], c, s, j, cand[2])
    if best is None:
        return None
    return best[2], best[3], best[4], best[5]


def match_positives(companies, subs_by_cik, tok_df):
    idx = build_acquirer_index(companies)
    comp_words = idx[3]
    stats = Counter()
    positives = {}
    with open(WIKIDATA_CSV) as f:
        gt = list(csv.DictReader(f))
    stats["wikidata_pairs"] = len(gt)

    for g in gt:
        cands, how = acquirer_candidates(g["acquirer"], idx, companies, tok_df)
        if not cands:
            continue
        stats["acquirer_in_dataset"] += 1
        stats[f"acquirer_via_{how}"] += 1
        m = match_acquired(g["company"], g["acquirer"], cands,
                           subs_by_cik, comp_words, tok_df)
        if m is None:
            continue
        c, s, j, rule = m
        key = (c["cik"], norm(s["sub_name"]))
        if key in positives:
            stats["duplicate_sub_hits"] += 1
            continue
        positives[key] = {
            "company": c, "sub": s, "jaccard": j, "rule": rule,
            "wikidata_company": g["company"], "wikidata_acquirer": g["acquirer"],
        }
        stats[f"matched_{rule}"] += 1
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


def make_row(s, c, batch_size, name_ciks, ft_ciks, label,
             jaccard=0.0, rule="", wd_company="", wd_acquirer=""):
    ft = first_token(s["sub_name"])
    return {
        "cik": s["cik"],
        "sub_name": s["sub_name"],
        "parent_name": c["company_name"],
        "first_seen": s["first_seen"],
        "first_filing": c["first_filing"],
        "time_out": s["time_out"],
        "batch_size": batch_size[(s["cik"], s["first_seen"])],
        "cross_cik": int(len(name_ciks[norm(s["sub_name"])]) > 1),
        "num_subsidiaries": c["num_subsidiaries"],
        "num_filings": c["num_filings"],
        "first_token_spread": len(ft_ciks[ft]) if ft else 0,
        "label": label,
        "match_jaccard": round(jaccard, 4),
        "match_rule": rule,
        "wikidata_company": wd_company,
        "wikidata_acquirer": wd_acquirer,
    }


def build():
    companies, subs_by_cik, batch_size, name_ciks, tok_df, ft_ciks = load_raw()
    positives, stats = match_positives(companies, subs_by_cik, tok_df)

    rows = [
        make_row(p["sub"], p["company"], batch_size, name_ciks, ft_ciks, 1,
                 p["jaccard"], p["rule"], p["wikidata_company"], p["wikidata_acquirer"])
        for p in positives.values()
    ]
    negatives = sample_negatives(positives, subs_by_cik, NEGATIVE_RATIO * len(positives))
    rows += [make_row(s, companies[s["cik"]], batch_size, name_ciks, ft_ciks, 0)
             for s in negatives]
    stats["negatives"] = len(negatives)

    with open(OUTPUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=OUTPUT_FIELDS)
        w.writeheader()
        w.writerows(rows)

    print("Ground-truth matching")
    for k in ["wikidata_pairs", "acquirer_in_dataset", "acquirer_via_tuple",
              "acquirer_via_set", "acquirer_via_initialism", "acquirer_via_subset",
              "matched_strict", "matched_containment", "duplicate_sub_hits",
              "positives_unique", "negatives"]:
        print(f"  {k:24s} {stats[k]}")
    print(f"Wrote {len(rows)} rows to {OUTPUT_CSV}")
    return stats


if __name__ == "__main__":
    build()
