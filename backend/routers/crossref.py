"""Cross-reference API — stock prices around filing dates, M&A events."""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Query
from backend.database import get_db
from backend.crossref.stock_client import get_stock_data, find_ticker_for_cik

router = APIRouter(prefix="/api/crossref", tags=["Cross-Reference"])


@router.get("/stock/{cik}")
def stock_around_filings(
    cik: str,
    days_before: int = Query(30, ge=1, le=180),
    days_after: int = Query(30, ge=1, le=180),
):
    """Get stock prices around a company's filing dates."""

    # Resolve ticker
    ticker = find_ticker_for_cik(cik)
    if not ticker:
        raise HTTPException(
            status_code=404,
            detail="Could not find a stock ticker for this CIK",
        )

    # Get filing dates
    with get_db() as conn:
        co = conn.execute(
            "SELECT company_name FROM companies WHERE cik = ?", (cik,)
        ).fetchone()
        if not co:
            raise HTTPException(status_code=404, detail="Company not found")

        frows = conn.execute(
            "SELECT fdate FROM filing_dates WHERE cik = ? ORDER BY fdate",
            (cik,),
        ).fetchall()

    filing_dates = [r["fdate"] for r in frows]
    if not filing_dates:
        return {
            "cik": cik,
            "company_name": co["company_name"],
            "ticker": ticker,
            "filing_dates": [],
            "stock_data": [],
        }

    # Use last 5 years of filings to avoid huge yfinance downloads
    try:
        last_dt = datetime.strptime(filing_dates[-1][:10], "%Y-%m-%d")
    except ValueError:
        last_dt = datetime.now()

    five_years_ago = last_dt - timedelta(days=5 * 365)
    recent_filings = [f for f in filing_dates if f[:10] >= five_years_ago.strftime("%Y-%m-%d")]
    if not recent_filings:
        recent_filings = filing_dates[-5:]  # fallback: last 5 filings

    try:
        first_dt = datetime.strptime(recent_filings[0][:10], "%Y-%m-%d")
    except ValueError:
        first_dt = five_years_ago

    start = (first_dt - timedelta(days=days_before)).strftime("%Y-%m-%d")
    end = (last_dt + timedelta(days=days_after)).strftime("%Y-%m-%d")
    filing_dates = recent_filings

    stock = get_stock_data(ticker, start, end)

    return {
        "cik": cik,
        "company_name": co["company_name"],
        "ticker": ticker,
        "filing_dates": filing_dates,
        "stock_data": stock,
    }


@router.get("/ma/{cik}")
def ma_events(cik: str):
    """Get M&A events for a company — derived from subsidiary timeline."""
    with get_db() as conn:
        co = conn.execute(
            "SELECT company_name FROM companies WHERE cik = ?", (cik,)
        ).fetchone()
        if not co:
            raise HTTPException(status_code=404, detail="Company not found")

        # Acquisitions: subsidiaries that appeared (first_seen)
        acquisitions = conn.execute(
            """
            SELECT sub_name, first_seen AS event_date, 'acquisition' AS event_type,
                   confidence, time_in
            FROM subsidiaries
            WHERE cik = ? AND first_seen IS NOT NULL
            ORDER BY first_seen DESC
            LIMIT 50
            """,
            (cik,),
        ).fetchall()

        # Divestitures: subsidiaries that disappeared (time_out populated)
        divestitures = conn.execute(
            """
            SELECT sub_name, last_seen AS event_date, 'divestiture' AS event_type,
                   confidence, time_out
            FROM subsidiaries
            WHERE cik = ? AND time_out IS NOT NULL
                AND time_out NOT LIKE 'Active%%'
            ORDER BY last_seen DESC
            LIMIT 50
            """,
            (cik,),
        ).fetchall()

    events = [dict(r) for r in acquisitions] + [dict(r) for r in divestitures]
    events.sort(key=lambda e: e.get("event_date", ""), reverse=True)

    return {
        "cik": cik,
        "company_name": co["company_name"],
        "events": events[:100],
    }
