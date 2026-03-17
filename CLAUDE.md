# Subsidiary Tracker (SubTrack)

## What This Is
An AI-powered research platform for tracking corporate subsidiary timelines using SEC Exhibit 21 filings. Built for academic research (RA project for UCF professors: Dr. Pirinsky, Dr. Gatchev, Dr. Ndum). Dataset: 1.19M subsidiaries, 22,296 companies, 1994-2025.

## Architecture
- **Backend**: FastAPI (Python 3.11) + SQLite WAL mode (~500MB, rebuilt from CSV.gz on deploy)
- **Frontend**: Vanilla HTML/CSS/JS (no build step), Chart.js for visualizations, GSAP for animations
- **AI Agent**: Google Gemini 2.0 Flash free tier for on-demand subsidiary enrichment
- **Deployment**: Render (render.yaml configured, self-ping keepalive every 14 min)
- **GitHub**: vardhanreddy369/subsidiary-tracker
- **Live**: https://subsidiary-tracker.onrender.com

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

## Enrichment System
Three-tier classification of subsidiaries (External Acquisition, Internal Creation, Restructuring, Joint Venture, Divestiture):
- **Turbo** (~9s for all 1.19M): Name heuristics + filing patterns + cross-CIK detection. Sets `type` on subsidiaries table but does NOT create enrichments table rows.
- **Fast** (~1-2s/sub): EDGAR 8-K + Wikipedia + heuristics. Creates enrichments table rows.
- **Full AI** (~6-8s/sub): Gemini reasoning on top of EDGAR + Wikipedia evidence. Creates enrichments table rows.

Key heuristic signals (in `backend/agent/gemini_client.py::_infer_type_from_name`):
- **Cross-CIK detection**: Same sub_name under multiple parent CIKs = acquisition (strongest signal)
- **Name word overlap**: Zero meaningful-word overlap with parent = likely acquisition
- **Filing batch patterns**: batch_size from `(cik, first_seen)` grouping; 20+ = likely acquisition
- **Structural keywords**: Holdings, Group = Restructuring
- **First filing alignment**: Present from company's first filing = Internal Creation
- **Entity suffixes** (LLC, Inc, Corp): Stripped as noise for classification, but used for confidence scoring

Bug fix history:
- batch_size was always 0 in bulk turbo runs (query didn't include s.cik, used query param instead of row CIK). Fixed by adding s.cik to SELECT and using row_cik.

Confidence scoring: Entity suffix detection (LLC, Inc, Corp, Ltd, GmbH, etc.) → HIGH. Otherwise uses TimeIn/TimeOut filing bracket logic.

## Future Enrichment Improvements (Research)
Priority improvements to push accuracy beyond current heuristic level:
1. **EDGAR 8-K Item 2.01 search** — Query `https://efts.sec.gov/LATEST/search-index?q="SUB_NAME" "Item 2.01"&forms=8-K` for uncertain cases. Rate: 10 req/sec.
2. **EDGAR filing cessation** — If a sub has its own CIK and stopped filing 10-K/10-Q, it was acquired. Check via `https://data.sec.gov/submissions/CIK{padded}.json` → `filings.recent`.
3. **EDGAR formerNames** — CIK JSON has `formerNames[]` array. Name changes signal acquisition/rebranding.
4. **Wikidata SPARQL** — Bulk query P127 ("owned by") property for structured M&A ground truth.
5. **Wikipedia API** — Search for "acquired by" language for notable companies.
6. **ML classifier** — Train on ground truth from above sources. Features: name similarity, cross-CIK, 8-K hits, batch_size, filing cessation. Even logistic regression should hit 85%+.

Academic paper targets: ICAIF 2026 (Jun-Jul deadline), JFDS (rolling), KDD ADS Track.

## Conventions
- Frontend uses IIFE pattern to avoid global namespace pollution
- All JS functions exposed via `window.*` for cross-module access
- CSS uses custom properties with deep navy base (#0a0e1a)
- No npm/node — pure vanilla JS with CDN libs (Chart.js, GSAP, Pico CSS)
- SQLite is the only datastore — no external DB needed
- API endpoints under `/api/` prefix
- Static files served from `/static/` mapped to `frontend/`
- Python 3.11 (was 3.8, upgraded for Render deployment)
- Gemini uses direct REST API (aiohttp), not google.generativeai SDK
- Config loads .env file automatically at import time (backend/config.py)
- Subsidiaries table has UNIQUE(cik, sub_name) constraint; data_loader uses INSERT OR IGNORE
- Company detail page has filter pills (confidence, status, enriched) + sort dropdown
- Search results page has filter pills (confidence, status)
- GSAP animations must accept both string selectors and DOM elements
- Dashboard charts use IntersectionObserver — don't apply gsapSmoothChartReveal on chart containers (conflicts with Chart.js rendering)
- crossref.js and geo.js use raw `fetch()` not `api()` to prevent page-wipe on HTTP errors

## Database
- `data/tracker.db` is the actual database (not `subsidiary_tracker.db` in root which is empty)
- Tables: `companies`, `subsidiaries`, `enrichments`, `filing_dates`, `users`, `api_keys`, `jobs`
- `subsidiaries.enriched` = 1 means turbo-classified (type set, but no enrichments rows)
- `enrichments` table has detailed data only from Fast/Full AI enrichment
- Confidence distribution (after entity suffix fix): HIGH ~928K, MEDIUM ~262K

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
