"""SEC EDGAR free API client for subsidiary research."""

import aiohttp
from backend.config import EDGAR_USER_AGENT, EDGAR_BASE_URL

HEADERS = {"User-Agent": EDGAR_USER_AGENT, "Accept": "application/json"}
TIMEOUT = aiohttp.ClientTimeout(total=15)


async def get_company_filings(cik: str, form_type: str = "10-K"):
    """Get all filings of a given type for a company."""
    padded_cik = cik.lstrip("0").zfill(10)
    url = f"{EDGAR_BASE_URL}/submissions/CIK{padded_cik}.json"

    async with aiohttp.ClientSession() as session:
        async with session.get(url, headers=HEADERS, timeout=TIMEOUT) as resp:
            if resp.status != 200:
                return []
            data = await resp.json()

    recent = data.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    dates = recent.get("filingDate", [])
    accessions = recent.get("accessionNumber", [])
    primary_docs = recent.get("primaryDocument", [])

    results = []
    for i, form in enumerate(forms):
        if form == form_type:
            results.append({
                "form": form,
                "date": dates[i] if i < len(dates) else None,
                "accession": accessions[i] if i < len(accessions) else None,
                "primary_doc": primary_docs[i] if i < len(primary_docs) else None,
            })
    return results


async def search_8k_filings(cik: str, subsidiary_name: str):
    """Search for 8-K filings that might mention acquisition/divestiture of a subsidiary."""
    padded_cik = cik.lstrip("0").zfill(10)
    url = f"{EDGAR_BASE_URL}/submissions/CIK{padded_cik}.json"

    async with aiohttp.ClientSession() as session:
        async with session.get(url, headers=HEADERS, timeout=TIMEOUT) as resp:
            if resp.status != 200:
                return []
            data = await resp.json()

    recent = data.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    dates = recent.get("filingDate", [])
    accessions = recent.get("accessionNumber", [])

    # Collect all 8-K filings
    results = []
    for i, form in enumerate(forms):
        if form in ("8-K", "8-K/A"):
            acc = accessions[i] if i < len(accessions) else None
            results.append({
                "source": "SEC EDGAR 8-K",
                "form": form,
                "date": dates[i] if i < len(dates) else None,
                "accession": acc,
                "url": f"https://www.sec.gov/Archives/edgar/data/{padded_cik}/{acc.replace('-', '')}" if acc else None,
            })

    # Also get 10-K Exhibit 21 filings for reference
    for i, form in enumerate(forms):
        if form in ("10-K", "10-K/A"):
            acc = accessions[i] if i < len(accessions) else None
            results.append({
                "source": "SEC EDGAR 10-K",
                "form": form,
                "date": dates[i] if i < len(dates) else None,
                "accession": acc,
                "url": f"https://www.sec.gov/Archives/edgar/data/{padded_cik}/{acc.replace('-', '')}" if acc else None,
            })

    # Return 8-Ks first (more relevant for M&A), then 10-Ks
    eight_ks = [r for r in results if "8-K" in r["form"]]
    ten_ks = [r for r in results if "10-K" in r["form"]]

    return eight_ks[:10] + ten_ks[:5]
