"""Multi-strategy parser for SEC Exhibit 21 documents."""

from __future__ import annotations

import re
from typing import List, Optional

from bs4 import BeautifulSoup


def parse_exhibit21(content: str, url: str = "") -> List[str]:
    """
    Parse an Exhibit 21 document and extract subsidiary names.

    Tries multiple strategies in order:
    1. HTML table parsing (BeautifulSoup)
    2. Plain text line-by-line extraction
    3. Regex pattern matching

    Returns a cleaned, deduplicated list of subsidiary names.
    """
    subsidiaries = []  # type: List[str]

    # Strategy 1: HTML table parsing
    html_results = _parse_html_tables(content)
    if html_results:
        subsidiaries = html_results
    else:
        # Strategy 2: Plain text line-by-line
        text_results = _parse_plain_text(content)
        if text_results:
            subsidiaries = text_results
        else:
            # Strategy 3: Regex patterns
            regex_results = _parse_regex(content)
            subsidiaries = regex_results

    # Clean and deduplicate
    cleaned = _clean_subsidiary_names(subsidiaries)
    return cleaned


def _parse_html_tables(content: str) -> List[str]:
    """Extract subsidiary names from HTML tables."""
    if "<table" not in content.lower() and "<tr" not in content.lower():
        return []

    soup = BeautifulSoup(content, "html.parser")
    names = []  # type: List[str]

    tables = soup.find_all("table")
    for table in tables:
        rows = table.find_all("tr")
        for row in rows:
            cells = row.find_all(["td", "th"])
            if not cells:
                continue

            # The first cell typically contains the subsidiary name
            name_text = cells[0].get_text(strip=True)
            if name_text and _looks_like_subsidiary_name(name_text):
                names.append(name_text)

    return names


def _parse_plain_text(content: str) -> List[str]:
    """Extract subsidiary names from plain text, line by line."""
    # Strip HTML tags if present
    if "<" in content:
        soup = BeautifulSoup(content, "html.parser")
        text = soup.get_text("\n")
    else:
        text = content

    names = []  # type: List[str]
    lines = text.split("\n")

    in_subsidiary_section = False

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        # Detect the start of the subsidiary list section
        if re.search(
            r"exhibit\s*21|subsidiaries|list of subsidiar",
            stripped,
            re.IGNORECASE,
        ):
            in_subsidiary_section = True
            continue

        if in_subsidiary_section:
            # Stop at common ending markers
            if re.search(
                r"^\s*(exhibit\s*2[2-9]|signatures?|part\s+(ii|iii|iv))',",
                stripped,
                re.IGNORECASE,
            ):
                break

            # Skip header-like lines
            if re.search(
                r"^(name\s+of|jurisdiction|state|country|incorporated)",
                stripped,
                re.IGNORECASE,
            ):
                continue

            # Extract potential subsidiary name (before jurisdiction info)
            # Many formats: "Name    State" or "Name (State)" or just "Name"
            name = _extract_name_from_line(stripped)
            if name and _looks_like_subsidiary_name(name):
                names.append(name)

    # If we didn't find a section header, try all lines
    if not names:
        for line in lines:
            stripped = line.strip()
            if stripped and _looks_like_subsidiary_name(stripped):
                name = _extract_name_from_line(stripped)
                if name:
                    names.append(name)

    return names


def _parse_regex(content: str) -> List[str]:
    """Extract subsidiary names using regex patterns."""
    # Strip HTML if present
    if "<" in content:
        soup = BeautifulSoup(content, "html.parser")
        text = soup.get_text("\n")
    else:
        text = content

    names = []  # type: List[str]

    # Pattern 1: Lines that look like company names (contain LLC, Inc, Corp, Ltd, etc.)
    company_pattern = re.compile(
        r"^[\s\d.)*-]*(.+?(?:LLC|Inc\.?|Corp\.?|Ltd\.?|L\.?P\.?|N\.?V\.?|S\.?A\.?|"
        r"GmbH|B\.?V\.?|PLC|Limited|Corporation|Company|Co\.|Group|Holdings?))"
        r"[\s,]*(?:\(.*?\))?\s*$",
        re.IGNORECASE | re.MULTILINE,
    )
    for match in company_pattern.finditer(text):
        name = match.group(1).strip()
        if name and len(name) > 2:
            names.append(name)

    # Pattern 2: Lines between common delimiters that look like entity names
    if not names:
        entity_pattern = re.compile(
            r"^\s*(?:\d+[.)]\s*)?([A-Z][A-Za-z\s&.,'-]+(?:LLC|Inc|Corp|Ltd|LP)\.?)",
            re.MULTILINE,
        )
        for match in entity_pattern.finditer(text):
            name = match.group(1).strip()
            if name and len(name) > 2:
                names.append(name)

    return names


def _extract_name_from_line(line: str) -> Optional[str]:
    """Extract a subsidiary name from a line, stripping jurisdiction info."""
    # Remove leading numbers/bullets
    cleaned = re.sub(r"^\s*[\d.)*\-]+\s*", "", line)

    # Split on multiple spaces or tabs (jurisdiction often follows)
    parts = re.split(r"\s{3,}|\t+", cleaned, maxsplit=1)
    name = parts[0].strip()

    # Remove trailing jurisdiction in parentheses
    name = re.sub(r"\s*\(.*?\)\s*$", "", name)

    # Remove trailing state abbreviations (e.g., "DE", "CA", "NY")
    name = re.sub(r"\s+[A-Z]{2}\s*$", "", name)

    return name.strip() if name.strip() else None


def _looks_like_subsidiary_name(text: str) -> bool:
    """Heuristic check: does this text look like a subsidiary/company name?"""
    text = text.strip()

    # Too short or too long
    if len(text) < 3 or len(text) > 200:
        return False

    # Skip page numbers, dates, and common non-name patterns
    if re.match(r"^\d+$", text):
        return False
    if re.match(r"^\d{1,2}/\d{1,2}/\d{2,4}$", text):
        return False

    # Skip common headers and boilerplate
    skip_patterns = [
        r"^exhibit\s*\d",
        r"^page\s*\d",
        r"^subsidiaries?\s*of",
        r"^list\s+of",
        r"^name\s+of",
        r"^jurisdiction",
        r"^state\s+of",
        r"^incorporated",
        r"^organized",
        r"^\*+$",
        r"^-+$",
        r"^=+$",
    ]
    for pattern in skip_patterns:
        if re.match(pattern, text, re.IGNORECASE):
            return False

    return True


def _clean_subsidiary_names(names: List[str]) -> List[str]:
    """Clean and deduplicate subsidiary names."""
    seen = set()  # type: set
    cleaned = []  # type: List[str]

    for name in names:
        # Normalize whitespace
        name = re.sub(r"\s+", " ", name).strip()

        # Skip empty or very short
        if not name or len(name) < 3:
            continue

        # Deduplicate (case-insensitive)
        key = name.lower()
        if key not in seen:
            seen.add(key)
            cleaned.append(name)

    return cleaned
