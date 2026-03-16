"""Watchlist & alerts API — track companies and receive change notifications."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from backend.database import get_db
from backend.auth import require_auth

router = APIRouter(prefix="/api/watchlist", tags=["Watchlist"])


# ── Watchlist CRUD ────────────────────────────────────────────────────

@router.get("")
def get_watchlist(request: Request):
    """Get the authenticated user's watched companies."""
    user = require_auth(request)
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT w.id, w.cik, w.added_at, c.company_name, c.num_subsidiaries
            FROM watchlist w
            LEFT JOIN companies c ON c.cik = w.cik
            WHERE w.user_id = ?
            ORDER BY w.added_at DESC
            """,
            (user["id"],),
        ).fetchall()
    return [dict(r) for r in rows]


@router.post("/{cik}")
def add_to_watchlist(cik: str, request: Request):
    """Add a company to the authenticated user's watchlist."""
    user = require_auth(request)
    with get_db() as conn:
        # Check company exists
        co = conn.execute("SELECT cik FROM companies WHERE cik = ?", (cik,)).fetchone()
        if not co:
            raise HTTPException(status_code=404, detail="Company not found")
        # Upsert
        try:
            conn.execute(
                "INSERT INTO watchlist (user_id, cik) VALUES (?, ?)",
                (user["id"], cik),
            )
        except Exception:
            raise HTTPException(status_code=409, detail="Already on watchlist")
    return {"status": "added", "cik": cik}


@router.delete("/{cik}")
def remove_from_watchlist(cik: str, request: Request):
    """Remove a company from the authenticated user's watchlist."""
    user = require_auth(request)
    with get_db() as conn:
        deleted = conn.execute(
            "DELETE FROM watchlist WHERE user_id = ? AND cik = ?",
            (user["id"], cik),
        ).rowcount
    if not deleted:
        raise HTTPException(status_code=404, detail="Not on watchlist")
    return {"status": "removed", "cik": cik}


# ── Alerts ────────────────────────────────────────────────────────────

@router.get("/alerts")
def get_alerts(request: Request):
    """Get the authenticated user's alerts, most recent first."""
    user = require_auth(request)
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT a.id, a.cik, a.alert_type, a.detail, a.read, a.created_at,
                   c.company_name
            FROM alerts a
            LEFT JOIN companies c ON c.cik = a.cik
            WHERE a.user_id = ?
            ORDER BY a.created_at DESC
            LIMIT 100
            """,
            (user["id"],),
        ).fetchall()
    return [dict(r) for r in rows]


@router.post("/alerts/{alert_id}/read")
def mark_alert_read(alert_id: int, request: Request):
    """Mark a single alert as read."""
    user = require_auth(request)
    with get_db() as conn:
        updated = conn.execute(
            "UPDATE alerts SET read = 1 WHERE id = ? AND user_id = ?",
            (alert_id, user["id"]),
        ).rowcount
    if not updated:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"status": "read", "alert_id": alert_id}
