"""Async SEC EDGAR Exhibit 21 scraper."""

from __future__ import annotations

import asyncio
import re
from typing import Dict, List, Optional

import aiohttp

USER_AGENT = "SubsidiaryTracker/1.0 (sri.vardhan@ucf.edu)"
HEADERS = {"User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate"}

# Semaphore to stay under 10 req/sec (use 8 concurrent)
_semaphore = asyncio.Semaphore(8)


async def _rate_limited_get(
    session: aiohttp.ClientSession, url: str
) -> aiohttp.ClientResponse:
    """Perform a GET request with rate limiting."""
    async with _semaphore:
        resp = await session.get(url, headers=HEADERS)
        # Small delay to stay under 10 req/sec
        await asyncio.sleep(0.12)
        return resp


async def discover_exhibit21_filings(
    cik: str, start_year: int = 2006, end_year: int = 2025
) -> List[Dict[str, str]]:
    """
    Discover Exhibit 21 filings from SEC EDGAR for a given CIK.

    Returns list of dicts: {cik, accession_number, filing_date, exhibit_url}
    """
    padded_cik = cik.zfill(10)
    submissions_url = f"https://data.sec.gov/submissions/CIK{padded_cik}.json"

    results = []  # type: List[Dict[str, str]]

    async with aiohttp.ClientSession() as session:
        # Fetch company submissions
        resp = await _rate_limited_get(session, submissions_url)
        if resp.status != 200:
            return results
        data = await resp.json()

        # Collect all filings (recent + older)
        all_filings = []  # type: List[Dict[str, str]]
        recent = data.get("filings", {}).get("recent", {})
        if recent:
            forms = recent.get("form", [])
            dates = recent.get("filingDate", [])
            accessions = recent.get("accessionNumber", [])
            primary_docs = recent.get("primaryDocument", [])
            for i in range(len(forms)):
                all_filings.append({
                    "form": forms[i],
                    "filingDate": dates[i],
                    "accessionNumber": accessions[i],
                    "primaryDocument": primary_docs[i] if i < len(primary_docs) else "",
                })

        # Also check older filing files
        files_list = data.get("filings", {}).get("files", [])
        for file_ref in files_list:
            file_url = f"https://data.sec.gov/submissions/{file_ref['name']}"
            try:
                file_resp = await _rate_limited_get(session, file_url)
                if file_resp.status == 200:
                    file_data = await file_resp.json()
                    forms = file_data.get("form", [])
                    dates = file_data.get("filingDate", [])
                    accessions = file_data.get("accessionNumber", [])
                    primary_docs = file_data.get("primaryDocument", [])
                    for i in range(len(forms)):
                        all_filings.append({
                            "form": forms[i],
                            "filingDate": dates[i],
                            "accessionNumber": accessions[i],
                            "primaryDocument": primary_docs[i] if i < len(primary_docs) else "",
                        })
            except Exception:
                continue

        # Filter for 10-K and 10-K/A in date range
        ten_k_filings = []
        for f in all_filings:
            form = f["form"]
            if form not in ("10-K", "10-K/A"):
                continue
            filing_date = f["filingDate"]
            try:
                year = int(filing_date[:4])
            except (ValueError, IndexError):
                continue
            if start_year <= year <= end_year:
                ten_k_filings.append(f)

        # For each 10-K, fetch the index page to find Exhibit 21
        for filing in ten_k_filings:
            accession = filing["accessionNumber"]
            accession_no_dash = accession.replace("-", "")
            index_url = (
                f"https://www.sec.gov/Archives/edgar/data/"
                f"{int(cik)}/{accession_no_dash}/{accession}-index.htm"
            )

            try:
                idx_resp = await _rate_limited_get(session, index_url)
                if idx_resp.status != 200:
                    continue
                index_html = await idx_resp.text()

                # Look for Exhibit 21 references
                exhibit_url = _find_exhibit21_url(
                    index_html, int(cik), accession_no_dash
                )
                if exhibit_url:
                    results.append({
                        "cik": cik,
                        "accession_number": accession,
                        "filing_date": filing["filingDate"],
                        "exhibit_url": exhibit_url,
                    })
            except Exception:
                continue

    return results


def _find_exhibit21_url(
    index_html: str, cik_int: int, accession_no_dash: str
) -> Optional[str]:
    """Parse the filing index page to find the Exhibit 21 document URL."""
    base = (
        f"https://www.sec.gov/Archives/edgar/data/"
        f"{cik_int}/{accession_no_dash}"
    )

    # Look for links containing "ex21" or "exhibit21" or "EX-21"
    patterns = [
        r'href="([^"]*(?:ex|exhibit)[\-_]?21[^"]*)"',
        r'href="([^"]*EX-21[^"]*)"',
        r'href="([^"]*ex21[^"]*)"',
    ]

    for pattern in patterns:
        matches = re.findall(pattern, index_html, re.IGNORECASE)
        for match in matches:
            if match.startswith("http"):
                return match
            elif match.startswith("/"):
                return f"https://www.sec.gov{match}"
            else:
                return f"{base}/{match}"

    # Fallback: look in table rows for "21" exhibit description
    rows = re.findall(
        r'<tr[^>]*>.*?</tr>', index_html, re.DOTALL | re.IGNORECASE
    )
    for row in rows:
        # Check if row mentions exhibit 21
        if re.search(r'>\s*(?:EX-?21|EXHIBIT\s*21)', row, re.IGNORECASE):
            href_match = re.search(r'href="([^"]+)"', row, re.IGNORECASE)
            if href_match:
                href = href_match.group(1)
                if href.startswith("http"):
                    return href
                elif href.startswith("/"):
                    return f"https://www.sec.gov{href}"
                else:
                    return f"{base}/{href}"

    return None


async def download_exhibit21(url: str) -> str:
    """Download an Exhibit 21 document and return its raw content."""
    async with aiohttp.ClientSession() as session:
        resp = await _rate_limited_get(session, url)
        if resp.status != 200:
            raise ValueError(f"Failed to download {url}: HTTP {resp.status}")
        return await resp.text()
