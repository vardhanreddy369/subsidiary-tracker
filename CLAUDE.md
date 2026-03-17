# Subsidiary Tracker (SubTrack)

## What This Is
An AI-powered research platform for tracking corporate subsidiary timelines using SEC Exhibit 21 filings. Built for academic research (RA project for UCF professors: Dr. Pirinsky, Dr. Gatchev, Dr. Ndum). Dataset: 1,189,794 subsidiaries, 22,296 companies, 1994-2025.

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
- `backend/data_loader.py` — SAS dataset → SQLite pipeline (source: `data/subs_all_latest.sas7bdat`)
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
- `backend/ml/` — XGBoost classifier (build_training_data.py, classifier.py)
- `backend/agent/edgar_8k.py` — EDGAR 8-K Item 2.01 acquisition search
- `tests/` — Test suite (test_api.py, test_classifier.py, test_data_pipeline.py)
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
- `python3 -m pytest tests/ -v` — Run test suite (47 tests)

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

**Gap-Fill Logic** (in `data_loader.py::fill_subsidiary_gaps`):
- If a subsidiary appears under a CIK in year Y-1 and Y+1 but not Y, synthesizes a record for year Y
- Addresses Dr. Pirinsky's suggestion to ensure continuous coverage across missing filing years
- Found and filled 172 gaps across 6 years (1998-2000, 2002-2003, 2019)

Bug fix history:
- batch_size was always 0 in bulk turbo runs (query didn't include s.cik, used query param instead of row CIK). Fixed by adding s.cik to SELECT and using row_cik.

Confidence scoring: Entity suffix detection (LLC, Inc, Corp, Ltd, GmbH, etc.) → HIGH. Otherwise uses TimeIn/TimeOut filing bracket logic.

## ML Classification Pipeline
- **XGBoost classifier** trained on 40K examples (20K acquisition, 20K internal)
- 9 features: cross_cik, name_similarity, suffix_type, first_seen_lag, batch_size, has_functional, has_geographic, token_count, is_active
- Feature importance: cross_cik=0.83, name_similarity=0.16
- Training data built from Wikidata M&A ground truth + cross-CIK labels + parent name match
- Model stored at `data/classifier_model.joblib` (gitignored)
- Estimated accuracy: ~85-90% with ML, ~70% with heuristics alone

## Dashboard Features
- **M&A Timeline Chart**: Stacked bar chart showing subsidiary type distribution by year (1994-2025)
- **Acquisition Radar**: 20 most recent high-confidence external acquisitions
- **Classification Engine Badge**: Shows ML method, estimated accuracy, type distribution bars
- **CSV Export**: Streaming endpoint (`/api/subsidiaries/export/csv`) for downloading all records

## Tests
47 tests across 3 files, all passing:
- `tests/test_api.py` (19): Dashboard stats, search/pagination, subsidiary detail, company endpoints, timeline, acquisitions, classification stats, CSV export
- `tests/test_classifier.py` (19): Joint ventures, internal creation, external acquisition, restructuring, edge cases
- `tests/test_data_pipeline.py` (9): Gap-fill logic, timeline computation, confidence scoring

## Enrichment Accuracy Research

### Current Accuracy (~70%)
Heuristic v3 achieves ~70% on known acquisitions, 100% on known internals. Distribution: 47.5% Acq, 49.6% Internal (target: ~35% Acq, ~55% Internal).

Remaining failures: Instagram (only 1 CIK, no cross-CIK signal), some Merrill Lynch entities (post-acquisition rebranding), Enron SPEs (creative names trigger false acquisition).

### Validated External APIs (all confirmed working, all free)
1. **EDGAR EFTS 8-K Search** — `efts.sec.gov/LATEST/search-index?q="SUB_NAME" "Item 2.01"&forms=8-K`
   - Confirmed: Found LinkedIn→Microsoft (2016-12-08), Whole Foods→Amazon (2017-08-28)
   - Rate: 10 req/sec. Catches ~70-80% of material acquisitions.
2. **Wikidata SPARQL** — `query.wikidata.org/sparql` with P31=Q4830453 + P127 (owned by)
   - Downloaded 5,000 M&A records, 1,195 with dates → `data/wikidata_ma_ground_truth.csv`
3. **EDGAR Submissions JSON** — `data.sec.gov/submissions/CIK{padded}.json`
   - `formerNames` array + filing history for cessation detection

### Roadmap to 90%+ Accuracy

**Phase 1: Ground Truth Dataset (1-2 days)**
- Cross-reference Wikidata 5K M&A records with our 1.19M subs
- EDGAR 8-K Item 2.01 bulk scrape for uncertain subs
- Build labeled training set of ~5-10K confirmed acquisitions + internals

**Phase 2: Feature Engineering (1 day)**
9 features ranked by importance:
1. cross_cik_flag (binary) — strongest signal
2. name_similarity_to_parent (Jaccard on meaningful words)
3. entity_suffix_type (Inc/Corp vs LLC/LP vs Ltd)
4. first_seen_lag (days after parent's first filing)
5. batch_size (# subs appearing same date)
6. has_functional_keywords (trust, funding, properties)
7. has_geographic_tokens
8. 8K_item_2_01_match (from EDGAR EFTS)
9. active_divested_status

**Phase 3: ML Classifier (2-3 days)**
- XGBoost/LightGBM on tabular features → 80-88% accuracy
- Optional: FinBERT (ProsusAI/finbert) embeddings on sub names → 88-93%
- Rule overrides (cross-CIK + 8-K match) → 90-95%

**Phase 4: Validation**
- Test against known M&A: LinkedIn, Instagram, Whole Foods, Countrywide, DreamWorks
- Test against known internal: AWS, Apple Sales International, Goldman Sachs International

### Key Academic References
- Dyreng, Lindsey, Thornock (2013) — Exhibit 21 parsing for subsidiary research
- Cohen, Malloy, Nguyen (2020) — "Lazy Prices" textual change detection in SEC filings
- Grinsztajn et al. (2022) — tree models beat deep learning on tabular data
- FinBERT (ProsusAI/finbert) — financial domain BERT model

### Paper Targets
- ICAIF 2026 (Jun-Jul deadline), JFDS (rolling), KDD ADS Track

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
- Confidence distribution: HIGH ~1,122K, MEDIUM ~68K
- Active: 173,138 | Divested: 1,016,656

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
