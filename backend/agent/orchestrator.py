"""Agentic search orchestrator — coordinates EDGAR, Wikipedia, and Gemini."""

import asyncio
from datetime import datetime
from backend.database import get_db
from backend.agent.edgar_client import search_8k_filings, get_company_filings
from backend.agent.wikipedia_client import search_wikipedia, get_article_extract
from backend.agent.gemini_client import reason_with_gemini, _fallback_reasoning
from backend.routers.subsidiaries import invalidate_stats_cache


async def enrich_subsidiary(sub: dict):
    """
    Run the agentic enrichment pipeline for a subsidiary.
    Yields progress updates as dicts for SSE streaming.
    """
    cik = sub["cik"]
    sub_name = sub["sub_name"]
    company_name = sub["company_name"]
    sub_id = sub["id"]

    algorithmic_estimate = {
        "time_in": sub.get("time_in", ""),
        "time_out": sub.get("time_out", ""),
        "confidence": sub.get("confidence", ""),
    }

    yield {
        "step": 1,
        "title": "Starting agentic search",
        "detail": f"Researching: {sub_name} (Parent: {company_name})",
        "status": "running",
    }

    # Step 1 & 2: Search EDGAR and Wikipedia in parallel
    yield {
        "step": 2,
        "title": "Searching SEC EDGAR",
        "detail": f"Looking for 8-K filings for {company_name}...",
        "status": "running",
    }

    # Run EDGAR and Wikipedia searches concurrently
    edgar_task = asyncio.create_task(_search_edgar_safe(cik, sub_name))
    wiki_task = asyncio.create_task(_search_wiki_safe(company_name, sub_name))

    edgar_results, edgar_detail = await edgar_task

    yield {
        "step": 2,
        "title": "SEC EDGAR Complete",
        "detail": edgar_detail,
        "status": "done",
        "results": edgar_results[:3],
    }

    yield {
        "step": 3,
        "title": "Searching Wikipedia",
        "detail": f"Looking for acquisition/merger info...",
        "status": "running",
    }

    wiki_results, wiki_detail = await wiki_task

    yield {
        "step": 3,
        "title": "Wikipedia Complete",
        "detail": wiki_detail,
        "status": "done",
        "results": wiki_results[:2],
    }

    # Step 3: AI Reasoning with Gemini
    yield {
        "step": 4,
        "title": "AI Reasoning (Gemini)",
        "detail": "Analyzing all sources to determine precise dates...",
        "status": "running",
    }

    try:
        ai_result = await reason_with_gemini(
            company_name, sub_name,
            algorithmic_estimate, edgar_results, wiki_results
        )
        ai_detail = f"Type: {ai_result.get('Type', 'Unknown')}, Confidence: {ai_result.get('Confidence', 'Unknown')}"
    except Exception as e:
        ai_result = {
            "TimeIn": algorithmic_estimate["time_in"],
            "TimeOut": algorithmic_estimate["time_out"],
            "Type": "Unknown",
            "MainSource": "SEC Exhibit 21",
            "Confidence": "LOW",
            "Notes": f"AI reasoning failed: {str(e)[:100]}",
        }
        ai_detail = "Fallback to algorithmic estimate"

    yield {
        "step": 4,
        "title": "AI Reasoning Complete",
        "detail": ai_detail,
        "status": "done",
        "result": ai_result,
    }

    # Step 4: Validate and store enrichment
    yield {
        "step": 5,
        "title": "Saving Results",
        "detail": "Validating and storing enrichment...",
        "status": "running",
    }

    try:
        with get_db() as conn:
            # Check if already enriched — update instead of duplicate
            existing = conn.execute(
                "SELECT id FROM enrichments WHERE sub_id = ?", (sub_id,)
            ).fetchone()

            if existing:
                conn.execute(
                    """UPDATE enrichments SET
                       source_type = ?, source_url = ?, detail = ?,
                       time_in_precise = ?, time_out_precise = ?, sub_type = ?,
                       searched_at = datetime('now')
                       WHERE sub_id = ?""",
                    (ai_result.get("Type", "Unknown"),
                     ai_result.get("MainSource", ""),
                     ai_result.get("Notes", ""),
                     ai_result.get("TimeIn", ""),
                     ai_result.get("TimeOut", ""),
                     ai_result.get("Type", ""),
                     sub_id)
                )
            else:
                conn.execute(
                    """INSERT INTO enrichments
                       (sub_id, source_type, source_url, detail, time_in_precise, time_out_precise, sub_type)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (sub_id,
                     ai_result.get("Type", "Unknown"),
                     ai_result.get("MainSource", ""),
                     ai_result.get("Notes", ""),
                     ai_result.get("TimeIn", ""),
                     ai_result.get("TimeOut", ""),
                     ai_result.get("Type", ""))
                )

            conn.execute(
                """UPDATE subsidiaries SET enriched = 1, type = ?,
                   source = ? WHERE id = ?""",
                (ai_result.get("Type", ""), ai_result.get("MainSource", ""), sub_id)
            )
        invalidate_stats_cache()
    except Exception as e:
        print(f"DB save error: {e}")

    yield {
        "step": 5,
        "title": "Complete",
        "detail": f"Enrichment saved. Type: {ai_result.get('Type', 'Unknown')}",
        "status": "done",
        "final_result": ai_result,
    }


async def enrich_subsidiary_fast(sub: dict):
    """
    Fast enrichment — EDGAR + Wikipedia + heuristics only, no Gemini.
    ~1-2 seconds per subsidiary instead of 6-8s.
    """
    cik = sub["cik"]
    sub_name = sub["sub_name"]
    company_name = sub["company_name"]
    sub_id = sub["id"]

    algorithmic_estimate = {
        "time_in": sub.get("time_in", ""),
        "time_out": sub.get("time_out", ""),
        "confidence": sub.get("confidence", ""),
    }

    yield {"step": 1, "title": "Fast enrichment", "detail": f"{sub_name}", "status": "running"}

    # EDGAR + Wikipedia in parallel
    edgar_task = asyncio.create_task(_search_edgar_safe(cik, sub_name))
    wiki_task = asyncio.create_task(_search_wiki_safe(company_name, sub_name))

    edgar_results, edgar_detail = await edgar_task
    wiki_results, wiki_detail = await wiki_task

    yield {"step": 2, "title": "Sources found", "detail": f"{edgar_detail}; {wiki_detail}", "status": "done"}

    # Heuristic reasoning (no Gemini)
    ai_result = _fallback_reasoning(algorithmic_estimate, edgar_results, wiki_results,
                                     company_name, sub_name)

    # Save to DB
    try:
        with get_db() as conn:
            existing = conn.execute(
                "SELECT id FROM enrichments WHERE sub_id = ?", (sub_id,)
            ).fetchone()

            if existing:
                conn.execute(
                    """UPDATE enrichments SET
                       source_type = ?, source_url = ?, detail = ?,
                       time_in_precise = ?, time_out_precise = ?, sub_type = ?,
                       searched_at = datetime('now')
                       WHERE sub_id = ?""",
                    (ai_result.get("Type", "Unknown"),
                     ai_result.get("MainSource", ""),
                     ai_result.get("Notes", ""),
                     ai_result.get("TimeIn", ""),
                     ai_result.get("TimeOut", ""),
                     ai_result.get("Type", ""),
                     sub_id)
                )
            else:
                conn.execute(
                    """INSERT INTO enrichments
                       (sub_id, source_type, source_url, detail, time_in_precise, time_out_precise, sub_type)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (sub_id,
                     ai_result.get("Type", "Unknown"),
                     ai_result.get("MainSource", ""),
                     ai_result.get("Notes", ""),
                     ai_result.get("TimeIn", ""),
                     ai_result.get("TimeOut", ""),
                     ai_result.get("Type", ""))
                )

            conn.execute(
                """UPDATE subsidiaries SET enriched = 1, type = ?,
                   source = ? WHERE id = ?""",
                (ai_result.get("Type", ""), ai_result.get("MainSource", ""), sub_id)
            )
        invalidate_stats_cache()
    except Exception as e:
        print(f"DB save error: {e}")

    yield {
        "step": 3, "title": "Complete",
        "detail": f"Type: {ai_result.get('Type', 'Unknown')}",
        "status": "done", "final_result": ai_result,
    }


async def _search_edgar_safe(cik: str, sub_name: str):
    """Search EDGAR with error handling."""
    try:
        results = await search_8k_filings(cik, sub_name)
        detail = f"Found {len(results)} 8-K filings"
        return results, detail
    except Exception as e:
        return [], f"EDGAR search failed: {str(e)[:100]}"


async def _search_wiki_safe(company_name: str, sub_name: str):
    """Search Wikipedia with error handling + fetch extracts for top results."""
    try:
        results = await search_wikipedia(company_name, sub_name)

        # Fetch extracts for top 3 results concurrently
        if results:
            extract_tasks = [
                get_article_extract(r["title"])
                for r in results[:3]
            ]
            extracts = await asyncio.gather(*extract_tasks, return_exceptions=True)
            for i, extract in enumerate(extracts):
                if isinstance(extract, str) and extract:
                    results[i]["extract"] = extract[:600]

        detail = f"Found {len(results)} relevant Wikipedia articles"
        return results, detail
    except Exception as e:
        return [], f"Wikipedia search failed: {str(e)[:100]}"
