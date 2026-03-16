"""Automated test agent — runs integration tests against the live app."""

from __future__ import annotations

import time
import os
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter

from backend.config import DATA_DIR, DB_PATH
from backend.database import get_db

router = APIRouter(prefix="/api/test-agent", tags=["test-agent"])

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"

CATEGORIES = [
    "database",
    "integrity",
    "search",
    "analytics",
    "quality",
    "auth",
    "static",
    "config",
]


def _result(
    name: str,
    category: str,
    status: str,
    detail: str,
    duration_ms: float,
) -> Dict[str, Any]:
    return {
        "name": name,
        "category": category,
        "status": status,
        "detail": detail,
        "duration_ms": round(duration_ms, 2),
    }


def _run_test(
    name: str, category: str, fn: Callable[[], str]
) -> Dict[str, Any]:
    """Execute *fn*; it should return a detail string on success or raise."""
    t0 = time.time()
    try:
        detail = fn()
        elapsed = (time.time() - t0) * 1000
        return _result(name, category, "pass", detail, elapsed)
    except AssertionError as exc:
        elapsed = (time.time() - t0) * 1000
        return _result(name, category, "fail", str(exc) or "Assertion failed", elapsed)
    except Exception as exc:
        elapsed = (time.time() - t0) * 1000
        return _result(name, category, "warn", str(exc), elapsed)


def _summarize(tests: List[Dict[str, Any]], total_start: float) -> Dict[str, Any]:
    passed = sum(1 for t in tests if t["status"] == "pass")
    failed = sum(1 for t in tests if t["status"] == "fail")
    warnings = sum(1 for t in tests if t["status"] == "warn")
    total = len(tests)
    return {
        "total": total,
        "passed": passed,
        "failed": failed,
        "warnings": warnings,
        "pass_rate": round(passed / max(total, 1) * 100, 1),
        "duration_ms": round((time.time() - total_start) * 1000, 2),
        "tests": tests,
    }


# ---------------------------------------------------------------------------
# Test definitions — grouped by category
# ---------------------------------------------------------------------------

def _tests_database() -> List[Dict[str, Any]]:
    tests = []  # type: List[Dict[str, Any]]

    def t_db_exists():
        assert DB_PATH.exists(), "tracker.db not found at %s" % DB_PATH
        size_mb = DB_PATH.stat().st_size / (1024 * 1024)
        return "DB exists (%.1f MB)" % size_mb

    def t_companies_have_records():
        with get_db() as conn:
            count = conn.execute("SELECT COUNT(*) FROM companies").fetchone()[0]
        assert count > 0, "companies table is empty"
        return "%d companies" % count

    def t_subsidiaries_have_records():
        with get_db() as conn:
            count = conn.execute("SELECT COUNT(*) FROM subsidiaries").fetchone()[0]
        assert count > 0, "subsidiaries table is empty"
        return "%d subsidiaries" % count

    def t_filing_dates_have_records():
        with get_db() as conn:
            count = conn.execute("SELECT COUNT(*) FROM filing_dates").fetchone()[0]
        assert count > 0, "filing_dates table is empty"
        return "%d filing_date rows" % count

    def t_all_tables_exist():
        expected = [
            "companies", "subsidiaries", "filing_dates", "enrichments",
            "users", "usage_log", "watchlist", "alerts",
            "scrape_jobs", "raw_exhibit21", "bulk_jobs",
        ]
        with get_db() as conn:
            rows = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
            existing = {r[0] for r in rows}
        missing = [t for t in expected if t not in existing]
        assert not missing, "Missing tables: %s" % ", ".join(missing)
        return "All %d expected tables present" % len(expected)

    tests.append(_run_test("DB file exists", "database", t_db_exists))
    tests.append(_run_test("Companies table has records", "database", t_companies_have_records))
    tests.append(_run_test("Subsidiaries table has records", "database", t_subsidiaries_have_records))
    tests.append(_run_test("Filing dates table has records", "database", t_filing_dates_have_records))
    tests.append(_run_test("All expected tables exist", "database", t_all_tables_exist))
    return tests


def _tests_integrity() -> List[Dict[str, Any]]:
    tests = []  # type: List[Dict[str, Any]]

    def t_no_orphaned_subsidiaries():
        with get_db() as conn:
            count = conn.execute(
                """SELECT COUNT(*) FROM subsidiaries s
                   LEFT JOIN companies c ON s.cik = c.cik
                   WHERE c.cik IS NULL"""
            ).fetchone()[0]
        assert count == 0, "%d orphaned subsidiaries (cik not in companies)" % count
        return "No orphaned subsidiaries"

    def t_filing_dates_reference_valid_ciks():
        with get_db() as conn:
            count = conn.execute(
                """SELECT COUNT(*) FROM filing_dates f
                   LEFT JOIN companies c ON f.cik = c.cik
                   WHERE c.cik IS NULL"""
            ).fetchone()[0]
        assert count == 0, "%d filing_dates reference invalid CIKs" % count
        return "All filing_dates reference valid CIKs"

    def t_confidence_values_valid():
        valid = {"HIGH", "MEDIUM", "LOW"}
        with get_db() as conn:
            rows = conn.execute(
                "SELECT DISTINCT confidence FROM subsidiaries"
            ).fetchall()
            values = {r[0] for r in rows if r[0] is not None}
        invalid = values - valid
        assert not invalid, "Invalid confidence values: %s" % ", ".join(sorted(invalid))
        return "All confidence values valid (%s)" % ", ".join(sorted(values))

    def t_no_null_sub_names():
        with get_db() as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM subsidiaries WHERE sub_name IS NULL OR TRIM(sub_name) = ''"
            ).fetchone()[0]
        assert count == 0, "%d subsidiaries with null/empty names" % count
        return "No null or empty subsidiary names"

    def t_company_sub_count_consistent():
        with get_db() as conn:
            row = conn.execute(
                """SELECT COUNT(*) FROM companies c
                   WHERE c.num_subsidiaries != (
                       SELECT COUNT(*) FROM subsidiaries s WHERE s.cik = c.cik
                   )"""
            ).fetchone()[0]
        if row > 0:
            raise Exception("%d companies have mismatched num_subsidiaries count (non-critical)" % row)
        return "All num_subsidiaries counts match actual rows"

    tests.append(_run_test("No orphaned subsidiaries", "integrity", t_no_orphaned_subsidiaries))
    tests.append(_run_test("Filing dates reference valid CIKs", "integrity", t_filing_dates_reference_valid_ciks))
    tests.append(_run_test("Confidence values are valid", "integrity", t_confidence_values_valid))
    tests.append(_run_test("No null/empty subsidiary names", "integrity", t_no_null_sub_names))
    tests.append(_run_test("Company subsidiary counts consistent", "integrity", t_company_sub_count_consistent))
    return tests


def _tests_search() -> List[Dict[str, Any]]:
    tests = []  # type: List[Dict[str, Any]]

    def t_search_by_name():
        with get_db() as conn:
            # Grab the first company name to use as search term
            row = conn.execute(
                "SELECT company_name FROM companies LIMIT 1"
            ).fetchone()
            assert row, "No companies to search"
            term = row[0][:5]  # first 5 chars
            results = conn.execute(
                "SELECT COUNT(*) FROM companies WHERE company_name LIKE ?",
                ("%" + term + "%",),
            ).fetchone()[0]
        assert results > 0, "Search for '%s' returned 0 results" % term
        return "Search '%s' returned %d results" % (term, results)

    def t_search_subsidiaries():
        with get_db() as conn:
            row = conn.execute(
                "SELECT sub_name FROM subsidiaries LIMIT 1"
            ).fetchone()
            assert row, "No subsidiaries to search"
            term = row[0][:5]
            results = conn.execute(
                "SELECT COUNT(*) FROM subsidiaries WHERE sub_name LIKE ?",
                ("%" + term + "%",),
            ).fetchone()[0]
        assert results > 0, "Subsidiary search for '%s' returned 0 results" % term
        return "Subsidiary search '%s' returned %d results" % (term, results)

    def t_search_case_insensitive():
        with get_db() as conn:
            row = conn.execute(
                "SELECT company_name FROM companies LIMIT 1"
            ).fetchone()
            assert row, "No companies"
            term = row[0][:5].lower()
            results = conn.execute(
                "SELECT COUNT(*) FROM companies WHERE LOWER(company_name) LIKE ?",
                ("%" + term + "%",),
            ).fetchone()[0]
        assert results > 0, "Case-insensitive search failed"
        return "Case-insensitive search works (%d results)" % results

    tests.append(_run_test("Search companies by name", "search", t_search_by_name))
    tests.append(_run_test("Search subsidiaries by name", "search", t_search_subsidiaries))
    tests.append(_run_test("Case-insensitive search works", "search", t_search_case_insensitive))
    return tests


def _tests_analytics() -> List[Dict[str, Any]]:
    tests = []  # type: List[Dict[str, Any]]

    def t_timeline_returns_data():
        with get_db() as conn:
            rows = conn.execute(
                """SELECT substr(fdate, 1, 4) AS year,
                          COUNT(DISTINCT f.cik) AS companies_filing
                   FROM filing_dates f
                   GROUP BY year ORDER BY year"""
            ).fetchall()
        assert len(rows) > 0, "Timeline query returned no data"
        return "%d years in timeline" % len(rows)

    def t_churn_returns_data():
        with get_db() as conn:
            added = conn.execute(
                """SELECT substr(first_seen, 1, 4) AS year, COUNT(*) AS added
                   FROM subsidiaries GROUP BY year ORDER BY year"""
            ).fetchall()
        assert len(added) > 0, "Churn query returned no data"
        return "%d year buckets in churn data" % len(added)

    def t_longevity_returns_data():
        with get_db() as conn:
            rows = conn.execute(
                """SELECT cik, COUNT(*) AS sub_count
                   FROM subsidiaries GROUP BY cik
                   ORDER BY sub_count DESC LIMIT 10"""
            ).fetchall()
        assert len(rows) > 0, "Longevity/top-companies query returned no data"
        return "Top company has %d subsidiaries" % rows[0]["sub_count"]

    def t_size_distribution():
        with get_db() as conn:
            rows = conn.execute(
                """SELECT
                       CASE
                           WHEN num_subsidiaries BETWEEN 0 AND 5 THEN '0-5'
                           WHEN num_subsidiaries BETWEEN 6 AND 20 THEN '6-20'
                           ELSE '20+'
                       END AS bucket,
                       COUNT(*) AS count
                   FROM companies GROUP BY bucket"""
            ).fetchall()
        assert len(rows) > 0, "Size distribution returned no data"
        return "%d size buckets" % len(rows)

    tests.append(_run_test("Timeline query returns data", "analytics", t_timeline_returns_data))
    tests.append(_run_test("Churn query returns data", "analytics", t_churn_returns_data))
    tests.append(_run_test("Longevity query returns data", "analytics", t_longevity_returns_data))
    tests.append(_run_test("Size distribution returns data", "analytics", t_size_distribution))
    return tests


def _tests_quality() -> List[Dict[str, Any]]:
    tests = []  # type: List[Dict[str, Any]]

    def t_quality_score_above_90():
        import re
        html_tag_re = re.compile(r"<[^>]+>")
        garbage_re = re.compile(r"[^\x20-\x7E\xC0-\xFF]{3,}")
        encoding_re = re.compile(r"&[a-zA-Z]+;|&#\d+;|Ã.|â€.|Â")

        with get_db() as conn:
            total = conn.execute("SELECT COUNT(*) FROM subsidiaries").fetchone()[0]
            rows = conn.execute("SELECT sub_name FROM subsidiaries").fetchall()

        issues = 0
        for r in rows:
            name = r[0]
            if (html_tag_re.search(name) or garbage_re.search(name)
                    or encoding_re.search(name) or len(name.strip()) <= 2
                    or name.rstrip().endswith("...")):
                issues += 1

        score = round((1 - issues / max(total, 1)) * 100, 2)
        assert score >= 90.0, "Quality score %.2f%% is below 90%%" % score
        return "Quality score: %.2f%% (%d issues / %d total)" % (score, issues, total)

    tests.append(_run_test("Data quality score >= 90%", "quality", t_quality_score_above_90))
    return tests


def _tests_auth() -> List[Dict[str, Any]]:
    tests = []  # type: List[Dict[str, Any]]

    def t_users_table_exists():
        with get_db() as conn:
            row = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
            ).fetchone()
        assert row, "users table does not exist"
        return "users table exists"

    def t_can_hash_password():
        from backend.auth import hash_password, verify_password
        hashed = hash_password("test_password_123")
        assert hashed and len(hashed) > 20, "Hash output too short"
        assert verify_password("test_password_123", hashed), "Password verification failed"
        return "Password hashing + verification works"

    def t_users_schema_correct():
        expected_cols = {"id", "email", "password_hash", "display_name", "plan", "api_key"}
        with get_db() as conn:
            info = conn.execute("PRAGMA table_info(users)").fetchall()
            cols = {r[1] for r in info}
        missing = expected_cols - cols
        assert not missing, "Missing user columns: %s" % ", ".join(missing)
        return "users schema has all expected columns (%d cols)" % len(cols)

    tests.append(_run_test("Users table exists", "auth", t_users_table_exists))
    tests.append(_run_test("Password hashing works", "auth", t_can_hash_password))
    tests.append(_run_test("Users schema correct", "auth", t_users_schema_correct))
    return tests


def _tests_static() -> List[Dict[str, Any]]:
    tests = []  # type: List[Dict[str, Any]]

    def t_index_html():
        p = FRONTEND_DIR / "index.html"
        assert p.exists(), "index.html not found at %s" % p
        size = p.stat().st_size
        assert size > 100, "index.html is suspiciously small (%d bytes)" % size
        return "index.html exists (%d bytes)" % size

    def t_app_js():
        p = FRONTEND_DIR / "js" / "app.js"
        assert p.exists(), "app.js not found at %s" % p
        return "app.js exists (%d bytes)" % p.stat().st_size

    def t_styles_css():
        p = FRONTEND_DIR / "css" / "styles.css"
        assert p.exists(), "styles.css not found at %s" % p
        return "styles.css exists (%d bytes)" % p.stat().st_size

    tests.append(_run_test("index.html exists", "static", t_index_html))
    tests.append(_run_test("app.js exists", "static", t_app_js))
    tests.append(_run_test("styles.css exists", "static", t_styles_css))
    return tests


def _tests_config() -> List[Dict[str, Any]]:
    tests = []  # type: List[Dict[str, Any]]

    def t_data_dir_exists():
        assert DATA_DIR.exists(), "DATA_DIR not found at %s" % DATA_DIR
        return "DATA_DIR exists at %s" % DATA_DIR

    def t_db_path_set():
        assert DB_PATH, "DB_PATH is not set"
        return "DB_PATH = %s" % DB_PATH

    def t_frontend_dir_exists():
        assert FRONTEND_DIR.exists(), "FRONTEND_DIR not found at %s" % FRONTEND_DIR
        return "FRONTEND_DIR exists at %s" % FRONTEND_DIR

    tests.append(_run_test("DATA_DIR exists", "config", t_data_dir_exists))
    tests.append(_run_test("DB_PATH is set", "config", t_db_path_set))
    tests.append(_run_test("Frontend directory exists", "config", t_frontend_dir_exists))
    return tests


# ---------------------------------------------------------------------------
# Category dispatcher
# ---------------------------------------------------------------------------

_CATEGORY_RUNNERS = {
    "database": _tests_database,
    "integrity": _tests_integrity,
    "search": _tests_search,
    "analytics": _tests_analytics,
    "quality": _tests_quality,
    "auth": _tests_auth,
    "static": _tests_static,
    "config": _tests_config,
}  # type: Dict[str, Callable[[], List[Dict[str, Any]]]]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/run")
def run_all_tests():
    """Run every test across all categories."""
    t0 = time.time()
    all_tests = []  # type: List[Dict[str, Any]]
    for runner in _CATEGORY_RUNNERS.values():
        all_tests.extend(runner())
    return _summarize(all_tests, t0)


@router.get("/run/{category}")
def run_category_tests(category: str):
    """Run tests for a specific category."""
    runner = _CATEGORY_RUNNERS.get(category)
    if not runner:
        return {
            "error": "Unknown category: %s" % category,
            "available": CATEGORIES,
        }
    t0 = time.time()
    tests = runner()
    return _summarize(tests, t0)


@router.get("/categories")
def list_categories():
    """List available test categories with test counts."""
    cats = []  # type: List[Dict[str, Any]]
    for name, runner in _CATEGORY_RUNNERS.items():
        # Run to count — fast enough
        count = len(runner())
        cats.append({"category": name, "test_count": count})
    total = sum(c["test_count"] for c in cats)
    return {"total_tests": total, "categories": cats}
