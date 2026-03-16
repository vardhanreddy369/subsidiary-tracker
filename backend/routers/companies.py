from fastapi import APIRouter, Query
from backend.database import get_db

router = APIRouter(prefix="/api/companies", tags=["Companies"])


@router.get("")
def list_companies(
    q: str = Query("", description="Search by company name"),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    sort: str = Query("num_subsidiaries", description="Sort field"),
    order: str = Query("desc", description="asc or desc"),
):
    offset = (page - 1) * per_page
    allowed_sorts = {"company_name", "num_subsidiaries", "num_filings", "cik"}
    if sort not in allowed_sorts:
        sort = "num_subsidiaries"
    if order not in ("asc", "desc"):
        order = "desc"
    direction = "DESC" if order == "desc" else "ASC"
    # sort and direction are validated against allowlists above — safe to interpolate
    order_clause = f"ORDER BY {sort} {direction}"

    with get_db() as conn:
        if q:
            total = conn.execute(
                "SELECT COUNT(*) FROM companies WHERE company_name LIKE ?",
                (f"%{q}%",)
            ).fetchone()[0]
            rows = conn.execute(
                f"SELECT * FROM companies WHERE company_name LIKE ? {order_clause} LIMIT ? OFFSET ?",
                (f"%{q}%", per_page, offset)
            ).fetchall()
        else:
            total = conn.execute("SELECT COUNT(*) FROM companies").fetchone()[0]
            rows = conn.execute(
                f"SELECT * FROM companies {order_clause} LIMIT ? OFFSET ?",
                (per_page, offset)
            ).fetchall()

    return {
        "companies": [dict(r) for r in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page,
    }


@router.get("/export/all")
def export_all_csv():
    """Export the full dataset as a streaming CSV of all subsidiaries with company names."""
    from fastapi.responses import StreamingResponse
    import csv
    import io

    def generate():
        # Write header
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["CIK", "COMP_NAME", "SUB_NAME", "FIRST_SEEN", "LAST_SEEN",
                          "TimeIn", "TimeOut", "Confidence", "Source", "Type"])
        yield output.getvalue()

        # Stream rows in batches to keep memory low
        batch_size = 5000
        offset = 0
        while True:
            with get_db() as conn:
                rows = conn.execute(
                    """SELECT s.cik, c.company_name, s.sub_name, s.first_seen, s.last_seen,
                              s.time_in, s.time_out, s.confidence, s.source, s.type
                       FROM subsidiaries s
                       JOIN companies c ON s.cik = c.cik
                       ORDER BY c.company_name, s.sub_name
                       LIMIT ? OFFSET ?""",
                    (batch_size, offset)
                ).fetchall()

            if not rows:
                break

            buf = io.StringIO()
            writer = csv.writer(buf)
            for r in rows:
                d = dict(r)
                writer.writerow([d["cik"], d["company_name"], d["sub_name"],
                                 d["first_seen"], d["last_seen"], d["time_in"],
                                 d["time_out"], d["confidence"], d["source"], d["type"]])
            yield buf.getvalue()
            offset += batch_size

    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=all_subsidiaries.csv"}
    )


@router.get("/{cik}")
def get_company(cik: str):
    with get_db() as conn:
        company = conn.execute(
            "SELECT * FROM companies WHERE cik = ?", (cik,)
        ).fetchone()
        if not company:
            return {"error": "Company not found"}

        filings = conn.execute(
            "SELECT fdate FROM filing_dates WHERE cik = ? ORDER BY fdate",
            (cik,)
        ).fetchall()

        subs = conn.execute(
            """SELECT id, sub_name, first_seen, last_seen, time_in, time_out,
                      confidence, source, type, enriched
               FROM subsidiaries WHERE cik = ?
               ORDER BY first_seen""",
            (cik,)
        ).fetchall()

    return {
        "company": dict(company),
        "filing_dates": [r["fdate"] for r in filings],
        "subsidiaries": [dict(s) for s in subs],
    }


@router.get("/{cik}/export")
def export_company_csv(cik: str):
    from fastapi.responses import StreamingResponse
    import csv
    import io

    with get_db() as conn:
        company = conn.execute(
            "SELECT company_name FROM companies WHERE cik = ?", (cik,)
        ).fetchone()
        subs = conn.execute(
            """SELECT s.cik, c.company_name, s.sub_name, s.first_seen, s.last_seen,
                      s.time_in, s.time_out, s.confidence, s.source, s.type
               FROM subsidiaries s
               JOIN companies c ON s.cik = c.cik
               WHERE s.cik = ?
               ORDER BY s.first_seen""",
            (cik,)
        ).fetchall()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["CIK", "COMP_NAME", "SUB_NAME", "FIRST_SEEN", "LAST_SEEN",
                      "TimeIn", "TimeOut", "Confidence", "Source", "Type"])
    for s in subs:
        writer.writerow([dict(s)[k] for k in
                         ["cik", "company_name", "sub_name", "first_seen", "last_seen",
                          "time_in", "time_out", "confidence", "source", "type"]])

    output.seek(0)
    from urllib.parse import quote
    safe_name = quote((company["company_name"].replace(" ", "_") if company else cik)[:30])
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{safe_name}_subsidiaries.csv"}
    )
