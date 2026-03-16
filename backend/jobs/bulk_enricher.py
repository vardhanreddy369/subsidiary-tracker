"""Background bulk enrichment job using the agentic pipeline."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime
from typing import Optional

from backend.database import get_db
from backend.agent.orchestrator import enrich_subsidiary


async def run_bulk_enrichment(
    job_id: int, cik: Optional[str] = None, limit: int = 100
) -> None:
    """
    Run bulk enrichment on unenriched subsidiaries.

    Processes through the enrichment pipeline (Gemini + EDGAR + Wikipedia),
    respecting a 15 RPM rate limit (1 request every 4 seconds).

    Updates bulk_jobs table with progress throughout.
    """
    errors = []  # type: list
    success_count = 0
    error_count = 0

    try:
        # Query unenriched subsidiaries
        with get_db() as conn:
            if cik:
                rows = conn.execute(
                    """SELECT s.id, s.cik, s.sub_name, s.first_seen, s.last_seen,
                              s.time_in, s.time_out, s.confidence,
                              c.company_name
                       FROM subsidiaries s
                       JOIN companies c ON s.cik = c.cik
                       WHERE s.enriched = 0 AND s.cik = ?
                       LIMIT ?""",
                    (cik, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    """SELECT s.id, s.cik, s.sub_name, s.first_seen, s.last_seen,
                              s.time_in, s.time_out, s.confidence,
                              c.company_name
                       FROM subsidiaries s
                       JOIN companies c ON s.cik = c.cik
                       WHERE s.enriched = 0
                       LIMIT ?""",
                    (limit,),
                ).fetchall()

        total = len(rows)

        with get_db() as conn:
            conn.execute(
                """UPDATE bulk_jobs
                   SET status = 'running', total_items = ?, started_at = ?
                   WHERE id = ?""",
                (total, datetime.utcnow().isoformat(), job_id),
            )

        if total == 0:
            with get_db() as conn:
                conn.execute(
                    """UPDATE bulk_jobs
                       SET status = 'completed', total_items = 0,
                           completed_at = ?
                       WHERE id = ?""",
                    (datetime.utcnow().isoformat(), job_id),
                )
            return

        for i, row in enumerate(rows):
            # Check for cancellation
            if asyncio.current_task().cancelled():
                return

            sub = {
                "id": row[0],
                "cik": row[1],
                "sub_name": row[2],
                "first_seen": row[3],
                "last_seen": row[4],
                "time_in": row[5],
                "time_out": row[6],
                "confidence": row[7],
                "company_name": row[8],
            }

            try:
                # Run enrichment pipeline (consume the async generator)
                async for _update in enrich_subsidiary(sub):
                    pass  # The generator handles DB writes internally

                success_count += 1

            except Exception as e:
                error_count += 1
                errors.append(
                    "Sub %d (%s): %s" % (sub["id"], sub["sub_name"][:50], str(e)[:200])
                )

            # Update progress
            with get_db() as conn:
                conn.execute(
                    """UPDATE bulk_jobs
                       SET processed_items = ?,
                           success_count = ?,
                           error_count = ?
                       WHERE id = ?""",
                    (i + 1, success_count, error_count, job_id),
                )

            # Rate limit: 15 RPM = 1 every 4 seconds
            await asyncio.sleep(4)

        # Mark complete
        with get_db() as conn:
            conn.execute(
                """UPDATE bulk_jobs
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
                """UPDATE bulk_jobs SET status = 'cancelled',
                   completed_at = ? WHERE id = ?""",
                (datetime.utcnow().isoformat(), job_id),
            )
    except Exception as e:
        with get_db() as conn:
            conn.execute(
                """UPDATE bulk_jobs SET status = 'failed',
                   completed_at = ?, error_log = ?
                   WHERE id = ?""",
                (datetime.utcnow().isoformat(), str(e)[:1000], job_id),
            )
