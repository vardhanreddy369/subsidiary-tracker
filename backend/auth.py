"""Authentication & authorization utilities."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from passlib.context import CryptContext
from fastapi import Request, HTTPException

from backend.config import JWT_SECRET, JWT_EXPIRY_HOURS
from backend.database import get_db

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


def hash_password(password: str) -> str:
    return _pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    # Support legacy SHA256 hashes (salt$hash format) for migration
    if "$2b$" not in hashed and "$" in hashed:
        import hashlib
        salt, h = hashed.split("$", 1)
        if hashlib.sha256((salt + password).encode()).hexdigest() == h:
            return True
        return False
    return _pwd_context.verify(password, hashed)


def create_access_token(user_id: int, email: str, plan: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "plan": plan,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def generate_api_key() -> str:
    return f"st_{secrets.token_urlsafe(32)}"


def get_current_user(request: Request) -> Optional[dict]:
    """Extract current user from JWT or API key. Returns None if unauthenticated."""
    # Try Bearer token
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        payload = decode_token(token)
        return _load_user(payload["sub"])

    # Try API key
    api_key = request.headers.get("X-API-Key", "")
    if api_key:
        with get_db() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE api_key = ? AND is_active = 1",
                (api_key,),
            ).fetchone()
            if row:
                return dict(row)
        raise HTTPException(status_code=401, detail="Invalid API key")

    return None


def require_auth(request: Request) -> dict:
    """Like get_current_user but raises 401 if not authenticated."""
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


def require_plan(request: Request, min_plan: str) -> dict:
    """Require a minimum plan tier. Order: free < pro < enterprise."""
    user = require_auth(request)
    tiers = {"free": 0, "pro": 1, "enterprise": 2}
    if tiers.get(user["plan"], 0) < tiers.get(min_plan, 0):
        raise HTTPException(
            status_code=403,
            detail=f"This feature requires a {min_plan} plan. Current plan: {user['plan']}",
        )
    return user


def _load_user(user_id: int) -> dict:
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE id = ? AND is_active = 1", (user_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="User not found")
        return dict(row)
