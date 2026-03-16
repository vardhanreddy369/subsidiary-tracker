"""
Data cleaning agent for subsidiary names.

Detects and fixes HTML tags, garbage strings, form artifacts,
encoding issues, and other data quality problems in the subsidiaries table.
"""

import re
import html
import sqlite3
import string
from collections import Counter
from backend.config import DB_PATH
from backend.database import get_db


# ---------------------------------------------------------------------------
# Patterns
# ---------------------------------------------------------------------------

_HTML_TAG_RE = re.compile(r"<[^>]+>", re.IGNORECASE)
_CSS_BLOCK_RE = re.compile(r"\{[^}]*\}", re.DOTALL)
_STYLE_ATTR_RE = re.compile(r"style\s*=\s*[\"'][^\"']*[\"']", re.IGNORECASE)
_ENTITY_RE = re.compile(r"&[a-zA-Z]+;|&#\d+;|&#x[0-9a-fA-F]+;")
_MULTI_SPACE_RE = re.compile(r"\s{2,}")
_FORM_ARTIFACT_RE = re.compile(
    r"^\s*\??\s*(y\s*(or|/)\s*n|yes\s*(or|/)\s*no|n\s*/\s*a|none|see\s+attached"
    r"|check\s+box|select\s+one|fill\s+in|enter\s+name|name\s+of\s+subsidiary"
    r"|not\s+applicable|same\s+as\s+above)\s*$",
    re.IGNORECASE,
)
_TRUNCATED_RE = re.compile(r"\.\.\.\s*$|…\s*$")
_ENCODING_ARTIFACTS = [
    ("\u00e2\u0080\u0093", "\u2013"),  # en-dash mojibake
    ("\u00e2\u0080\u0094", "\u2014"),  # em-dash mojibake
    ("\u00e2\u0080\u0099", "\u2019"),  # right single quote mojibake
    ("\u00e2\u0080\u009c", "\u201c"),  # left double quote mojibake
    ("\u00e2\u0080\u009d", "\u201d"),  # right double quote mojibake
    ("\u00c2\u00a0", " "),             # nbsp mojibake
    ("\u00ef\u00bf\u00bd", ""),         # replacement char mojibake
]


# ---------------------------------------------------------------------------
# Core cleaning functions
# ---------------------------------------------------------------------------

def clean_html_tags(name: str) -> str:
    """Strip HTML/CSS tags and style blocks from a subsidiary name."""
    if not name:
        return name
    text = _CSS_BLOCK_RE.sub("", name)
    text = _STYLE_ATTR_RE.sub("", text)
    text = _HTML_TAG_RE.sub(" ", text)
    text = html.unescape(text)
    text = _ENTITY_RE.sub(" ", text)
    text = _MULTI_SPACE_RE.sub(" ", text)
    return text.strip()


def is_garbage_name(name: str) -> bool:
    """Detect garbled or binary strings that aren't real subsidiary names."""
    if not name or len(name.strip()) == 0:
        return True

    stripped = name.strip()

    # Too short to be meaningful (single char that isn't a real initial)
    if len(stripped) <= 1:
        return True

    # High ratio of non-printable characters
    non_printable = sum(1 for c in stripped if not c.isprintable())
    if non_printable > len(stripped) * 0.3:
        return True

    # High ratio of digits + punctuation vs letters
    letters = sum(1 for c in stripped if c.isalpha())
    if len(stripped) > 3 and letters < len(stripped) * 0.25:
        return True

    # Repeated special characters (e.g., "####", "****", "====")
    if re.match(r"^[\W_]{3,}$", stripped):
        return True

    # Random-looking strings: mostly consonants with no vowels
    alpha_only = re.sub(r"[^a-zA-Z]", "", stripped)
    if len(alpha_only) > 5:
        vowels = sum(1 for c in alpha_only.lower() if c in "aeiou")
        if vowels == 0:
            return True

    return False


def is_form_artifact(name: str) -> bool:
    """Detect form-field text like '? y or n', 'N/A', 'See attached'."""
    if not name:
        return False
    return bool(_FORM_ARTIFACT_RE.match(name.strip()))


def normalize_name(name: str) -> str:
    """Clean whitespace, fix encoding artifacts, and apply title case."""
    if not name:
        return name

    text = name.strip()

    # Fix common encoding artifacts (mojibake)
    for bad, good in _ENCODING_ARTIFACTS:
        text = text.replace(bad, good)

    # Collapse whitespace
    text = _MULTI_SPACE_RE.sub(" ", text)

    # Strip leading/trailing punctuation that isn't part of a name
    text = text.strip("-–—·• \t")

    # Title case, but preserve known uppercase tokens
    _PRESERVE_UPPER = {
        "LLC", "LP", "LLP", "INC", "CORP", "CO", "LTD", "NA", "SA", "AG",
        "NV", "BV", "PLC", "SE", "USA", "UK", "II", "III", "IV", "VI",
        "VII", "VIII", "IX", "XI", "XII", "DE", "DBA",
    }
    words = text.split()
    result = []
    for w in words:
        upper = w.upper().rstrip(".,;:")
        if upper in _PRESERVE_UPPER:
            result.append(w.upper())
        else:
            result.append(w.title() if w.isupper() or w.islower() else w)
    text = " ".join(result)

    return text


# ---------------------------------------------------------------------------
# Detection helpers
# ---------------------------------------------------------------------------

def _has_html(name: str) -> bool:
    """Check if name contains HTML or CSS artifacts."""
    if not name:
        return False
    return bool(_HTML_TAG_RE.search(name) or _CSS_BLOCK_RE.search(name) or _STYLE_ATTR_RE.search(name))


def _has_encoding_issues(name: str) -> bool:
    """Check if name has mojibake or encoding artifacts."""
    if not name:
        return False
    for bad, _ in _ENCODING_ARTIFACTS:
        if bad in name:
            return True
    # Replacement character
    if "\ufffd" in name:
        return True
    return False


def _is_truncated(name: str) -> bool:
    """Check if name appears truncated (ends with ...)."""
    if not name:
        return False
    return bool(_TRUNCATED_RE.search(name.strip()))


def _is_short(name: str, threshold: int = 3) -> bool:
    """Check if name is suspiciously short."""
    if not name:
        return True
    return len(name.strip()) < threshold


# ---------------------------------------------------------------------------
# Database operations
# ---------------------------------------------------------------------------

def clean_subsidiary_names(db_path: str = None) -> dict:
    """
    Find all dirty records, clean what can be cleaned, flag/delete garbage.

    Returns stats: {cleaned, flagged, deleted, total_checked}
    """
    db = db_path or str(DB_PATH)
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("SELECT id, sub_name FROM subsidiaries")
    rows = cursor.fetchall()

    cleaned = 0
    flagged = 0
    deleted = 0
    total_checked = len(rows)

    ids_to_delete = []
    updates = []

    for row in rows:
        sid = row["id"]
        name = row["sub_name"]

        # Check garbage first — these get deleted
        if is_garbage_name(name):
            ids_to_delete.append(sid)
            continue

        # Check form artifacts — also delete
        if is_form_artifact(name):
            ids_to_delete.append(sid)
            continue

        # Clean HTML if present
        new_name = name
        if _has_html(name):
            new_name = clean_html_tags(name)

        # Normalize
        new_name = normalize_name(new_name)

        # After cleaning, re-check if it became garbage
        if is_garbage_name(new_name):
            ids_to_delete.append(sid)
            continue

        # If name changed, queue update
        if new_name != name:
            updates.append((new_name, sid))

    # Apply updates
    for new_name, sid in updates:
        cursor.execute("UPDATE subsidiaries SET sub_name = ? WHERE id = ?", (new_name, sid))
        cleaned += 1

    # Delete garbage records
    if ids_to_delete:
        placeholders = ",".join("?" * len(ids_to_delete))
        cursor.execute(f"DELETE FROM subsidiaries WHERE id IN ({placeholders})", ids_to_delete)
        deleted = len(ids_to_delete)

    conn.commit()
    conn.close()

    # Flagged = records that were checked but not perfect (cleaned or deleted)
    flagged = cleaned + deleted

    return {
        "cleaned": cleaned,
        "flagged": flagged,
        "deleted": deleted,
        "total_checked": total_checked,
    }


def get_data_quality_report(db_path: str = None) -> dict:
    """
    Return a comprehensive data quality report.

    Includes record counts, issue breakdowns, confidence distribution,
    year coverage, data gaps, and an overall quality score.
    """
    db = db_path or str(DB_PATH)
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Total records and companies
    total_records = cursor.execute("SELECT COUNT(*) FROM subsidiaries").fetchone()[0]
    total_companies = cursor.execute("SELECT COUNT(*) FROM companies").fetchone()[0]

    # Fetch all subsidiary names for analysis
    cursor.execute("SELECT id, sub_name, confidence, first_seen, last_seen FROM subsidiaries")
    rows = cursor.fetchall()

    # Issue counters
    html_tags = 0
    garbage_names = 0
    short_names = 0
    truncated_names = 0
    encoding_issues = 0

    # Confidence distribution
    confidence_counts = Counter()

    # Year coverage
    year_counts = Counter()

    for row in rows:
        name = row["sub_name"]
        confidence = row["confidence"] or "MEDIUM"
        first_seen = row["first_seen"] or ""
        last_seen = row["last_seen"] or ""

        # Issues
        if _has_html(name):
            html_tags += 1
        if is_garbage_name(name):
            garbage_names += 1
        if _is_short(name):
            short_names += 1
        if _is_truncated(name):
            truncated_names += 1
        if _has_encoding_issues(name):
            encoding_issues += 1

        # Confidence
        confidence_counts[confidence.upper()] += 1

        # Year coverage from first_seen and last_seen
        for date_str in (first_seen, last_seen):
            if date_str and len(date_str) >= 4:
                try:
                    year = int(date_str[:4])
                    if 1900 <= year <= 2100:
                        year_counts[year] += 1
                except ValueError:
                    pass

    # Compute data gaps (missing years in the range)
    data_gaps = []
    if year_counts:
        min_year = min(year_counts.keys())
        max_year = max(year_counts.keys())
        for y in range(min_year, max_year + 1):
            if y not in year_counts:
                data_gaps.append(y)

    # Quality score: 0-100
    total_issues = html_tags + garbage_names + short_names + truncated_names + encoding_issues
    if total_records > 0:
        issue_ratio = total_issues / total_records
        quality_score = max(0, min(100, round(100 * (1 - issue_ratio))))
    else:
        quality_score = 0

    conn.close()

    return {
        "total_records": total_records,
        "total_companies": total_companies,
        "issues": {
            "html_tags": html_tags,
            "garbage_names": garbage_names,
            "short_names": short_names,
            "truncated_names": truncated_names,
            "encoding_issues": encoding_issues,
        },
        "confidence_distribution": dict(confidence_counts),
        "year_coverage": dict(sorted(year_counts.items())),
        "data_gaps": sorted(data_gaps),
        "quality_score": quality_score,
    }


def run_full_clean(db_path: str = None) -> dict:
    """Run all cleaning steps and return combined results."""
    db = db_path or str(DB_PATH)

    # Get pre-clean quality report
    pre_report = get_data_quality_report(db)

    # Run cleaning
    clean_stats = clean_subsidiary_names(db)

    # Get post-clean quality report
    post_report = get_data_quality_report(db)

    return {
        "cleaning": clean_stats,
        "quality_before": {
            "score": pre_report["quality_score"],
            "total_records": pre_report["total_records"],
            "issues": pre_report["issues"],
        },
        "quality_after": {
            "score": post_report["quality_score"],
            "total_records": post_report["total_records"],
            "issues": post_report["issues"],
        },
        "improvement": post_report["quality_score"] - pre_report["quality_score"],
    }


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import json
    print("Running full data clean...")
    results = run_full_clean()
    print(json.dumps(results, indent=2))
