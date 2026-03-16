"""Analytics API — trends, distributions, and insights."""

from fastapi import APIRouter, Query
from backend.database import get_db

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


@router.get("/timeline")
def filing_timeline():
    """Subsidiary counts by filing year — shows growth/contraction trends."""
    with get_db() as conn:
        rows = conn.execute("""
            SELECT substr(fdate, 1, 4) AS year,
                   COUNT(DISTINCT f.cik) AS companies_filing,
                   COUNT(DISTINCT s.id) AS subsidiaries_seen
            FROM filing_dates f
            LEFT JOIN subsidiaries s ON s.cik = f.cik
                AND s.first_seen <= f.fdate AND s.last_seen >= f.fdate
            GROUP BY year ORDER BY year
        """).fetchall()
    return [dict(r) for r in rows]


@router.get("/churn")
def subsidiary_churn():
    """Year-over-year subsidiary additions and removals."""
    with get_db() as conn:
        added = conn.execute("""
            SELECT substr(first_seen, 1, 4) AS year, COUNT(*) AS added
            FROM subsidiaries GROUP BY year ORDER BY year
        """).fetchall()
        removed = conn.execute("""
            SELECT substr(last_seen, 1, 4) AS year, COUNT(*) AS removed
            FROM subsidiaries WHERE time_out NOT LIKE 'Active%'
            GROUP BY year ORDER BY year
        """).fetchall()
    return {
        "added": [dict(r) for r in added],
        "removed": [dict(r) for r in removed],
    }


@router.get("/size-distribution")
def company_size_distribution():
    """Distribution of companies by number of subsidiaries."""
    with get_db() as conn:
        rows = conn.execute("""
            SELECT
                CASE
                    WHEN num_subsidiaries = 1 THEN '1'
                    WHEN num_subsidiaries BETWEEN 2 AND 5 THEN '2-5'
                    WHEN num_subsidiaries BETWEEN 6 AND 20 THEN '6-20'
                    WHEN num_subsidiaries BETWEEN 21 AND 50 THEN '21-50'
                    WHEN num_subsidiaries BETWEEN 51 AND 100 THEN '51-100'
                    WHEN num_subsidiaries BETWEEN 101 AND 500 THEN '101-500'
                    ELSE '500+'
                END AS bucket,
                COUNT(*) AS count
            FROM companies
            GROUP BY bucket
            ORDER BY MIN(num_subsidiaries)
        """).fetchall()
    return [dict(r) for r in rows]


@router.get("/confidence-by-year")
def confidence_by_year():
    """Confidence distribution broken down by filing year."""
    with get_db() as conn:
        rows = conn.execute("""
            SELECT substr(first_seen, 1, 4) AS year,
                   SUM(CASE WHEN confidence='HIGH' THEN 1 ELSE 0 END) AS high,
                   SUM(CASE WHEN confidence='MEDIUM' THEN 1 ELSE 0 END) AS medium,
                   SUM(CASE WHEN confidence='LOW' THEN 1 ELSE 0 END) AS low,
                   COUNT(*) AS total
            FROM subsidiaries GROUP BY year ORDER BY year
        """).fetchall()
    return [dict(r) for r in rows]


@router.get("/top-churners")
def top_churners(limit: int = Query(15, ge=1, le=50)):
    """Companies with the most subsidiary additions/removals (highest churn)."""
    with get_db() as conn:
        rows = conn.execute("""
            SELECT c.cik, c.company_name, c.num_subsidiaries,
                   SUM(CASE WHEN s.time_out NOT LIKE 'Active%%' THEN 1 ELSE 0 END) AS divested,
                   SUM(CASE WHEN s.time_out LIKE 'Active%%' THEN 1 ELSE 0 END) AS active,
                   c.num_filings
            FROM companies c
            JOIN subsidiaries s ON c.cik = s.cik
            GROUP BY c.cik
            HAVING divested > 0
            ORDER BY divested DESC
            LIMIT ?
        """, (limit,)).fetchall()
    return [dict(r) for r in rows]


@router.get("/longevity")
def subsidiary_longevity():
    """Distribution of how long subsidiaries remain active (in filing years)."""
    with get_db() as conn:
        rows = conn.execute("""
            SELECT
                CASE
                    WHEN (CAST(substr(last_seen,1,4) AS INT) - CAST(substr(first_seen,1,4) AS INT)) = 0 THEN 'Single year'
                    WHEN (CAST(substr(last_seen,1,4) AS INT) - CAST(substr(first_seen,1,4) AS INT)) BETWEEN 1 AND 2 THEN '1-2 years'
                    WHEN (CAST(substr(last_seen,1,4) AS INT) - CAST(substr(first_seen,1,4) AS INT)) BETWEEN 3 AND 5 THEN '3-5 years'
                    ELSE '6+ years'
                END AS duration,
                COUNT(*) AS count
            FROM subsidiaries
            GROUP BY duration
            ORDER BY MIN(CAST(substr(last_seen,1,4) AS INT) - CAST(substr(first_seen,1,4) AS INT))
        """).fetchall()
    return [dict(r) for r in rows]
