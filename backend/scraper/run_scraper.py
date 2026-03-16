"""
Standalone EDGAR Exhibit 21 scraper runner.
Scrapes 2006-2025 filings for all CIKs in the database.

Usage:
    cd subsidiary-tracker
    source venv/bin/activate
    python -m backend.scraper.run_scraper [--batch-size 50] [--resume]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sqlite3
import sys
import time
from pathlib import Path
from typing import Dict, List

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.scraper.exhibit21_scraper import (
    discover_exhibit21_filings,
    download_exhibit21,
)
from backend.scraper.exhibit21_parser import parse_exhibit21
from backend.scraper.merger import merge_scraped_data

DB_PATH = PROJECT_ROOT / "data" / "tracker.db"
PROGRESS_FILE = PROJECT_ROOT / "data" / "scraper_progress.json"

# SEC EDGAR rate limit: 10 req/sec, we use 8 concurrent
BATCH_SIZE = 50  # CIKs per batch
DELAY_BETWEEN_BATCHES = 2  # seconds


def get_all_ciks() -> List[tuple]:
    """Get all CIKs and company names from the database."""
    conn = sqlite3.connect(str(DB_PATH))
    rows = conn.execute(
        "SELECT cik, company_name FROM companies ORDER BY cik"
    ).fetchall()
    conn.close()
    return rows


def load_progress() -> set:
    """Load set of already-scraped CIKs."""
    if PROGRESS_FILE.exists():
        data = json.loads(PROGRESS_FILE.read_text())
        return set(data.get("completed_ciks", []))
    return set()


def save_progress(completed: set):
    """Save progress to disk."""
    PROGRESS_FILE.write_text(json.dumps({
        "completed_ciks": list(completed),
        "last_updated": time.strftime("%Y-%m-%d %H:%M:%S"),
    }))


async def scrape_one_cik(cik: str, comp_name: str) -> List[Dict[str, str]]:
    """Scrape all Exhibit 21 filings for one CIK (2006-2025)."""
    rows = []
    try:
        filings = await discover_exhibit21_filings(cik, 2006, 2025)
        for filing in filings:
            try:
                content = await download_exhibit21(filing["exhibit_url"])
                subs = parse_exhibit21(content, filing["exhibit_url"])
                fdate = filing["filing_date"]
                for sub_name in subs:
                    rows.append({
                        "cik": cik,
                        "fdate": fdate,
                        "comp_name": comp_name,
                        "sub_name": sub_name,
                    })
            except Exception:
                continue
    except Exception:
        pass
    return rows


def format_time(seconds: float) -> str:
    """Format seconds into human readable string."""
    if seconds < 60:
        return f"{seconds:.0f}s"
    elif seconds < 3600:
        return f"{seconds / 60:.1f}m"
    else:
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        return f"{h}h {m}m"


async def run_batch(batch: List[tuple]) -> List[Dict[str, str]]:
    """Scrape a batch of CIKs concurrently."""
    tasks = [scrape_one_cik(cik, name) for cik, name in batch]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    all_rows = []
    for result in results:
        if isinstance(result, list):
            all_rows.extend(result)
    return all_rows


async def main(batch_size: int = BATCH_SIZE, resume: bool = True):
    all_ciks = get_all_ciks()
    total = len(all_ciks)

    completed = load_progress() if resume else set()
    remaining = [(cik, name) for cik, name in all_ciks if cik not in completed]

    print(f"=" * 60)
    print(f"EDGAR Exhibit 21 Scraper (2006-2025)")
    print(f"=" * 60)
    print(f"Total CIKs:     {total:,}")
    print(f"Already done:   {len(completed):,}")
    print(f"Remaining:       {len(remaining):,}")
    print(f"Batch size:      {batch_size}")
    print(f"=" * 60)

    if not remaining:
        print("All CIKs already scraped! Use --no-resume to re-scrape.")
        return

    total_new_subs = 0
    total_filings_found = 0
    start_time = time.time()
    batches_done = 0
    total_batches = (len(remaining) + batch_size - 1) // batch_size

    for i in range(0, len(remaining), batch_size):
        batch = remaining[i : i + batch_size]
        batch_start = time.time()
        batches_done += 1

        # Scrape batch
        new_rows = await run_batch(batch)

        # Merge into DB
        if new_rows:
            merged = merge_scraped_data(new_rows)
            total_new_subs += merged
            total_filings_found += len(set((r["cik"], r["fdate"]) for r in new_rows))

        # Update progress
        for cik, _ in batch:
            completed.add(cik)
        save_progress(completed)

        # Stats
        elapsed = time.time() - start_time
        batch_time = time.time() - batch_start
        rate = len(completed) / elapsed if elapsed > 0 else 0
        eta = (len(remaining) - (i + len(batch))) / rate if rate > 0 else 0

        print(
            f"[{batches_done}/{total_batches}] "
            f"Done: {len(completed):,}/{total:,} | "
            f"New subs: {total_new_subs:,} | "
            f"Filings: {total_filings_found:,} | "
            f"Batch: {batch_time:.1f}s | "
            f"ETA: {format_time(eta)} | "
            f"Elapsed: {format_time(elapsed)}"
        )

        # Rate limit pause between batches
        await asyncio.sleep(DELAY_BETWEEN_BATCHES)

    elapsed = time.time() - start_time
    print(f"\n{'=' * 60}")
    print(f"DONE!")
    print(f"Total time:          {format_time(elapsed)}")
    print(f"CIKs scraped:        {len(remaining):,}")
    print(f"New subsidiaries:    {total_new_subs:,}")
    print(f"Filings found:       {total_filings_found:,}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="EDGAR Exhibit 21 Scraper")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--no-resume", action="store_true", help="Start fresh, ignore previous progress")
    args = parser.parse_args()

    asyncio.run(main(batch_size=args.batch_size, resume=not args.no_resume))
