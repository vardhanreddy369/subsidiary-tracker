import re
import html
from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import Optional, List, Dict
from backend.database import get_db

router = APIRouter(prefix="/api/data-quality", tags=["data-quality"])

# ---------------------------------------------------------------------------
# Patterns for detecting quality issues
# ---------------------------------------------------------------------------
HTML_TAG_RE = re.compile(r"<[^>]+>")
GARBAGE_RE = re.compile(r"[^\x20-\x7E\xC0-\xFF]{3,}")  # 3+ non-printable chars
ENCODING_RE = re.compile(r"&[a-zA-Z]+;|&#\d+;|Ã.|â€.|Â")
SHORT_THRESHOLD = 2          # names with <= 2 chars
TRUNCATED_INDICATOR = "..."  # trailing ellipsis


def _detect_issues(name: str) -> List[str]:
    """Return list of issue tags found in a subsidiary name."""
    issues = []
    if HTML_TAG_RE.search(name):
        issues.append("html")
    if GARBAGE_RE.search(name):
        issues.append("garbage")
    if len(name.strip()) <= SHORT_THRESHOLD:
        issues.append("short")
    if name.rstrip().endswith(TRUNCATED_INDICATOR):
        issues.append("truncated")
    if ENCODING_RE.search(name):
        issues.append("encoding")
    return issues


def _clean_name(name: str, *, fix_html: bool = True,
                remove_garbage: bool = True, fix_encoding: bool = True) -> str:
    """Apply cleaning transforms to a subsidiary name."""
    cleaned = name
    if fix_html:
        cleaned = HTML_TAG_RE.sub("", cleaned)
        cleaned = html.unescape(cleaned)
    if fix_encoding:
        cleaned = html.unescape(cleaned)
        # strip leftover mojibake fragments
        cleaned = re.sub(r"Ã.|â€.|Â", "", cleaned)
    if remove_garbage:
        cleaned = GARBAGE_RE.sub("", cleaned)
    # normalise whitespace
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


# ---------------------------------------------------------------------------
# 1. GET /report — full data quality report
# ---------------------------------------------------------------------------
@router.get("/report")
def data_quality_report():
    with get_db() as conn:
        total = conn.execute("SELECT COUNT(*) FROM subsidiaries").fetchone()[0]
        rows = conn.execute("SELECT id, sub_name FROM subsidiaries").fetchall()

    issue_counts = {"html": 0, "garbage": 0, "short": 0,
                    "truncated": 0, "encoding": 0}
    records_with_issues = 0

    for row in rows:
        issues = _detect_issues(row["sub_name"])
        if issues:
            records_with_issues += 1
            for tag in issues:
                issue_counts[tag] += 1

    quality_score = round((1 - records_with_issues / max(total, 1)) * 100, 2)

    return {
        "total_records": total,
        "records_with_issues": records_with_issues,
        "clean_records": total - records_with_issues,
        "quality_score": quality_score,
        "issue_counts": issue_counts,
    }


# ---------------------------------------------------------------------------
# 2. GET /issues — paginated problematic records
# ---------------------------------------------------------------------------
@router.get("/issues")
def list_issues(
    issue_type: str = Query("all", regex="^(html|garbage|short|truncated|encoding|all)$"),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
):
    with get_db() as conn:
        rows = conn.execute(
            """SELECT s.id, s.cik, c.company_name, s.sub_name,
                      s.time_in, s.time_out, s.confidence
               FROM subsidiaries s
               LEFT JOIN companies c ON s.cik = c.cik"""
        ).fetchall()

    flagged = []
    for r in rows:
        issues = _detect_issues(r["sub_name"])
        if not issues:
            continue
        if issue_type != "all" and issue_type not in issues:
            continue
        flagged.append({**dict(r), "issues": issues})

    total = len(flagged)
    start = (page - 1) * per_page
    page_items = flagged[start : start + per_page]

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": -(-total // per_page) if total else 0,
        "items": page_items,
    }


# ---------------------------------------------------------------------------
# 3. POST /clean — run the cleaning pipeline
# ---------------------------------------------------------------------------
class CleanOptions(BaseModel):
    fix_html: bool = True
    remove_garbage: bool = True
    fix_encoding: bool = True


@router.post("/clean")
def run_clean(options: CleanOptions):
    cleaned = 0
    deleted = 0
    skipped = 0

    with get_db() as conn:
        rows = conn.execute("SELECT id, sub_name FROM subsidiaries").fetchall()
        for row in rows:
            issues = _detect_issues(row["sub_name"])
            if not issues:
                skipped += 1
                continue

            new_name = _clean_name(
                row["sub_name"],
                fix_html=options.fix_html,
                remove_garbage=options.remove_garbage,
                fix_encoding=options.fix_encoding,
            )

            if not new_name or len(new_name.strip()) <= SHORT_THRESHOLD:
                conn.execute("DELETE FROM subsidiaries WHERE id = ?", (row["id"],))
                deleted += 1
            elif new_name != row["sub_name"]:
                conn.execute(
                    "UPDATE subsidiaries SET sub_name = ? WHERE id = ?",
                    (new_name, row["id"]),
                )
                cleaned += 1
            else:
                skipped += 1

    return {"cleaned": cleaned, "deleted": deleted, "skipped": skipped}


# ---------------------------------------------------------------------------
# 4. GET /preview — dry-run of the cleaning pipeline
# ---------------------------------------------------------------------------
@router.get("/preview")
def preview_clean(
    fix_html: bool = Query(True),
    remove_garbage: bool = Query(True),
    fix_encoding: bool = Query(True),
    limit: int = Query(50, ge=1, le=200),
):
    samples = []

    with get_db() as conn:
        rows = conn.execute("SELECT id, sub_name FROM subsidiaries").fetchall()

    for row in rows:
        if len(samples) >= limit:
            break
        issues = _detect_issues(row["sub_name"])
        if not issues:
            continue

        new_name = _clean_name(
            row["sub_name"],
            fix_html=fix_html,
            remove_garbage=remove_garbage,
            fix_encoding=fix_encoding,
        )

        action = "delete" if (not new_name or len(new_name.strip()) <= SHORT_THRESHOLD) else "clean"
        if action == "clean" and new_name == row["sub_name"]:
            action = "skip"

        samples.append({
            "id": row["id"],
            "original": row["sub_name"],
            "cleaned": new_name,
            "action": action,
            "issues": issues,
        })

    return {
        "total_sampled": len(samples),
        "samples": samples,
    }


# ---------------------------------------------------------------------------
# 5. POST /clean-record/{sub_id} — update a single record manually
# ---------------------------------------------------------------------------
class ManualClean(BaseModel):
    new_name: str


@router.post("/clean-record/{sub_id}")
def clean_single_record(sub_id: int, body: ManualClean):
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id, sub_name FROM subsidiaries WHERE id = ?", (sub_id,)
        ).fetchone()
        if not existing:
            return {"error": "Record not found", "sub_id": sub_id}

        conn.execute(
            "UPDATE subsidiaries SET sub_name = ? WHERE id = ?",
            (body.new_name.strip(), sub_id),
        )

    return {
        "sub_id": sub_id,
        "old_name": existing["sub_name"],
        "new_name": body.new_name.strip(),
        "status": "updated",
    }
