"""Subsidiary Tracker — FastAPI Application"""

import asyncio
import logging
import os
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, PlainTextResponse
from backend.database import init_db
# auto_update_loop removed from auto-start — use /api/admin/scrape/start or Status page instead
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO)
from backend.routers import companies, subsidiaries, search, status, analytics, compare, network
from backend.routers import auth_router, billing, exports
from backend.routers import scraper_router, jobs_router
from backend.routers import geo, watchlist, crossref, data_quality
from backend.routers import test_agent
from backend.middleware import RateLimitMiddleware

app = FastAPI(
    title="Subsidiary Tracker",
    description="AI-powered corporate subsidiary timeline research tool",
    version="2.0.0",
)

# CORS — restrict to known origins in production
_allowed_origins = os.environ.get("CORS_ORIGINS", "http://localhost:8000,http://127.0.0.1:8000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key"],
)

# Security headers middleware
from starlette.middleware.base import BaseHTTPMiddleware

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# Rate limiting middleware
app.add_middleware(RateLimitMiddleware)

# Mount routers
app.include_router(auth_router.router)
app.include_router(billing.router)
app.include_router(exports.router)
app.include_router(companies.router)
app.include_router(subsidiaries.router)
app.include_router(search.router)
app.include_router(status.router)
app.include_router(analytics.router)
app.include_router(compare.router)
app.include_router(network.router)
app.include_router(scraper_router.router)
app.include_router(jobs_router.router)
app.include_router(geo.router)
app.include_router(watchlist.router)
app.include_router(crossref.router)
app.include_router(data_quality.router)
app.include_router(test_agent.router)

# Serve frontend static files
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.on_event("startup")
async def startup():
    init_db()


@app.get("/", include_in_schema=False)
async def serve_frontend():
    return FileResponse(str(FRONTEND_DIR / "index.html"))


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/robots.txt", include_in_schema=False)
def robots_txt():
    return PlainTextResponse(
        "User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n"
    )


@app.get("/sitemap.xml", include_in_schema=False)
def sitemap_xml(request: Request):
    from fastapi.responses import Response
    base = os.environ.get("APP_URL", str(request.base_url).rstrip("/"))
    pages = [
        "/", "/#dashboard", "/#companies", "/#analytics",
        "/#compare", "/#network", "/#search", "/#techstack", "/#status",
        "/#geo", "/#crossref", "/#data-quality", "/#pricing",
    ]
    urls = "\n".join(
        f"  <url><loc>{base}{p}</loc><changefreq>weekly</changefreq></url>"
        for p in pages
    )
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{urls}
</urlset>"""
    return Response(content=xml, media_type="application/xml")
