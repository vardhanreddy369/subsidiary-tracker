"""Compare API — side-by-side company comparison."""

from fastapi import APIRouter, Query
from backend.database import get_db

router = APIRouter(prefix="/api/compare", tags=["Compare"])


@router.get("")
def compare_companies(ciks: str = Query(..., description="Comma-separated CIKs")):
    """Compare up to 4 companies side-by-side."""
    cik_list = [c.strip() for c in ciks.split(",")][:4]

    with get_db() as conn:
        results = []
        for cik in cik_list:
            company = conn.execute(
                "SELECT * FROM companies WHERE cik = ?", (cik,)
            ).fetchone()
            if not company:
                continue

            filings = conn.execute(
                "SELECT fdate FROM filing_dates WHERE cik = ? ORDER BY fdate",
                (cik,)
            ).fetchall()

            active = conn.execute(
                "SELECT COUNT(*) FROM subsidiaries WHERE cik = ? AND time_out LIKE 'Active%'",
                (cik,)
            ).fetchone()[0]

            divested = conn.execute(
                "SELECT COUNT(*) FROM subsidiaries WHERE cik = ? AND time_out NOT LIKE 'Active%'",
                (cik,)
            ).fetchone()[0]

            high = conn.execute(
                "SELECT COUNT(*) FROM subsidiaries WHERE cik = ? AND confidence = 'HIGH'",
                (cik,)
            ).fetchone()[0]

            # Get subsidiaries by year for timeline
            year_counts = conn.execute("""
                SELECT substr(first_seen, 1, 4) AS year, COUNT(*) AS count
                FROM subsidiaries WHERE cik = ?
                GROUP BY year ORDER BY year
            """, (cik,)).fetchall()

            results.append({
                "company": dict(company),
                "filing_dates": [r["fdate"] for r in filings],
                "active": active,
                "divested": divested,
                "high_confidence": high,
                "year_counts": [dict(r) for r in year_counts],
            })

    return {"companies": results}


@router.get("/overlap")
def subsidiary_overlap(cik1: str = Query(...), cik2: str = Query(...)):
    """Find subsidiaries shared between two companies (same name appearing in both)."""
    with get_db() as conn:
        shared = conn.execute("""
            SELECT s1.sub_name,
                   s1.time_in AS time_in_1, s1.time_out AS time_out_1,
                   s2.time_in AS time_in_2, s2.time_out AS time_out_2
            FROM subsidiaries s1
            JOIN subsidiaries s2 ON LOWER(s1.sub_name) = LOWER(s2.sub_name)
            WHERE s1.cik = ? AND s2.cik = ?
            ORDER BY s1.sub_name
            LIMIT 100
        """, (cik1, cik2)).fetchall()

        c1 = conn.execute("SELECT company_name FROM companies WHERE cik=?", (cik1,)).fetchone()
        c2 = conn.execute("SELECT company_name FROM companies WHERE cik=?", (cik2,)).fetchone()

    return {
        "company1": c1["company_name"] if c1 else cik1,
        "company2": c2["company_name"] if c2 else cik2,
        "shared_subsidiaries": [dict(r) for r in shared],
        "count": len(shared),
    }
