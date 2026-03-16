import time
from fastapi import APIRouter, Query
from backend.database import get_db

router = APIRouter(prefix="/api/subsidiaries", tags=["Subsidiaries"])

# Simple in-memory cache with TTL
_stats_cache = {}  # type: Dict[str, Any]
_stats_cache_ts = 0.0  # type: float
_STATS_CACHE_TTL = 300  # 5 minutes


def invalidate_stats_cache():
    """Clear the stats cache so next request fetches fresh data."""
    global _stats_cache, _stats_cache_ts
    _stats_cache = {}
    _stats_cache_ts = 0.0


@router.get("/stats/overview")
def get_stats():
    global _stats_cache, _stats_cache_ts

    now = time.time()
    if _stats_cache and (now - _stats_cache_ts) < _STATS_CACHE_TTL:
        return _stats_cache

    with get_db() as conn:
        # Single-pass aggregation instead of 8 separate COUNT queries
        row = conn.execute("""
            SELECT
                COUNT(*) AS total_subsidiaries,
                SUM(CASE WHEN confidence = 'HIGH' THEN 1 ELSE 0 END) AS high_confidence,
                SUM(CASE WHEN confidence = 'MEDIUM' THEN 1 ELSE 0 END) AS medium_confidence,
                SUM(CASE WHEN confidence = 'LOW' THEN 1 ELSE 0 END) AS low_confidence,
                SUM(CASE WHEN time_out LIKE 'Active%' THEN 1 ELSE 0 END) AS active_subs,
                SUM(CASE WHEN time_out NOT LIKE 'Active%' THEN 1 ELSE 0 END) AS divested_subs,
                SUM(CASE WHEN enriched = 1 THEN 1 ELSE 0 END) AS enriched
            FROM subsidiaries
        """).fetchone()

        stats = {
            "total_companies": conn.execute("SELECT COUNT(*) FROM companies").fetchone()[0],
            "total_subsidiaries": row[0],
            "high_confidence": row[1],
            "medium_confidence": row[2],
            "low_confidence": row[3],
            "active_subs": row[4],
            "divested_subs": row[5],
            "enriched": row[6],
            "top_companies": [dict(r) for r in conn.execute(
                "SELECT company_name, cik, num_subsidiaries FROM companies ORDER BY num_subsidiaries DESC LIMIT 10"
            ).fetchall()],
        }

    _stats_cache = stats
    _stats_cache_ts = now
    return stats


@router.get("/stats/recent")
def recently_enriched():
    """Return the 20 most recently enriched subsidiaries with their enrichment details."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT s.id, s.cik, c.company_name, s.sub_name, s.time_in, s.time_out,
                      s.confidence, s.type,
                      e.source_type, e.source_url, e.detail,
                      e.time_in_precise, e.time_out_precise, e.sub_type,
                      e.searched_at
               FROM subsidiaries s
               JOIN companies c ON s.cik = c.cik
               JOIN enrichments e ON e.sub_id = s.id
               WHERE s.enriched = 1
               ORDER BY e.searched_at DESC
               LIMIT 20"""
        ).fetchall()
    return {"recently_enriched": [dict(r) for r in rows]}


@router.get("")
def search_subsidiaries(
    q: str = Query("", description="Search subsidiary name"),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
):
    offset = (page - 1) * per_page
    with get_db() as conn:
        if q:
            total = conn.execute(
                "SELECT COUNT(*) FROM subsidiaries WHERE sub_name LIKE ?",
                (f"%{q}%",)
            ).fetchone()[0]
            rows = conn.execute(
                """SELECT s.id, s.cik, c.company_name, s.sub_name, s.time_in, s.time_out,
                          s.confidence, s.enriched
                   FROM subsidiaries s
                   JOIN companies c ON s.cik = c.cik
                   WHERE s.sub_name LIKE ?
                   ORDER BY s.sub_name
                   LIMIT ? OFFSET ?""",
                (f"%{q}%", per_page, offset)
            ).fetchall()
        else:
            total = conn.execute("SELECT COUNT(*) FROM subsidiaries").fetchone()[0]
            rows = conn.execute(
                """SELECT s.id, s.cik, c.company_name, s.sub_name, s.time_in, s.time_out,
                          s.confidence, s.enriched
                   FROM subsidiaries s
                   JOIN companies c ON s.cik = c.cik
                   ORDER BY s.sub_name
                   LIMIT ? OFFSET ?""",
                (per_page, offset)
            ).fetchall()

    return {
        "subsidiaries": [dict(r) for r in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/{sub_id}")
def get_subsidiary(sub_id: int):
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

        enrichments = conn.execute(
            "SELECT * FROM enrichments WHERE sub_id = ? ORDER BY searched_at DESC",
            (sub_id,)
        ).fetchall()

    return {
        "subsidiary": dict(sub),
        "enrichments": [dict(e) for e in enrichments],
    }
