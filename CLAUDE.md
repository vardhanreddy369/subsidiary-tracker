# Subsidiary Tracker (SubTrack)

## What This Is
A SaaS-grade web app for tracking corporate subsidiary timelines using SEC Exhibit 21 filings. Built for academic research (RA project for professors). Dataset: 1.17M subsidiaries, 21.7K companies, 1994-2025.

## Architecture
- **Backend**: FastAPI (Python 3.8) + SQLite (~250MB, rebuilt from CSV.gz on deploy)
- **Frontend**: Vanilla HTML/CSS/JS (no build step), Chart.js for visualizations, GSAP for animations
- **AI Agent**: Google Gemini free tier for on-demand subsidiary enrichment
- **Deployment**: Render (render.yaml configured), GitHub repo: vardhanreddy369/subsidiary-tracker

## Key Paths
- `backend/app.py` — FastAPI entry, serves static files from `frontend/`
- `backend/database.py` — SQLite schema + queries
- `backend/data_loader.py` — SAS dataset → SQLite pipeline (source: `data/subs_all_new.sas7bdat`)
- `backend/rebuild_db.py` — Reconstructs DB from `data/*.csv.gz` on deploy
- `backend/agent/` — Gemini + EDGAR + Wikipedia enrichment (REST API, not SDK)
- `backend/agent/gemini_client.py` — Gemini REST API with retry logic, JSON parsing, type inference heuristics
- `backend/agent/data_cleaner.py` — Data quality agent (clean names, detect garbage, HTML artifacts)
- `backend/routers/data_quality.py` — Data quality API endpoints
- `backend/routers/test_agent.py` — Automated test suite (27 tests, 8 categories)
- `backend/crossref/stock_client.py` — Yahoo Finance chart API (direct urllib, no yfinance)
- `frontend/index.html` — SPA shell ("SubTrack" branding)
- `frontend/css/styles.css` — All styles (glassmorphism, aurora gradients, GSAP enhancements)
- `frontend/js/animations.js` — GSAP animation system (9 functions, ScrollTrigger)
- `frontend/js/` — dashboard.js, company.js, search.js, analytics.js, compare.js, network.js, techstack.js, status.js, app.js, crossref.js, geo.js, data-quality.js
- `data/tracker.db` — SQLite DB (gitignored, rebuilt from CSV.gz)
- `data/*.csv.gz` — Compressed exports (committed to git)

## Project Location
- **Local path:** `~/Projects/subsidiary-tracker/` (moved out of iCloud Drive to prevent SQLite sync corruption)
- **Old path (deprecated):** `~/Library/Mobile Documents/com~apple~CloudDocs/Research/subsidiary-tracker/`

## Running Locally
```bash
cd ~/Projects/subsidiary-tracker
source venv/bin/activate
GEMINI_API_KEY="..." python3 -m uvicorn backend.app:app --port 8000
```

## Commands
- `python3 -m backend.data_loader` — Rebuild DB from SAS source (has safety confirmation prompt, use `--force` to skip)
- `python3 -m backend.rebuild_db` — Rebuild DB from CSV.gz exports (for deploy)
- `python3 -m uvicorn backend.app:app --port 8000` — Start server

## Conventions
- Frontend uses IIFE pattern to avoid global namespace pollution
- All JS functions exposed via `window.*` for cross-module access
- CSS uses custom properties with deep navy base (#0a0e1a)
- No npm/node — pure vanilla JS with CDN libs (Chart.js, GSAP, Pico CSS)
- SQLite is the only datastore — no external DB needed
- API endpoints under `/api/` prefix
- Static files served from `/static/` mapped to `frontend/`
- Python 3.8 compatibility required — use `List[str]` not `list[str]`, `Optional[X]` not `X | None`
- Gemini uses direct REST API (aiohttp), not google.generativeai SDK (broken on Python 3.8)
- Config loads .env file automatically at import time (backend/config.py)
- Subsidiaries table has UNIQUE(cik, sub_name) constraint; data_loader uses INSERT OR IGNORE
- Company detail page has filter pills (confidence, status, enriched) + sort dropdown
- Search results page has filter pills (confidence, status)
- bcrypt pinned to 4.0.1 (passlib compat on Python 3.8)
- GSAP animations must accept both string selectors and DOM elements
- Dashboard charts use IntersectionObserver — don't apply gsapSmoothChartReveal on chart containers (conflicts with Chart.js rendering)
- crossref.js and geo.js use raw `fetch()` not `api()` to prevent page-wipe on HTTP errors

## Don't
- Don't add Node.js, npm, or any build tooling
- Don't replace SQLite with another database
- Don't commit `data/*.db` files (they're gitignored)
- Don't use paid APIs — Gemini free tier only
- Don't break the SPA routing in app.js
- Don't use `api()` helper for endpoints that may return errors (stock, search) — it replaces the entire page on any HTTP error
- Don't add `reveal` class to dashboard sections that have dedicated GSAP animations (causes double opacity:0 conflict)
- Don't put the project in iCloud Drive or any cloud-synced folder — SQLite DB gets corrupted by sync conflicts
- Don't add 'search' to the skeleton type mapping in app.js — causes race condition that blanks the search page
- Don't run data_loader multiple times without rebuilding — use INSERT OR IGNORE and UNIQUE constraints to prevent duplicates
