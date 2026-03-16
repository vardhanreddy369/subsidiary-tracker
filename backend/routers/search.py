import json
import asyncio
from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse
from backend.database import get_db
from backend.agent.orchestrator import enrich_subsidiary, enrich_subsidiary_fast

router = APIRouter(prefix="/api/search", tags=["Agentic Search"])


# --- Static routes MUST come before dynamic /{sub_id} routes ---

@router.get("/turbo/stream")
async def turbo_enrich_stream(cik: str = ""):
    """Turbo enrich: classify ALL unenriched subs using name heuristics + filing patterns.
    No API calls — pure computation. ~9 seconds for 1.17M rows."""
    from backend.agent.gemini_client import _infer_type_from_name
    from backend.routers.subsidiaries import invalidate_stats_cache

    async def event_generator():
        with get_db() as conn:
            if cik:
                rows = conn.execute("""
                    SELECT s.id, s.sub_name, c.company_name, s.first_seen, c.first_filing
                    FROM subsidiaries s
                    JOIN companies c ON s.cik = c.cik
                    WHERE s.enriched = 0 AND s.cik = ?
                """, (cik,)).fetchall()
            else:
                rows = conn.execute("""
                    SELECT s.id, s.sub_name, c.company_name, s.first_seen, c.first_filing
                    FROM subsidiaries s
                    JOIN companies c ON s.cik = c.cik
                    WHERE s.enriched = 0
                """).fetchall()

        total = len(rows)
        yield {"event": "start", "data": json.dumps({"total": total})}

        if total == 0:
            yield {"event": "done", "data": json.dumps({"status": "complete", "enriched": 0, "total": 0})}
            return

        # Pre-compute batch sizes (how many subs appeared on same date for same parent)
        batch_sizes = {}
        with get_db() as conn:
            batch_rows = conn.execute("""
                SELECT cik, first_seen, COUNT(*) as cnt
                FROM subsidiaries
                GROUP BY cik, first_seen
            """).fetchall()
            for bcik, bdate, bcnt in batch_rows:
                batch_sizes[(bcik, bdate)] = bcnt

        # Process in chunks and write to DB
        CHUNK = 5000
        processed = 0
        from collections import Counter
        type_counts = Counter()

        for i in range(0, total, CHUNK):
            chunk = rows[i:i + CHUNK]
            updates = []
            for rid, sub_name, company_name, first_seen, first_filing in chunk:
                bs = batch_sizes.get((cik, first_seen), 0) if cik else 0
                inferred = _infer_type_from_name(sub_name, company_name,
                                                  first_seen or "", first_filing or "", bs)
                updates.append((inferred, "SEC Exhibit 21 (heuristic)", rid))
                type_counts[inferred] += 1

            with get_db() as conn:
                conn.executemany(
                    "UPDATE subsidiaries SET type=?, source=?, enriched=1 WHERE id=?",
                    updates
                )

            processed += len(chunk)
            pct = round(processed / total * 100)
            yield {
                "event": "progress",
                "data": json.dumps({
                    "processed": processed,
                    "total": total,
                    "percent": pct,
                    "types": dict(type_counts),
                }),
            }

        invalidate_stats_cache()
        yield {
            "event": "done",
            "data": json.dumps({
                "status": "complete",
                "enriched": processed,
                "total": total,
                "types": dict(type_counts),
            }),
        }

    return EventSourceResponse(event_generator())


@router.get("/batch/{cik}/stream")
async def batch_enrich_stream(cik: str, mode: str = "fast"):
    """Enrich ALL unenriched subsidiaries for a company via SSE streaming."""
    with get_db() as conn:
        subs = conn.execute(
            """SELECT s.*, c.company_name
               FROM subsidiaries s
               JOIN companies c ON s.cik = c.cik
               WHERE s.cik = ? AND s.enriched = 0
               ORDER BY s.id""",
            (cik,)
        ).fetchall()

    total = len(subs)

    async def event_generator():
        yield {
            "event": "start",
            "data": json.dumps({"total": total, "cik": cik}),
        }

        if total == 0:
            yield {
                "event": "done",
                "data": json.dumps({"status": "complete", "enriched": 0, "total": 0}),
            }
            return

        enriched = 0
        errors = 0
        for i, sub in enumerate(subs):
            sub_dict = dict(sub)
            sub_name = sub_dict["sub_name"]
            try:
                yield {
                    "event": "progress",
                    "data": json.dumps({
                        "current": i + 1,
                        "total": total,
                        "sub_name": sub_name,
                        "status": "running",
                    }),
                }

                final_result = None
                enricher = enrich_subsidiary_fast(sub_dict) if mode == "fast" else enrich_subsidiary(sub_dict)
                async for step in enricher:
                    if step.get("final_result"):
                        final_result = step["final_result"]

                enriched += 1
                yield {
                    "event": "progress",
                    "data": json.dumps({
                        "current": i + 1,
                        "total": total,
                        "sub_name": sub_name,
                        "status": "done",
                        "type": final_result.get("Type", "Unknown") if final_result else "Unknown",
                        "enriched_so_far": enriched,
                    }),
                }

            except Exception as e:
                errors += 1
                yield {
                    "event": "progress",
                    "data": json.dumps({
                        "current": i + 1,
                        "total": total,
                        "sub_name": sub_name,
                        "status": "error",
                        "error": str(e)[:200],
                    }),
                }

            # Rate limit: 4s for Gemini (full mode), 0.5s for fast mode (EDGAR/Wiki only)
            await asyncio.sleep(0.5 if mode == "fast" else 4)

        yield {
            "event": "done",
            "data": json.dumps({
                "status": "complete",
                "enriched": enriched,
                "errors": errors,
                "total": total,
            }),
        }

    return EventSourceResponse(event_generator())


@router.get("/batch/{cik}")
async def batch_enrich(cik: str):
    """Enrich the top 5 unenriched subsidiaries for a given company CIK sequentially."""
    with get_db() as conn:
        subs = conn.execute(
            """SELECT s.*, c.company_name
               FROM subsidiaries s
               JOIN companies c ON s.cik = c.cik
               WHERE s.cik = ? AND s.enriched = 0
               ORDER BY s.id
               LIMIT 5""",
            (cik,)
        ).fetchall()

    if not subs:
        return {"message": "No unenriched subsidiaries found for this CIK", "results": []}

    results = []
    for sub in subs:
        sub_dict = dict(sub)
        steps = []
        async for step in enrich_subsidiary(sub_dict):
            steps.append(step)
        results.append({
            "sub_id": sub_dict["id"],
            "sub_name": sub_dict["sub_name"],
            "steps": steps,
        })

    return {"cik": cik, "enriched_count": len(results), "results": results}


# --- Dynamic routes (must come AFTER static routes) ---

@router.get("/{sub_id}/stream")
async def trigger_search(sub_id: int):
    """Trigger agentic AI search for a specific subsidiary (GET for EventSource compatibility)."""
    with get_db() as conn:
        sub = conn.execute(
            """SELECT s.*, c.company_name
               FROM subsidiaries s
               JOIN companies c ON s.cik = c.cik
               WHERE s.id = ?""",
            (sub_id,)
        ).fetchone()
        if not sub:
            return {"error": "Subsidiary not found"}

    sub_dict = dict(sub)

    async def event_generator():
        async for step in enrich_subsidiary(sub_dict):
            yield {"event": "progress", "data": json.dumps(step)}
        yield {"event": "done", "data": json.dumps({"status": "complete"})}

    return EventSourceResponse(event_generator())


@router.get("/{sub_id}/result")
def get_search_result(sub_id: int):
    """Get the latest enrichment result for a subsidiary."""
    with get_db() as conn:
        sub = conn.execute(
            "SELECT * FROM subsidiaries WHERE id = ?", (sub_id,)
        ).fetchone()
        enrichments = conn.execute(
            "SELECT * FROM enrichments WHERE sub_id = ? ORDER BY searched_at DESC",
            (sub_id,)
        ).fetchall()

    return {
        "subsidiary": dict(sub) if sub else None,
        "enrichments": [dict(e) for e in enrichments],
    }
