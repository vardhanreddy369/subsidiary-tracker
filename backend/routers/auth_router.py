"""Authentication router — signup, login, profile, API keys."""

from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr

from backend.database import get_db
from backend.auth import (
    hash_password,
    verify_password,
    create_access_token,
    generate_api_key,
    require_auth,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class SignupRequest(BaseModel):
    email: str
    password: str
    display_name: str = ""


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/signup")
def signup(body: SignupRequest):
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if not any(c.isupper() for c in body.password):
        raise HTTPException(status_code=400, detail="Password must contain at least one uppercase letter")
    if not any(c.isdigit() for c in body.password):
        raise HTTPException(status_code=400, detail="Password must contain at least one number")

    with get_db() as conn:
        existing = conn.execute(
            "SELECT id FROM users WHERE email = ?", (body.email.lower().strip(),)
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Email already registered")

        api_key = generate_api_key()
        conn.execute(
            """INSERT INTO users (email, password_hash, display_name, api_key)
               VALUES (?, ?, ?, ?)""",
            (
                body.email.lower().strip(),
                hash_password(body.password),
                body.display_name or body.email.split("@")[0],
                api_key,
            ),
        )
        user = conn.execute(
            "SELECT * FROM users WHERE email = ?", (body.email.lower().strip(),)
        ).fetchone()

    token = create_access_token(user["id"], user["email"], user["plan"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "display_name": user["display_name"],
            "plan": user["plan"],
            "api_key": user["api_key"],
        },
    }


@router.post("/login")
def login(body: LoginRequest):
    with get_db() as conn:
        user = conn.execute(
            "SELECT * FROM users WHERE email = ? AND is_active = 1",
            (body.email.lower().strip(),),
        ).fetchone()
        if not user or not verify_password(body.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        conn.execute(
            "UPDATE users SET last_login = ? WHERE id = ?",
            (datetime.now(timezone.utc).isoformat(), user["id"]),
        )

    token = create_access_token(user["id"], user["email"], user["plan"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "display_name": user["display_name"],
            "plan": user["plan"],
            "api_key": user["api_key"],
        },
    }


@router.get("/me")
def get_profile(request: Request):
    user = require_auth(request)
    with get_db() as conn:
        usage_count = conn.execute(
            "SELECT COUNT(*) as cnt FROM usage_log WHERE user_id = ?", (user["id"],)
        ).fetchone()["cnt"]

    return {
        "id": user["id"],
        "email": user["email"],
        "display_name": user["display_name"],
        "plan": user["plan"],
        "api_key": user["api_key"],
        "created_at": user["created_at"],
        "last_login": user["last_login"],
        "total_requests": usage_count,
    }


@router.post("/api-key/regenerate")
def regenerate_api_key(request: Request):
    user = require_auth(request)
    new_key = generate_api_key()
    with get_db() as conn:
        conn.execute("UPDATE users SET api_key = ? WHERE id = ?", (new_key, user["id"]))
    return {"api_key": new_key}


@router.get("/usage")
def get_usage(request: Request):
    user = require_auth(request)
    with get_db() as conn:
        today_count = conn.execute(
            """SELECT COUNT(*) as cnt FROM usage_log
               WHERE user_id = ? AND timestamp >= date('now')""",
            (user["id"],),
        ).fetchone()["cnt"]
        total_count = conn.execute(
            "SELECT COUNT(*) as cnt FROM usage_log WHERE user_id = ?", (user["id"],)
        ).fetchone()["cnt"]
        recent = conn.execute(
            """SELECT endpoint, method, timestamp FROM usage_log
               WHERE user_id = ? ORDER BY timestamp DESC LIMIT 20""",
            (user["id"],),
        ).fetchall()

    return {
        "today": today_count,
        "total": total_count,
        "plan": user["plan"],
        "recent": [dict(r) for r in recent],
    }
