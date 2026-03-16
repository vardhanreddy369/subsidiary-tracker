"""Network API — subsidiary relationship graph data."""

from fastapi import APIRouter, Query
from backend.database import get_db

router = APIRouter(prefix="/api/network", tags=["Network"])


@router.get("/cross-links")
def cross_company_links(q: str = Query(..., description="Subsidiary name to find across companies")):
    """Find a subsidiary name appearing across multiple parent companies."""
    with get_db() as conn:
        rows = conn.execute("""
            SELECT s.id, s.cik, c.company_name, s.sub_name,
                   s.time_in, s.time_out, s.confidence
            FROM subsidiaries s
            JOIN companies c ON s.cik = c.cik
            WHERE s.sub_name LIKE ?
            ORDER BY c.company_name
            LIMIT 50
        """, (f"%{q}%",)).fetchall()

    return {
        "query": q,
        "results": [dict(r) for r in rows],
        "count": len(rows),
    }


@router.get("/{cik}")
def get_company_network(cik: str, limit: int = Query(50, ge=1, le=200)):
    """Get network graph data for a company's subsidiaries."""
    with get_db() as conn:
        company = conn.execute(
            "SELECT * FROM companies WHERE cik = ?", (cik,)
        ).fetchone()
        if not company:
            return {"error": "Company not found"}

        subs = conn.execute("""
            SELECT id, sub_name, first_seen, last_seen, time_in, time_out,
                   confidence, enriched
            FROM subsidiaries WHERE cik = ?
            ORDER BY first_seen
            LIMIT ?
        """, (cik, limit)).fetchall()

        # Build nodes and edges for force-directed graph
        nodes = [{"id": "company", "label": company["company_name"],
                  "type": "company", "size": 30}]
        edges = []

        for s in subs:
            active = s["time_out"] and s["time_out"].startswith("Active")
            nodes.append({
                "id": f"sub_{s['id']}",
                "label": s["sub_name"],
                "type": "subsidiary",
                "active": active,
                "confidence": s["confidence"],
                "time_in": s["time_in"],
                "time_out": s["time_out"],
                "enriched": bool(s["enriched"]),
                "size": 12 if active else 8,
            })
            edges.append({
                "source": "company",
                "target": f"sub_{s['id']}",
                "active": active,
            })

    return {
        "company": dict(company),
        "nodes": nodes,
        "edges": edges,
        "total_subs": company["num_subsidiaries"],
        "showing": len(subs),
    }
