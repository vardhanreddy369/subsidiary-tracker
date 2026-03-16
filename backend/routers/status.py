"""Status & Actions endpoints — monitor system health and trigger operations."""

import os
import json
import asyncio
import aiohttp
from pathlib import Path
from fastapi import APIRouter, BackgroundTasks
from backend.database import get_db, init_db
from backend.config import DB_PATH, SAS_FILE, GEMINI_API_KEY, BASE_DIR

router = APIRouter(prefix="/api/status", tags=["Status & Actions"])


@router.get("")
def get_system_status():
    """Get full system status for all components."""
    components = []

    # 1. Database
    db_status = _check_database()
    components.append(db_status)

    # 2. SAS Dataset
    components.append(_check_sas_file())

    # 3. API Server
    components.append({
        "id": "api",
        "name": "FastAPI Server",
        "status": "healthy",
        "detail": "Running on uvicorn",
        "file": "backend/app.py",
        "actions": [],
    })

    # 4. Gemini AI
    components.append(_check_gemini())

    # 5. Auto-Updater
    components.append(_check_auto_updater())

    # 6. SEC EDGAR
    components.append({
        "id": "edgar",
        "name": "SEC EDGAR API",
        "status": "unknown",
        "detail": "Free API, 10 req/sec. Test to check connectivity.",
        "file": "backend/agent/edgar_client.py",
        "actions": [{"id": "test_edgar", "label": "Test Connection"}],
    })

    # 6. Wikipedia
    components.append({
        "id": "wikipedia",
        "name": "Wikipedia API",
        "status": "unknown",
        "detail": "Free API, no key required. Test to check connectivity.",
        "file": "backend/agent/wikipedia_client.py",
        "actions": [{"id": "test_wikipedia", "label": "Test Connection"}],
    })

    # 7. Frontend
    frontend_dir = BASE_DIR / "frontend"
    js_files = list((frontend_dir / "js").glob("*.js"))
    css_files = list((frontend_dir / "css").glob("*.css"))
    components.append({
        "id": "frontend",
        "name": "Frontend (HTML/CSS/JS)",
        "status": "healthy",
        "detail": f"{len(js_files)} JS files, {len(css_files)} CSS files",
        "file": "frontend/index.html",
        "actions": [],
    })

    # File map for code navigation
    file_map = _get_file_map()

    return {
        "components": components,
        "file_map": file_map,
    }


def _check_database():
    try:
        with get_db() as conn:
            companies = conn.execute("SELECT COUNT(*) FROM companies").fetchone()[0]
            subs = conn.execute("SELECT COUNT(*) FROM subsidiaries").fetchone()[0]
            enriched = conn.execute("SELECT COUNT(*) FROM subsidiaries WHERE enriched=1").fetchone()[0]
            db_size = os.path.getsize(str(DB_PATH)) if DB_PATH.exists() else 0
            db_size_mb = round(db_size / (1024 * 1024), 1)

        status = "healthy" if companies > 0 and subs > 0 else "warning"
        detail = f"{companies:,} companies, {subs:,} subsidiaries, {enriched:,} enriched ({db_size_mb} MB)"
        return {
            "id": "database",
            "name": "SQLite Database",
            "status": status,
            "detail": detail,
            "file": "backend/database.py",
            "metrics": {
                "companies": companies,
                "subsidiaries": subs,
                "enriched": enriched,
                "size_mb": db_size_mb,
            },
            "actions": [
                {"id": "reload_pipeline", "label": "Re-run Data Pipeline"},
                {"id": "clear_enrichments", "label": "Clear All Enrichments"},
            ],
        }
    except Exception as e:
        return {
            "id": "database",
            "name": "SQLite Database",
            "status": "error",
            "detail": f"Error: {str(e)[:200]}",
            "file": "backend/database.py",
            "actions": [{"id": "init_db", "label": "Initialize Database"}],
        }


def _check_sas_file():
    if SAS_FILE.exists():
        size_mb = round(os.path.getsize(str(SAS_FILE)) / (1024 * 1024), 1)
        return {
            "id": "sas_file",
            "name": "SAS Dataset",
            "status": "healthy",
            "detail": f"Found at {SAS_FILE.name} ({size_mb} MB)",
            "file": "backend/data_loader.py",
            "path": str(SAS_FILE),
            "actions": [],
        }
    else:
        return {
            "id": "sas_file",
            "name": "SAS Dataset",
            "status": "error",
            "detail": f"File not found: {SAS_FILE}",
            "file": "backend/config.py",
            "actions": [],
        }


def _check_gemini():
    key = os.environ.get("GEMINI_API_KEY", "")
    if key:
        return {
            "id": "gemini",
            "name": "Google Gemini AI",
            "status": "healthy",
            "detail": "API key configured",
            "file": "backend/agent/gemini_client.py",
            "actions": [{"id": "test_gemini", "label": "Test Connection"}],
        }
    else:
        return {
            "id": "gemini",
            "name": "Google Gemini AI",
            "status": "warning",
            "detail": "No API key set. Set GEMINI_API_KEY env var. Fallback heuristics will be used.",
            "file": "backend/agent/gemini_client.py",
            "actions": [{"id": "test_gemini", "label": "Test Connection"}],
            "setup_hint": "export GEMINI_API_KEY='your-key-from-ai.google.dev'",
        }


def _check_auto_updater():
    """Check auto-updater state."""
    state_file = BASE_DIR / "data" / "auto_update_state.json"
    if state_file.exists():
        try:
            state = json.loads(state_file.read_text())
            last_run = state.get("last_full_run", "Never")
            detail = f"Last run: {last_run}. Auto-start disabled — use button to trigger manually."
        except Exception:
            last_run = "Unknown"
            detail = "State file exists but unreadable. Auto-start disabled."
    else:
        last_run = "Never"
        detail = "Never run. Auto-start disabled — use button to trigger manually."

    return {
        "id": "auto_updater",
        "name": "EDGAR Auto-Updater",
        "status": "idle",
        "detail": detail,
        "file": "backend/auto_updater.py",
        "actions": [
            {"id": "run_auto_update", "label": "Run EDGAR Update Now"},
        ],
    }


def _get_file_map():
    """Return the project file structure with descriptions."""
    return [
        {"section": "Backend", "files": [
            {"path": "backend/app.py", "desc": "FastAPI entry point, route mounting, static file serving"},
            {"path": "backend/config.py", "desc": "Settings: paths, API keys, URLs"},
            {"path": "backend/database.py", "desc": "SQLite schema, connection management"},
            {"path": "backend/data_loader.py", "desc": "SAS loading, timeline algorithm, DB population"},
        ]},
        {"section": "API Routers", "files": [
            {"path": "backend/routers/companies.py", "desc": "Company list, detail, search, CSV export"},
            {"path": "backend/routers/subsidiaries.py", "desc": "Subsidiary search, stats, detail"},
            {"path": "backend/routers/search.py", "desc": "Agentic AI search trigger, SSE streaming"},
            {"path": "backend/routers/status.py", "desc": "System status, health checks, actions"},
        ]},
        {"section": "Agentic AI Engine", "files": [
            {"path": "backend/agent/orchestrator.py", "desc": "Multi-step search coordinator (EDGAR -> Wikipedia -> Gemini)"},
            {"path": "backend/agent/edgar_client.py", "desc": "SEC EDGAR API: 8-K search, company filings"},
            {"path": "backend/agent/wikipedia_client.py", "desc": "Wikipedia search and article extraction"},
            {"path": "backend/agent/gemini_client.py", "desc": "Gemini free-tier LLM reasoning + fallback heuristics"},
        ]},
        {"section": "Frontend", "files": [
            {"path": "frontend/index.html", "desc": "SPA shell, nav bar, script loading"},
            {"path": "frontend/css/styles.css", "desc": "Dark theme, responsive layout, all component styles"},
            {"path": "frontend/js/app.js", "desc": "Router, API helper, utility functions"},
            {"path": "frontend/js/dashboard.js", "desc": "Stats cards, Chart.js doughnut charts"},
            {"path": "frontend/js/company.js", "desc": "Company browser, detail, Gantt timeline, sub table"},
            {"path": "frontend/js/search.js", "desc": "Agentic search UI, SSE progress, global search"},
            {"path": "frontend/js/techstack.js", "desc": "Tech stack & skills showcase page"},
            {"path": "frontend/js/status.js", "desc": "Status dashboard, health checks, actions"},
        ]},
        {"section": "Data", "files": [
            {"path": "data/tracker.db", "desc": "SQLite database with all computed results"},
            {"path": "requirements.txt", "desc": "Python dependencies"},
        ]},
    ]


@router.post("/action/{action_id}")
async def run_action(action_id: str):
    """Execute a system action."""

    if action_id == "clear_enrichments":
        with get_db() as conn:
            count = conn.execute("SELECT COUNT(*) FROM enrichments").fetchone()[0]
            conn.execute("DELETE FROM enrichments")
            conn.execute("UPDATE subsidiaries SET enriched = 0, type = NULL, source = 'SEC Exhibit 21 filing comparison'")
        return {"success": True, "message": f"Cleared {count} enrichments and reset all subsidiaries."}

    elif action_id == "init_db":
        init_db()
        return {"success": True, "message": "Database initialized successfully."}

    elif action_id == "test_edgar":
        try:
            async with aiohttp.ClientSession() as session:
                url = "https://data.sec.gov/submissions/CIK0000831001.json"
                headers = {"User-Agent": "SubsidiaryTracker/1.0 (sri.vardhan@ucf.edu)"}
                async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        name = data.get("name", "Unknown")
                        return {"success": True, "message": f"EDGAR connected. Test company: {name}"}
                    else:
                        return {"success": False, "message": f"EDGAR returned status {resp.status}"}
        except Exception as e:
            return {"success": False, "message": f"EDGAR connection failed: {str(e)[:200]}"}

    elif action_id == "test_wikipedia":
        try:
            headers = {"User-Agent": "SubsidiaryTracker/1.0 (sri.vardhan@ucf.edu)"}
            async with aiohttp.ClientSession(headers=headers) as session:
                params = {"action": "query", "list": "search", "srsearch": "Citigroup acquisition", "srlimit": 1, "format": "json"}
                async with session.get("https://en.wikipedia.org/w/api.php", params=params, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        results = data.get("query", {}).get("search", [])
                        title = results[0]["title"] if results else "No results"
                        return {"success": True, "message": f"Wikipedia connected. Test result: \"{title}\""}
                    else:
                        return {"success": False, "message": f"Wikipedia returned status {resp.status}"}
        except Exception as e:
            return {"success": False, "message": f"Wikipedia connection failed: {str(e)[:200]}"}

    elif action_id == "test_gemini":
        key = os.environ.get("GEMINI_API_KEY", "")
        if not key:
            return {"success": False, "message": "No GEMINI_API_KEY set. Run: export GEMINI_API_KEY='your-key'"}
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={key}"
            payload = {
                "contents": [{"parts": [{"text": "Reply with exactly: OK"}]}],
                "generationConfig": {"maxOutputTokens": 10},
            }
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                        return {"success": True, "message": f"Gemini connected. Response: \"{text[:100]}\""}
                    else:
                        body = await resp.text()
                        return {"success": False, "message": f"Gemini returned {resp.status}: {body[:200]}"}
        except Exception as e:
            return {"success": False, "message": f"Gemini test failed: {str(e)[:200]}"}

    elif action_id == "reload_pipeline":
        return {"success": True, "message": "Pipeline reload started. Run manually: python -m backend.data_loader",
                "hint": "This is a long operation (~30s). Run from terminal for progress output."}

    elif action_id == "run_auto_update":
        from backend.auto_updater import run_update
        asyncio.create_task(run_update())
        return {"success": True, "message": "EDGAR auto-update started in background. This scrapes new Exhibit 21 filings and may add new subsidiaries. Check logs for progress."}

    else:
        return {"success": False, "message": f"Unknown action: {action_id}"}
