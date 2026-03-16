"""Wikipedia API client for finding acquisition/merger info."""

import aiohttp
from backend.config import WIKIPEDIA_API_URL

HEADERS = {"User-Agent": "SubsidiaryTracker/1.0 (sri.vardhan@ucf.edu)"}
TIMEOUT = aiohttp.ClientTimeout(total=10)


async def search_wikipedia(company_name: str, subsidiary_name: str):
    """Search Wikipedia for acquisition/merger information with multiple strategies."""
    # Clean names for better search
    company_clean = company_name.replace(" inc", "").replace(" corp", "").replace(" llc", "").strip()
    sub_clean = subsidiary_name.replace(" inc", "").replace(" corp", "").replace(" llc", "").strip()

    queries = [
        f"{company_clean} acquisition {sub_clean}",
        f"{sub_clean} company",
        f"{company_clean} subsidiary",
    ]

    seen_titles = set()
    results = []
    async with aiohttp.ClientSession(headers=HEADERS) as session:
        for query in queries:
            params = {
                "action": "query",
                "list": "search",
                "srsearch": query,
                "srlimit": 3,
                "format": "json",
                "utf8": 1,
            }
            try:
                async with session.get(WIKIPEDIA_API_URL, params=params,
                                       timeout=TIMEOUT) as resp:
                    if resp.status != 200:
                        continue
                    data = await resp.json()
                    for item in data.get("query", {}).get("search", []):
                        title = item.get("title", "")
                        if title in seen_titles:
                            continue
                        seen_titles.add(title)
                        results.append({
                            "source": "Wikipedia",
                            "title": title,
                            "snippet": item.get("snippet", "").replace("<span class=\"searchmatch\">", "").replace("</span>", ""),
                            "url": f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}",
                        })
            except Exception:
                continue

    return results[:5]


async def get_article_extract(title: str):
    """Get a summary extract from a Wikipedia article."""
    params = {
        "action": "query",
        "titles": title,
        "prop": "extracts",
        "exintro": True,
        "explaintext": True,
        "format": "json",
    }

    async with aiohttp.ClientSession(headers=HEADERS) as session:
        try:
            async with session.get(WIKIPEDIA_API_URL, params=params,
                                   timeout=TIMEOUT) as resp:
                if resp.status != 200:
                    return ""
                data = await resp.json()
                pages = data.get("query", {}).get("pages", {})
                for page in pages.values():
                    return page.get("extract", "")[:2000]
        except Exception:
            return ""
    return ""
