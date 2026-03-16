"""Geographic distribution API."""

from __future__ import annotations

from typing import Dict, List

from fastapi import APIRouter, Query
from backend.database import get_db
from backend.geo_parser import parse_geography

router = APIRouter(prefix="/api/geo", tags=["Geography"])


@router.get("/company/{cik}")
def company_geo(cik: str):
    """Return subsidiaries grouped by country for a single company."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, sub_name, first_seen, last_seen, time_in, time_out, confidence "
            "FROM subsidiaries WHERE cik = ?",
            (cik,),
        ).fetchall()

    by_country = {}  # type: Dict[str, List[dict]]
    unknown = []  # type: List[dict]
    for r in rows:
        sub = dict(r)
        geo = parse_geography(sub["sub_name"])
        if geo:
            sub["country_code"] = geo["country_code"]
            sub["country_name"] = geo["country_name"]
            sub["jurisdiction"] = geo.get("jurisdiction", "")
            key = geo["country_code"]
            by_country.setdefault(key, []).append(sub)
        else:
            sub["country_code"] = ""
            sub["country_name"] = "Unknown"
            unknown.append(sub)

    countries_summary = [
        {"country_code": code, "country_name": subs[0]["country_name"], "count": len(subs)}
        for code, subs in sorted(by_country.items(), key=lambda x: -len(x[1]))
    ]

    return {
        "cik": cik,
        "total": len(rows),
        "matched": len(rows) - len(unknown),
        "countries_summary": countries_summary,
        "by_country": by_country,
        "unknown": unknown,
    }


@router.get("/global")
def global_geo(limit: int = Query(20, ge=1, le=100)):
    """Aggregate geographic distribution across all companies (sampled for speed)."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, sub_name FROM subsidiaries ORDER BY RANDOM() LIMIT 10000"
        ).fetchall()

    counts = {}  # type: Dict[str, int]
    names = {}  # type: Dict[str, str]
    matched = 0
    for r in rows:
        geo = parse_geography(r["sub_name"])
        if geo:
            code = geo["country_code"]
            counts[code] = counts.get(code, 0) + 1
            names[code] = geo["country_name"]
            matched += 1

    top = sorted(counts.items(), key=lambda x: -x[1])[:limit]
    return {
        "sample_size": len(rows),
        "matched": matched,
        "countries": [
            {"country_code": code, "country_name": names[code], "count": cnt}
            for code, cnt in top
        ],
    }


@router.get("/countries")
def list_countries(limit: int = Query(50, ge=1, le=200)):
    """List all detected countries with counts (full scan, may be slow on first call)."""
    with get_db() as conn:
        rows = conn.execute("SELECT id, sub_name FROM subsidiaries").fetchall()

    counts = {}  # type: Dict[str, int]
    names = {}  # type: Dict[str, str]
    for r in rows:
        geo = parse_geography(r["sub_name"])
        if geo:
            code = geo["country_code"]
            counts[code] = counts.get(code, 0) + 1
            names[code] = geo["country_name"]

    sorted_countries = sorted(counts.items(), key=lambda x: -x[1])[:limit]
    return {
        "total_subsidiaries": len(rows),
        "countries": [
            {"country_code": code, "country_name": names[code], "count": cnt}
            for code, cnt in sorted_countries
        ],
    }
