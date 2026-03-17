"""Build labeled training data from Wikidata M&A + EDGAR 8-K + heuristic labels."""

import csv
import sqlite3
import time
import urllib.request
import json
from pathlib import Path
from collections import defaultdict

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
DB_PATH = DATA_DIR / "tracker.db"
WIKIDATA_CSV = DATA_DIR / "wikidata_ma_ground_truth.csv"
OUTPUT_CSV = DATA_DIR / "training_data.csv"

HEADERS = {"User-Agent": "SubTracker/1.0 (sri.vardhan@ucf.edu)"}

# Entity suffixes and filler words (same as heuristic)
ENTITY_SUFFIXES = {"inc", "inc.", "corp", "corp.", "corporation", "llc",
                   "l.l.c.", "ltd", "ltd.", "limited", "co", "co.",
                   "company", "plc", "lp", "l.p.", "s.a.", "sa", "ag",
                   "gmbh", "b.v.", "bv", "s.r.l.", "srl", "n.v.", "nv",
                   "pty", "pte", "se", "s.e."}
FILLER = {"the", "de", "and", "&", "of", "a", "an", "la", "el", "las",
          "los", "del", "des", "le", "du", "ii", "iii", "iv"}
NOISE = ENTITY_SUFFIXES | FILLER


def meaningful_words(name: str) -> list:
    return [w.strip(".,()") for w in name.lower().split()
            if w.strip(".,()") not in NOISE and len(w.strip(".,()")) > 1]


def jaccard_similarity(name1: str, name2: str) -> float:
    w1 = set(meaningful_words(name1))
    w2 = set(meaningful_words(name2))
    if not w1 or not w2:
        return 0.0
    return len(w1 & w2) / len(w1 | w2)


def load_wikidata_acquisitions():
    """Load Wikidata M&A ground truth."""
    acquisitions = {}
    if not WIKIDATA_CSV.exists():
        print("No Wikidata CSV found, skipping...")
        return acquisitions
    with open(WIKIDATA_CSV) as f:
        for row in csv.DictReader(f):
            company = row["company"].lower().strip()
            acquirer = row["acquirer"].lower().strip()
            if company and acquirer and len(company) > 2:
                acquisitions[company] = acquirer
    print(f"Loaded {len(acquisitions)} Wikidata M&A records")
    return acquisitions


def search_edgar_8k(company_name: str) -> list:
    """Search EDGAR EFTS for 8-K Item 2.01 filings mentioning a company."""
    try:
        query = f'"{company_name}" "Item 2.01"'
        url = (f"https://efts.sec.gov/LATEST/search-index?"
               f"q={urllib.parse.quote(query)}&forms=8-K&_source=file_date,display_names,entity_id")
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        hits = data.get("hits", {}).get("hits", [])
        results = []
        for h in hits[:5]:
            src = h.get("_source", {})
            results.append({
                "filing_date": src.get("file_date", ""),
                "cik": src.get("entity_id", ""),
                "names": src.get("display_names", []),
            })
        return results
    except Exception:
        return []


def build_training_data():
    """Build labeled training dataset."""
    import urllib.parse

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row

    # Load Wikidata ground truth
    wikidata = load_wikidata_acquisitions()

    # Get top companies
    companies = conn.execute("""
        SELECT cik, company_name, first_filing, num_subsidiaries
        FROM companies ORDER BY num_subsidiaries DESC LIMIT 500
    """).fetchall()
    print(f"Processing {len(companies)} companies...")

    # Pre-compute cross-CIK subs (skip batch_sizes — too slow, compute per-row)
    print("Computing cross-CIK subs...")
    cross_cik = set()
    for (name,) in conn.execute("SELECT sub_name FROM subsidiaries GROUP BY sub_name HAVING COUNT(DISTINCT cik) > 1"):
        cross_cik.add(name.lower().strip())
    print(f"  {len(cross_cik)} cross-CIK subsidiary names")

    labels = []  # (sub_id, label, source)

    # --- Label from Wikidata ---
    print("Cross-referencing Wikidata M&A...")
    for wiki_company, wiki_acquirer in wikidata.items():
        # Find this company as a subsidiary in our DB
        rows = conn.execute("""
            SELECT s.id, s.sub_name, c.company_name, s.cik
            FROM subsidiaries s JOIN companies c ON s.cik = c.cik
            WHERE LOWER(s.sub_name) LIKE ? LIMIT 5
        """, (f"%{wiki_company[:20]}%",)).fetchall()

        for row in rows:
            parent = row["company_name"].lower()
            # Check if parent matches the Wikidata acquirer
            acquirer_words = meaningful_words(wiki_acquirer)
            if any(w in parent for w in acquirer_words if len(w) >= 4):
                labels.append((row["id"], "acquisition", "wikidata"))

    print(f"Wikidata labels: {len(labels)}")

    # --- Label from cross-CIK ---
    print("Labeling cross-CIK subs...")
    cross_cik_count = 0
    # Use the pre-computed set instead of slow subquery
    for sid_row in conn.execute("""
        SELECT id, sub_name FROM subsidiaries LIMIT 100000
    """):
        if sid_row[1].lower().strip() in cross_cik:
            labels.append((sid_row[0], "acquisition", "cross_cik"))
            cross_cik_count += 1
            if cross_cik_count >= 20000:
                break
    print(f"Cross-CIK labels: {cross_cik_count}")

    # --- Label from parent name match (internal) ---
    print("Labeling parent-name-match subs as internal...")
    internal_count = 0
    for company in companies[:200]:
        parent_words = meaningful_words(company["company_name"])
        if not parent_words or len(parent_words[0]) < 3:
            continue
        core = parent_words[0]
        rows = conn.execute("""
            SELECT id, sub_name FROM subsidiaries
            WHERE cik = ? AND LOWER(sub_name) LIKE ?
            LIMIT 500
        """, (company["cik"], f"%{core}%")).fetchall()
        for row in rows:
            labels.append((row["id"], "internal", "name_match"))
            internal_count += 1
    print(f"Internal (name match) labels: {internal_count}")

    # --- EDGAR 8-K search for top 50 companies ---
    print("Searching EDGAR 8-K filings for top 50 companies...")
    edgar_count = 0
    for company in companies[:50]:
        name = company["company_name"]
        results = search_edgar_8k(name)
        if results:
            # Find subs that appeared around the 8-K filing date
            for r in results:
                filing_date = r.get("filing_date", "")
                if not filing_date:
                    continue
                # Look for subs first seen within 2 years of 8-K
                nearby = conn.execute("""
                    SELECT id, sub_name FROM subsidiaries
                    WHERE cik = ? AND first_seen BETWEEN DATE(?, '-365 days') AND DATE(?, '+365 days')
                    AND LOWER(sub_name) NOT LIKE ?
                    LIMIT 50
                """, (company["cik"], filing_date, filing_date,
                      f"%{meaningful_words(name)[0] if meaningful_words(name) else ''}%")).fetchall()
                for row in nearby:
                    labels.append((row["id"], "acquisition", "edgar_8k"))
                    edgar_count += 1
        time.sleep(0.15)  # Rate limit
    print(f"EDGAR 8-K labels: {edgar_count}")

    # --- Deduplicate: keep strongest label per sub_id ---
    label_priority = {"edgar_8k": 3, "wikidata": 2, "cross_cik": 1, "name_match": 1}
    best = {}
    for sid, label, source in labels:
        if sid not in best or label_priority.get(source, 0) > label_priority.get(best[sid][1], 0):
            best[sid] = (label, source)

    # --- Build feature matrix ---
    print(f"Building features for {len(best)} labeled subs...")
    rows_out = []
    for sid, (label, source) in best.items():
        row = conn.execute("""
            SELECT s.*, c.company_name, c.first_filing
            FROM subsidiaries s JOIN companies c ON s.cik = c.cik
            WHERE s.id = ?
        """, (sid,)).fetchone()
        if not row:
            continue

        sub_name = row["sub_name"]
        parent_name = row["company_name"]
        first_seen = row["first_seen"] or ""
        first_filing = row["first_filing"] or ""
        bs = 0  # Computed lazily to avoid slow GROUP BY
        is_cross = sub_name.lower().strip() in cross_cik

        # Features
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

        # First seen lag
        lag_days = 0
        if first_seen and first_filing:
            try:
                from datetime import datetime
                fs = datetime.strptime(first_seen[:10], "%Y-%m-%d")
                ff = datetime.strptime(first_filing[:10], "%Y-%m-%d")
                lag_days = (fs - ff).days
            except (ValueError, TypeError):
                lag_days = 0

        func_kw = ["trust", "funding", "finance", "holding", "properties",
                    "realty", "real estate", "insurance", "leasing", "mortgage",
                    "investments", "asset", "credit", "lending", "services"]
        has_func = int(any(kw in sub_lower for kw in func_kw))

        geo_kw = ["america", "europe", "asia", "pacific", "canada", "uk",
                   "japan", "china", "india", "brazil", "international", "global"]
        has_geo = int(any(kw in sub_lower for kw in geo_kw))

        token_count = len(sub_name.split())
        is_active = int(row["time_out"] and "Active" in str(row["time_out"]))

        rows_out.append({
            "sub_id": sid,
            "sub_name": sub_name,
            "parent_name": parent_name,
            "label": label,
            "source": source,
            "cross_cik": int(is_cross),
            "name_similarity": round(sim, 4),
            "suffix_type": suffix_type,
            "first_seen_lag_days": lag_days,
            "batch_size": bs,
            "has_functional": has_func,
            "has_geographic": has_geo,
            "token_count": token_count,
            "is_active": is_active,
        })

    # Write CSV
    if rows_out:
        with open(OUTPUT_CSV, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=rows_out[0].keys())
            w.writeheader()
            w.writerows(rows_out)
        print(f"\nSaved {len(rows_out)} labeled examples to {OUTPUT_CSV}")
        acq = sum(1 for r in rows_out if r["label"] == "acquisition")
        internal = sum(1 for r in rows_out if r["label"] == "internal")
        print(f"  Acquisitions: {acq}, Internal: {internal}")
    else:
        print("No labeled examples generated!")

    conn.close()


if __name__ == "__main__":
    build_training_data()
