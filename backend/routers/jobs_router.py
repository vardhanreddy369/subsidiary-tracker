"""Bulk enrichment job endpoints (enterprise only)."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime
from typing import Dict, Optional

from fastapi import APIRouter, HTTPException, Request

from backend.auth import require_plan
from backend.database import get_db
from backend.jobs.bulk_enricher import run_bulk_enrichment

router = APIRouter(prefix="/api/jobs/enrich", tags=["jobs"])

# In-memory tracking of running tasks
_running_tasks = {}  # type: Dict[int, asyncio.Task]


@router.post("/start")
async def start_enrichment(
    request: Request,
    cik: Optional[str] = None,
    limit: int = 100,
):
    """Start a bulk enrichment job. Enterprise plan required."""
    # require_plan(request, "enterprise")  # Removed paywall for research use

    # Create job record
    params = json.dumps({"cik": cik, "limit": limit})
    with get_db() as conn:
        cursor = conn.execute(
            """INSERT INTO bulk_jobs (job_type, status, params, started_at)
               VALUES ('enrichment', 'pending', ?, ?)""",
            (params, datetime.utcnow().isoformat()),
        )
        job_id = cursor.lastrowid

    # Launch background task
    task = asyncio.create_task(run_bulk_enrichment(job_id, cik, limit))
    _running_tasks[job_id] = task

    return {"job_id": job_id, "status": "pending"}


@router.get("/{job_id}")
async def get_job_progress(request: Request, job_id: int):
    """Get enrichment job progress."""
    # require_plan(request, "enterprise")  # Removed paywall for research use

    with get_db() as conn:
        row = conn.execute(
            """SELECT id, job_type, status, total_items, processed_items,
                      success_count, error_count, started_at, completed_at,
                      params, error_log
               FROM bulk_jobs WHERE id = ?""",
            (job_id,),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Job not found")

    return {
        "id": row[0],
        "job_type": row[1],
        "status": row[2],
        "total_items": row[3],
        "processed_items": row[4],
        "success_count": row[5],
        "error_count": row[6],
        "started_at": row[7],
        "completed_at": row[8],
        "params": json.loads(row[9]) if row[9] else None,
        "error_log": json.loads(row[10]) if row[10] else None,
    }


@router.get("")
async def list_jobs(request: Request):
    """List all enrichment jobs."""
    # require_plan(request, "enterprise")  # Removed paywall for research use

    with get_db() as conn:
        rows = conn.execute(
            """SELECT id, job_type, status, total_items, processed_items,
                      success_count, error_count, started_at, completed_at
               FROM bulk_jobs
               WHERE job_type = 'enrichment'
               ORDER BY id DESC LIMIT 20"""
        ).fetchall()

    jobs = []
    for row in rows:
        jobs.append({
            "id": row[0],
            "job_type": row[1],
            "status": row[2],
            "total_items": row[3],
            "processed_items": row[4],
            "success_count": row[5],
            "error_count": row[6],
            "started_at": row[7],
            "completed_at": row[8],
        })

    return {"jobs": jobs}


@router.post("/{job_id}/cancel")
async def cancel_job(request: Request, job_id: int):
    """Cancel a running enrichment job."""
    # require_plan(request, "enterprise")  # Removed paywall for research use

    if job_id in _running_tasks:
        _running_tasks[job_id].cancel()
        del _running_tasks[job_id]

        with get_db() as conn:
            conn.execute(
                """UPDATE bulk_jobs SET status = 'cancelled',
                   completed_at = ? WHERE id = ?""",
                (datetime.utcnow().isoformat(), job_id),
            )
        return {"status": "cancelled", "job_id": job_id}

    # Check if job exists
    with get_db() as conn:
        row = conn.execute(
            "SELECT status FROM bulk_jobs WHERE id = ?", (job_id,)
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Job not found")

    if row[0] != "running":
        raise HTTPException(
            status_code=400,
            detail="Job is not running (status: %s)" % row[0],
        )

    raise HTTPException(
        status_code=404,
        detail="Job task not found in memory (may have been restarted)",
    )
