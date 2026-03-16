"""Admin-only scraper endpoints for SEC EDGAR Exhibit 21 data."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime
from typing import Dict, Optional

from fastapi import APIRouter, HTTPException, Request

from backend.auth import require_auth
from backend.database import get_db
from backend.scraper.exhibit21_scraper import (
    discover_exhibit21_filings,
    download_exhibit21,
)
from backend.scraper.exhibit21_parser import parse_exhibit21
from backend.scraper.merger import merge_scraped_data

router = APIRouter(prefix="/api/admin/scrape", tags=["scraper"])

# In-memory tracking of running tasks
_running_tasks = {}  # type: Dict[int, asyncio.Task]


def _require_admin(request: Request) -> dict:
    """Require authentication and admin privileges."""
    import logging
    user = require_auth(request)
    if not user.get("is_admin"):
        logging.getLogger("security").warning(
            "Unauthorized admin access attempt by user %s (%s)", user["id"], user["email"]
        )
        raise HTTPException(status_code=403, detail="Admin access required")
    logging.getLogger("security").info(
        "Admin action by user %s: %s %s", user["id"], request.method, request.url.path
    )
    return user


@router.post("/start")
async def start_scrape(
    request: Request,
    cik: Optional[str] = None,
    start_year: int = 2006,
    end_year: int = 2025,
):
    """Start a scrape job. Pass cik for a single company or omit for all."""
    _require_admin(request)

    # Create job record
    with get_db() as conn:
        cursor = conn.execute(
            """INSERT INTO scrape_jobs (status, started_at)
               VALUES ('running', ?)""",
            (datetime.utcnow().isoformat(),),
        )
        job_id = cursor.lastrowid

    # Launch background task
    task = asyncio.create_task(
        _run_scrape_job(job_id, cik, start_year, end_year)
    )
    _running_tasks[job_id] = task

    return {"job_id": job_id, "status": "running"}


@router.get("/status")
async def scrape_status(request: Request):
    """Get current scrape job progress."""
    _require_admin(request)

    with get_db() as conn:
        rows = conn.execute(
            """SELECT id, status, total_ciks, processed_ciks,
                      total_filings, processed_filings,
                      subsidiaries_found, started_at, completed_at, error_log
               FROM scrape_jobs ORDER BY id DESC LIMIT 10"""
        ).fetchall()

    jobs = []
    for row in rows:
        jobs.append({
            "id": row[0],
            "status": row[1],
            "total_ciks": row[2],
            "processed_ciks": row[3],
            "total_filings": row[4],
            "processed_filings": row[5],
            "subsidiaries_found": row[6],
            "started_at": row[7],
            "completed_at": row[8],
            "error_log": row[9],
        })

    return {"jobs": jobs}


@router.post("/stop")
async def stop_scrape(request: Request, job_id: Optional[int] = None):
    """Cancel a running scrape job."""
    _require_admin(request)

    if job_id and job_id in _running_tasks:
        _running_tasks[job_id].cancel()
        del _running_tasks[job_id]

        with get_db() as conn:
            conn.execute(
                """UPDATE scrape_jobs SET status = 'cancelled',
                   completed_at = ? WHERE id = ?""",
                (datetime.utcnow().isoformat(), job_id),
            )
        return {"status": "cancelled", "job_id": job_id}

    # Cancel the most recent running job
    with get_db() as conn:
        row = conn.execute(
            "SELECT id FROM scrape_jobs WHERE status = 'running' ORDER BY id DESC LIMIT 1"
        ).fetchone()
        if row:
            active_id = row[0]
            if active_id in _running_tasks:
                _running_tasks[active_id].cancel()
                del _running_tasks[active_id]
            conn.execute(
                """UPDATE scrape_jobs SET status = 'cancelled',
                   completed_at = ? WHERE id = ?""",
                (datetime.utcnow().isoformat(), active_id),
            )
            return {"status": "cancelled", "job_id": active_id}

    raise HTTPException(status_code=404, detail="No running scrape job found")


async def _run_scrape_job(
    job_id: int,
    cik: Optional[str],
    start_year: int,
    end_year: int,
) -> None:
    """Background task that performs the actual scraping."""
    errors = []  # type: list
    total_subs_found = 0

    try:
        # Determine which CIKs to scrape
        if cik and cik != "all":
            ciks = [cik]
        else:
            with get_db() as conn:
                rows = conn.execute("SELECT cik FROM companies").fetchall()
                ciks = [r[0] for r in rows]

        with get_db() as conn:
            conn.execute(
                "UPDATE scrape_jobs SET total_ciks = ? WHERE id = ?",
                (len(ciks), job_id),
            )

        for i, target_cik in enumerate(ciks):
            # Check for cancellation
            if asyncio.current_task().cancelled():
                return

            try:
                # Discover Exhibit 21 filings
                filings = await discover_exhibit21_filings(
                    target_cik, start_year, end_year
                )

                with get_db() as conn:
                    conn.execute(
                        """UPDATE scrape_jobs
                           SET processed_ciks = ?,
                               total_filings = total_filings + ?
                           WHERE id = ?""",
                        (i + 1, len(filings), job_id),
                    )

                # Process each filing
                for filing in filings:
                    if asyncio.current_task().cancelled():
                        return

                    try:
                        # Download exhibit
                        content = await download_exhibit21(filing["exhibit_url"])

                        # Parse subsidiaries
                        sub_names = parse_exhibit21(content, filing["exhibit_url"])

                        # Store raw data
                        with get_db() as conn:
                            conn.execute(
                                """INSERT OR IGNORE INTO raw_exhibit21
                                   (cik, accession_number, filing_date,
                                    document_url, raw_text, parsed_subsidiaries,
                                    parse_method)
                                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                                (
                                    target_cik,
                                    filing["accession_number"],
                                    filing["filing_date"],
                                    filing["exhibit_url"],
                                    content[:50000],  # Truncate very large docs
                                    json.dumps(sub_names),
                                    "auto",
                                ),
                            )

                        # Get company name
                        comp_name = ""
                        with get_db() as conn:
                            row = conn.execute(
                                "SELECT company_name FROM companies WHERE cik = ?",
                                (target_cik,),
                            ).fetchone()
                            if row:
                                comp_name = row[0]

                        # Merge into main data
                        new_rows = [
                            {
                                "cik": target_cik,
                                "fdate": filing["filing_date"],
                                "comp_name": comp_name,
                                "sub_name": name,
                            }
                            for name in sub_names
                        ]

                        if new_rows:
                            merge_scraped_data(new_rows)
                            total_subs_found += len(sub_names)

                        with get_db() as conn:
                            conn.execute(
                                """UPDATE scrape_jobs
                                   SET processed_filings = processed_filings + 1,
                                       subsidiaries_found = ?
                                   WHERE id = ?""",
                                (total_subs_found, job_id),
                            )

                    except Exception as e:
                        errors.append(
                            "CIK %s filing %s: %s"
                            % (target_cik, filing["accession_number"], str(e)[:200])
                        )

            except Exception as e:
                errors.append("CIK %s: %s" % (target_cik, str(e)[:200]))

        # Mark complete
        with get_db() as conn:
            conn.execute(
                """UPDATE scrape_jobs
                   SET status = 'completed', completed_at = ?,
                       error_log = ?
                   WHERE id = ?""",
                (
                    datetime.utcnow().isoformat(),
                    json.dumps(errors) if errors else None,
                    job_id,
                ),
            )

    except asyncio.CancelledError:
        with get_db() as conn:
            conn.execute(
                """UPDATE scrape_jobs SET status = 'cancelled',
                   completed_at = ? WHERE id = ?""",
                (datetime.utcnow().isoformat(), job_id),
            )
    except Exception as e:
        with get_db() as conn:
            conn.execute(
                """UPDATE scrape_jobs SET status = 'failed',
                   completed_at = ?, error_log = ?
                   WHERE id = ?""",
                (datetime.utcnow().isoformat(), str(e)[:1000], job_id),
            )
    finally:
        _running_tasks.pop(job_id, None)
