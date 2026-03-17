"""EDGAR 8-K Item 2.01 acquisition search via EFTS API."""

import asyncio
import json
import aiohttp
from backend.config import EDGAR_USER_AGENT

EFTS_URL = "https://efts.sec.gov/LATEST/search-index"
RATE_LIMIT_DELAY = 0.12  # 10 req/sec max


async def search_8k_acquisition(sub_name: str, parent_cik: str = "",
                                 session: aiohttp.ClientSession = None) -> dict:
    """Search EDGAR EFTS for 8-K Item 2.01 filings mentioning this subsidiary.

    Returns:
        {"found": bool, "filing_date": str, "filing_cik": str,
         "filer_name": str, "is_parent_filing": bool}
    """
    # Clean sub name for search (remove entity suffixes)
    clean_name = sub_name.strip()
    # Use first 3-4 meaningful words for search
    words = clean_name.split()[:4]
    search_term = " ".join(words)

    query = f'"{search_term}" "Item 2.01"'
    params = {
        "q": query,
        "forms": "8-K,8-K/A",
        "_source": "file_date,display_names,entity_id",
    }

    close_session = False
    if session is None:
        session = aiohttp.ClientSession()
        close_session = True

    try:
        headers = {"User-Agent": EDGAR_USER_AGENT}
        async with session.get(EFTS_URL, params=params, headers=headers,
                               timeout=aiohttp.ClientTimeout(total=10)) as resp:
            if resp.status != 200:
                return {"found": False, "error": f"HTTP {resp.status}"}
            data = await resp.json()

        hits = data.get("hits", {}).get("hits", [])
        if not hits:
            return {"found": False}

        # Find the best match (prefer parent's own filing)
        for hit in hits[:10]:
            src = hit.get("_source", {})
            filing_cik = src.get("entity_id", "")
            names = src.get("display_names", [])
            filer_name = names[0] if names else ""

            # Check if this is the parent's own 8-K
            is_parent = (filing_cik == parent_cik) if parent_cik else False

            if is_parent:
                return {
                    "found": True,
                    "filing_date": src.get("file_date", ""),
                    "filing_cik": filing_cik,
                    "filer_name": filer_name,
                    "is_parent_filing": True,
                }

        # Return first hit even if not parent's filing
        src = hits[0].get("_source", {})
        return {
            "found": True,
            "filing_date": src.get("file_date", ""),
            "filing_cik": src.get("entity_id", ""),
            "filer_name": src.get("display_names", [""])[0],
            "is_parent_filing": False,
        }

    except Exception as e:
        return {"found": False, "error": str(e)}
    finally:
        if close_session:
            await session.close()
        await asyncio.sleep(RATE_LIMIT_DELAY)


async def batch_check_8k(subsidiaries: list, parent_cik: str) -> list:
    """Check multiple subsidiaries against EDGAR 8-K filings.

    Args:
        subsidiaries: List of dicts with at least 'id' and 'sub_name'
        parent_cik: The parent company's CIK

    Yields:
        Dict with sub_id, sub_name, and 8-K search result
    """
    results = []
    async with aiohttp.ClientSession() as session:
        for sub in subsidiaries:
            result = await search_8k_acquisition(
                sub["sub_name"], parent_cik, session
            )
            results.append({
                "sub_id": sub["id"],
                "sub_name": sub["sub_name"],
                **result,
            })
    return results
