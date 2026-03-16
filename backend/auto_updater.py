"""Auto-updater: scrapes new EDGAR filings in the background on app startup, then daily."""

from __future__ import annotations

import asyncio
import json
import logging
import sqlite3
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Tuple

from backend.scraper.exhibit21_scraper import discover_exhibit21_filings, download_exhibit21
from backend.scraper.exhibit21_parser import parse_exhibit21
from backend.scraper.merger import merge_scraped_data

logger = logging.getLogger("auto_updater")
DB_PATH = Path(__file__).resolve().parent.parent / "data" / "tracker.db"
STATE_FILE = Path(__file__).resolve().parent.parent / "data" / "auto_update_state.json"

BATCH_SIZE = 30  # concurrent CIKs per batch
UPDATE_INTERVAL_HOURS = 24


def _load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"last_full_run": None, "last_cik_index": 0}


def _save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state))


def _get_ciks() -> List[Tuple[str, str]]:
    conn = sqlite3.connect(str(DB_PATH))
    rows = conn.execute("SELECT cik, company_name FROM companies ORDER BY cik").fetchall()
    conn.close()
    return rows


async def _scrape_cik(cik: str, name: str) -> list:
    rows = []
    try:
        filings = await discover_exhibit21_filings(cik, 2006, 2025)
        for f in filings:
            try:
                content = await download_exhibit21(f["exhibit_url"])
                subs = parse_exhibit21(content, f["exhibit_url"])
                for sub in subs:
                    rows.append({"cik": cik, "fdate": f["filing_date"], "comp_name": name, "sub_name": sub})
            except Exception:
                continue
    except Exception:
        pass
    return rows


async def run_update():
    """Run one full update cycle."""
    state = _load_state()

    # Check if we ran recently
    if state["last_full_run"]:
        last = datetime.fromisoformat(state["last_full_run"])
        if datetime.now() - last < timedelta(hours=UPDATE_INTERVAL_HOURS):
            logger.info(f"Auto-updater: last run was {last}, skipping (next in {UPDATE_INTERVAL_HOURS}h)")
            return

    logger.info("Auto-updater: starting background data update...")
    ciks = _get_ciks()
    total = len(ciks)
    total_new = 0
    start = time.time()

    for i in range(0, total, BATCH_SIZE):
        batch = ciks[i:i + BATCH_SIZE]
        tasks = [_scrape_cik(cik, name) for cik, name in batch]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        all_rows = []
        for r in results:
            if isinstance(r, list):
                all_rows.extend(r)

        if all_rows:
            merged = merge_scraped_data(all_rows)
            total_new += merged

        # Don't hammer SEC - small pause between batches
        await asyncio.sleep(2)

        done = min(i + BATCH_SIZE, total)
        if done % 500 < BATCH_SIZE:
            logger.info(f"Auto-updater: {done:,}/{total:,} CIKs processed, {total_new:,} new subs")

    elapsed = time.time() - start
    state["last_full_run"] = datetime.now().isoformat()
    state["last_cik_index"] = 0
    _save_state(state)

    logger.info(f"Auto-updater: done in {elapsed/60:.1f}m — {total_new:,} new subsidiaries added")


async def auto_update_loop():
    """Background loop: run update on startup, then every 24h."""
    # Wait 10s after startup so the app is ready
    await asyncio.sleep(10)

    while True:
        try:
            await run_update()
        except Exception as e:
            logger.error(f"Auto-updater error: {e}")
        # Sleep until next check
        await asyncio.sleep(3600)  # check every hour, run_update skips if <24h
