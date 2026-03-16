"""Rate limiting, brute-force protection, and usage logging middleware."""

import time
from collections import defaultdict
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from backend.config import RATE_LIMITS
from backend.database import get_db
from backend.auth import get_current_user

# In-memory IP-based rate limiting for auth endpoints (brute-force protection)
_auth_attempts: dict = defaultdict(list)  # ip -> [timestamps]
_AUTH_WINDOW = 300  # 5 minutes
_AUTH_MAX_ATTEMPTS = 10  # max 10 attempts per 5 min per IP

# IP-based rate limiting for anonymous users
_anon_requests: dict = defaultdict(list)
_ANON_WINDOW = 60  # 1 minute
_ANON_MAX_REQUESTS = 60  # 60 req/min for anonymous


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check_ip_rate(store: dict, ip: str, window: int, max_count: int) -> bool:
    """Returns True if rate limit exceeded."""
    now = time.time()
    store[ip] = [t for t in store[ip] if now - t < window]
    if len(store[ip]) >= max_count:
        return True
    store[ip].append(now)
    return False


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Log usage and enforce rate limits based on user plan."""

    SKIP_PATHS = {"/health", "/", "/robots.txt", "/sitemap.xml", "/docs", "/openapi.json"}

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Skip non-API paths and static files
        if path in self.SKIP_PATHS or path.startswith("/static") or not path.startswith("/api"):
            return await call_next(request)

        # Skip billing webhook (Stripe calls this)
        if path == "/api/billing/webhook":
            return await call_next(request)

        client_ip = _get_client_ip(request)

        # Brute-force protection on auth endpoints
        if path.startswith("/api/auth") and request.method == "POST":
            if _check_ip_rate(_auth_attempts, client_ip, _AUTH_WINDOW, _AUTH_MAX_ATTEMPTS):
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too many attempts. Try again later."},
                    headers={"Retry-After": str(_AUTH_WINDOW)},
                )
            return await call_next(request)

        # Skip remaining rate limiting for auth GET endpoints
        if path.startswith("/api/auth"):
            return await call_next(request)

        # Get user (may be None for anonymous)
        try:
            user = get_current_user(request)
        except Exception:
            user = None

        plan = user["plan"] if user else "free"
        limit = RATE_LIMITS.get(plan, 10)

        if user:
            # Authenticated user: check daily plan limits
            if limit > 0:
                with get_db() as conn:
                    today_count = conn.execute(
                        """SELECT COUNT(*) as cnt FROM usage_log
                           WHERE user_id = ? AND timestamp >= date('now')""",
                        (user["id"],),
                    ).fetchone()["cnt"]

                    if today_count >= limit:
                        return JSONResponse(
                            status_code=429,
                            content={
                                "detail": "Rate limit exceeded",
                                "plan": plan,
                                "limit": limit,
                                "used": today_count,
                                "upgrade_url": "/api/billing/create-checkout-session",
                            },
                            headers={"Retry-After": "86400"},
                        )
        else:
            # Anonymous user: IP-based rate limiting
            if _check_ip_rate(_anon_requests, client_ip, _ANON_WINDOW, _ANON_MAX_REQUESTS):
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded. Sign up for higher limits."},
                    headers={"Retry-After": "60"},
                )

        # Process request
        response = await call_next(request)

        # Log usage for authenticated users
        if user and response.status_code < 400:
            try:
                with get_db() as conn:
                    conn.execute(
                        "INSERT INTO usage_log (user_id, endpoint, method) VALUES (?, ?, ?)",
                        (user["id"], path, request.method),
                    )
            except Exception:
                pass

        return response
