"""Merge scraped Exhibit 21 data into the existing database."""

from __future__ import annotations

from collections import Counter
from typing import Dict, List

from backend.database import get_db


def merge_scraped_data(new_rows: List[Dict[str, str]]) -> int:
    """
    Merge newly scraped data into the database.

    new_rows format: [{cik, fdate, comp_name, sub_name}, ...]

    Inserts new filing dates and company data, then recomputes
    timelines for affected CIKs using the same algorithm as data_loader.py.

    Returns the number of new subsidiaries added/updated.
    """
    if not new_rows:
        return 0

    # Group by CIK
    cik_data = {}  # type: Dict[str, List[Dict[str, str]]]
    for row in new_rows:
        cik = row["cik"]
        if cik not in cik_data:
            cik_data[cik] = []
        cik_data[cik].append(row)

    total_updated = 0

    with get_db() as conn:
        for cik, rows in cik_data.items():
            comp_name = rows[0]["comp_name"]

            # Upsert company
            existing = conn.execute(
                "SELECT cik FROM companies WHERE cik = ?", (cik,)
            ).fetchone()

            if not existing:
                conn.execute(
                    """INSERT INTO companies (cik, company_name, num_filings,
                       first_filing, last_filing, num_subsidiaries)
                       VALUES (?, ?, 0, NULL, NULL, 0)""",
                    (cik, comp_name),
                )

            # Insert filing dates
            fdates = set()  # type: set
            for row in rows:
                fdate = row["fdate"]
                fdates.add(fdate)
                conn.execute(
                    "INSERT OR IGNORE INTO filing_dates (cik, fdate) VALUES (?, ?)",
                    (cik, fdate),
                )

            # Get all filing dates for this CIK
            all_fdates = [
                r[0]
                for r in conn.execute(
                    "SELECT fdate FROM filing_dates WHERE cik = ? ORDER BY fdate",
                    (cik,),
                ).fetchall()
            ]

            # Get existing subsidiaries for this CIK
            existing_subs = {}  # type: Dict[str, dict]
            for s in conn.execute(
                "SELECT id, sub_name, first_seen, last_seen FROM subsidiaries WHERE cik = ?",
                (cik,),
            ).fetchall():
                existing_subs[s[1].lower().strip()] = {
                    "id": s[0],
                    "sub_name": s[1],
                    "first_seen": s[2],
                    "last_seen": s[3],
                }

            # Group new rows by subsidiary name
            sub_filings = {}  # type: Dict[str, List[str]]
            for row in rows:
                key = row["sub_name"].lower().strip()
                if key not in sub_filings:
                    sub_filings[key] = []
                sub_filings[key].append(row["fdate"])

            # Insert or update subsidiaries and recompute timelines
            for sub_key, filing_dates in sub_filings.items():
                display_name = next(
                    r["sub_name"]
                    for r in rows
                    if r["sub_name"].lower().strip() == sub_key
                )
                min_fdate = min(filing_dates)
                max_fdate = max(filing_dates)

                if sub_key in existing_subs:
                    # Update existing: expand first_seen / last_seen
                    ex = existing_subs[sub_key]
                    new_first = min(ex["first_seen"], min_fdate)
                    new_last = max(ex["last_seen"], max_fdate)

                    time_in, time_out, confidence = _compute_timeline(
                        new_first, new_last, all_fdates
                    )

                    conn.execute(
                        """UPDATE subsidiaries
                           SET first_seen = ?, last_seen = ?,
                               time_in = ?, time_out = ?, confidence = ?
                           WHERE id = ?""",
                        (new_first, new_last, time_in, time_out, confidence, ex["id"]),
                    )
                else:
                    # Insert new subsidiary
                    time_in, time_out, confidence = _compute_timeline(
                        min_fdate, max_fdate, all_fdates
                    )

                    conn.execute(
                        """INSERT INTO subsidiaries
                           (cik, sub_name, first_seen, last_seen, time_in, time_out, confidence)
                           VALUES (?, ?, ?, ?, ?, ?, ?)""",
                        (cik, display_name, min_fdate, max_fdate, time_in, time_out, confidence),
                    )

                total_updated += 1

            # Update company stats
            num_filings = len(all_fdates)
            num_subs = conn.execute(
                "SELECT COUNT(*) FROM subsidiaries WHERE cik = ?", (cik,)
            ).fetchone()[0]

            conn.execute(
                """UPDATE companies
                   SET num_filings = ?, first_filing = ?, last_filing = ?,
                       num_subsidiaries = ?, company_name = ?
                   WHERE cik = ?""",
                (
                    num_filings,
                    all_fdates[0] if all_fdates else None,
                    all_fdates[-1] if all_fdates else None,
                    num_subs,
                    comp_name,
                    cik,
                ),
            )

    return total_updated


def _compute_timeline(
    first_seen: str, last_seen: str, all_fdates: List[str]
) -> tuple:
    """
    Compute TimeIn, TimeOut, and Confidence for a subsidiary.
    Same algorithm as data_loader.compute_timelines.
    """
    if not all_fdates:
        return ("Unknown", "Unknown", "LOW")

    earliest_filing = all_fdates[0]
    latest_filing = all_fdates[-1]

    # TimeIn
    if first_seen <= earliest_filing:
        time_in = "On or before %s" % earliest_filing
        confidence_in = "LOW"
    else:
        prev_filing = None
        for f in all_fdates:
            if f < first_seen:
                prev_filing = f
            else:
                break
        if prev_filing is not None:
            time_in = "Between %s and %s" % (prev_filing, first_seen)
            confidence_in = "HIGH"
        else:
            time_in = "On or before %s" % first_seen
            confidence_in = "LOW"

    # TimeOut
    if last_seen >= latest_filing:
        time_out = "Active as of %s" % latest_filing
        confidence_out = "ACTIVE"
    else:
        next_filing = None
        for f in all_fdates:
            if f > last_seen:
                next_filing = f
                break
        if next_filing is not None:
            time_out = "Between %s and %s" % (last_seen, next_filing)
            confidence_out = "HIGH"
        else:
            time_out = "After %s" % last_seen
            confidence_out = "LOW"

    # Overall confidence
    if confidence_in == "HIGH" and confidence_out in ("HIGH", "ACTIVE"):
        confidence = "HIGH"
    elif confidence_in == "LOW" and confidence_out == "LOW":
        confidence = "LOW"
    else:
        confidence = "MEDIUM"

    return (time_in, time_out, confidence)
