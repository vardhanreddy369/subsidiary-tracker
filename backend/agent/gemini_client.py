"""Google Gemini free-tier client for AI reasoning about subsidiary dates."""

import json
import os
import asyncio

GEMINI_PROMPT = """You are an expert financial analyst specializing in corporate subsidiary relationships, M&A transactions, and SEC filing analysis.

You are given:
- A parent company and subsidiary name
- An algorithmic estimate of when the subsidiary appeared/disappeared in SEC Exhibit 21 filings
- SEC EDGAR 8-K filing results (which report material events like acquisitions, divestitures)
- Wikipedia research results about the companies

## Your Task

Determine the PRECISE timeline and nature of this subsidiary relationship.

## Analysis Steps

1. **Cross-reference 8-K filing dates** with the algorithmic TimeIn/TimeOut window. An 8-K filed within or near the TimeIn range likely announces the acquisition or creation. An 8-K near TimeOut likely announces divestiture.
2. **Examine Wikipedia snippets** for keywords: "acquired", "purchased", "merged", "divested", "spun off", "dissolved", "renamed", "incorporated", "joint venture". Extract specific dates, deal values, and transaction partners mentioned.
3. **Validate consistency**: If EDGAR says 8-K on 2019-03-15 and Wikipedia says "acquired in March 2019", that's HIGH confidence. If sources conflict, note the discrepancy and go with the SEC filing date.
4. **Determine formation type**: Most subsidiaries are Internal Creations (registered by the parent). External Acquisitions are noteworthy — look for deal announcements. Restructurings involve name changes or legal entity consolidation.

## Output Format

Return ONLY valid JSON (no markdown, no explanation outside JSON):

{
    "TimeIn": "YYYY-MM-DD or YYYY-MM or YYYY (deal close date for acquisitions, incorporation date for creations, or best estimate)",
    "TimeOut": "YYYY-MM-DD or 'Active (as of YYYY-MM-DD)' or 'N/A'",
    "Type": "Internal Creation | External Acquisition | Restructuring | Joint Venture | Spin-off",
    "MainSource": "Specific citation: SEC filing ref, Wikipedia article, or press release with date",
    "Confidence": "HIGH | MEDIUM | LOW",
    "Notes": "2-3 sentence explanation of reasoning with specific source references"
}

## Important Rules
- For TimeIn: Use deal CLOSE date for acquisitions (not announcement). If only a range is available from Exhibit 21, keep the range.
- For TimeOut: Use "Active (as of [latest filing date])" if the subsidiary still appears in the most recent filing.
- Prefer SEC filing dates over Wikipedia dates when they conflict.
- If no external evidence improves on the algorithmic estimate, return the algorithmic values with Confidence matching the original.
- Do NOT fabricate dates or sources. If uncertain, say so in Notes and use LOW confidence."""


async def reason_with_gemini(parent_company: str, subsidiary: str,
                              algorithmic_estimate: dict,
                              edgar_results: list,
                              wiki_results: list,
                              retry_count: int = 2):
    """Use Gemini to reason about search results and extract precise dates."""
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        return _fallback_reasoning(algorithmic_estimate, edgar_results, wiki_results)

    # Build a focused user prompt
    edgar_summary = "No 8-K filings found."
    if edgar_results:
        edgar_lines = []
        for r in edgar_results[:8]:
            line = f"- {r.get('form', '8-K')} filed {r.get('date', 'unknown')}"
            if r.get('accession'):
                line += f" (Accession: {r['accession']})"
            if r.get('url'):
                line += f" — {r['url']}"
            edgar_lines.append(line)
        edgar_summary = "\n".join(edgar_lines)

    wiki_summary = "No Wikipedia results found."
    if wiki_results:
        wiki_lines = []
        for r in wiki_results[:4]:
            line = f"- \"{r.get('title', '')}\" — {r.get('snippet', '')[:300]}"
            if r.get('extract'):
                line += f"\n  Extract: {r['extract'][:400]}"
            if r.get('url'):
                line += f"\n  URL: {r['url']}"
            wiki_lines.append(line)
        wiki_summary = "\n".join(wiki_lines)

    user_prompt = f"""Parent Company: {parent_company}
Subsidiary: {subsidiary}

Algorithmic Estimate (from SEC Exhibit 21 filing date comparison):
- TimeIn: {algorithmic_estimate.get('time_in', 'Unknown')}
- TimeOut: {algorithmic_estimate.get('time_out', 'Unknown')}
- Confidence: {algorithmic_estimate.get('confidence', 'Unknown')}

SEC EDGAR 8-K Filings for this company:
{edgar_summary}

Wikipedia Research:
{wiki_summary}

Analyze these sources and return the JSON result."""

    last_error = None
    for attempt in range(retry_count + 1):
        try:
            import aiohttp
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
            payload = {
                "contents": [{"parts": [{"text": GEMINI_PROMPT + "\n\n" + user_prompt}]}],
                "generationConfig": {
                    "temperature": 0.1,
                    "maxOutputTokens": 1024,
                }
            }

            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload,
                                        timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    if resp.status != 200:
                        last_error = f"HTTP {resp.status}: {await resp.text()}"
                        if attempt < retry_count:
                            await asyncio.sleep(1.5 * (attempt + 1))
                            continue
                        break

                    data = await resp.json()

            # Extract text from response
            text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
            result = _parse_json_response(text)
            if result and _validate_result(result):
                return result

            last_error = "Invalid JSON structure in response"

        except Exception as e:
            last_error = str(e)
            if attempt < retry_count:
                await asyncio.sleep(1.5 * (attempt + 1))
                continue

    print(f"Gemini failed after {retry_count + 1} attempts: {last_error}")
    return _fallback_reasoning(algorithmic_estimate, edgar_results, wiki_results,
                               parent_company, subsidiary)


def _parse_json_response(text: str) -> dict:
    """Extract JSON from Gemini response, handling various formats."""
    # Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try extracting from markdown code block
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0].strip()
    elif "```" in text:
        text = text.split("```")[1].split("```")[0].strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try finding JSON object in the text
    start = text.find("{")
    end = text.rfind("}") + 1
    if start >= 0 and end > start:
        try:
            return json.loads(text[start:end])
        except json.JSONDecodeError:
            pass

    return None


def _validate_result(result: dict) -> bool:
    """Validate that the AI result has all required fields with reasonable values."""
    required_keys = ["TimeIn", "TimeOut", "Type", "MainSource", "Confidence", "Notes"]
    if not all(k in result for k in required_keys):
        return False

    # Confidence must be valid
    if result["Confidence"] not in ("HIGH", "MEDIUM", "LOW"):
        result["Confidence"] = "MEDIUM"

    # Type must be valid
    valid_types = ["Internal Creation", "External Acquisition", "Restructuring",
                   "Joint Venture", "Spin-off", "Unknown"]
    if result["Type"] not in valid_types:
        # Try fuzzy match
        type_lower = result["Type"].lower()
        if "acqui" in type_lower or "bought" in type_lower or "purchase" in type_lower:
            result["Type"] = "External Acquisition"
        elif "internal" in type_lower or "creat" in type_lower or "incorp" in type_lower:
            result["Type"] = "Internal Creation"
        elif "restructur" in type_lower or "reorg" in type_lower or "rename" in type_lower:
            result["Type"] = "Restructuring"
        elif "joint" in type_lower or "jv" in type_lower:
            result["Type"] = "Joint Venture"
        elif "spin" in type_lower:
            result["Type"] = "Spin-off"
        else:
            result["Type"] = "Unknown"

    return True


def _fallback_reasoning(algorithmic_estimate, edgar_results, wiki_results,
                        parent_company="", subsidiary=""):
    """Fallback when Gemini is unavailable — use heuristic reasoning."""
    result = {
        "TimeIn": algorithmic_estimate.get("time_in", "Unknown"),
        "TimeOut": algorithmic_estimate.get("time_out", "Unknown"),
        "Type": "Unknown",
        "MainSource": "SEC Exhibit 21 filing comparison",
        "Confidence": algorithmic_estimate.get("confidence", "LOW"),
        "Notes": "Determined algorithmically from Exhibit 21 filing dates.",
    }

    # Try to improve with EDGAR 8-K data
    if edgar_results:
        earliest_8k = min(edgar_results, key=lambda x: x.get("date", "9999"))
        result["MainSource"] = f"SEC EDGAR ({earliest_8k.get('form', '8-K')} filing, {earliest_8k.get('date', '')})"
        if earliest_8k.get("url"):
            result["MainSource"] += f" - {earliest_8k['url']}"

    # Check Wikipedia for acquisition keywords
    wiki_matched = False
    if wiki_results:
        for wiki in wiki_results:
            snippet = (wiki.get("snippet", "") + " " + wiki.get("extract", "")).lower()
            if any(kw in snippet for kw in ["acquired", "acquisition", "bought", "purchased", "merger", "takeover"]):
                result["Type"] = "External Acquisition"
                result["MainSource"] = wiki.get("url", result["MainSource"])
                result["Notes"] = f"Wikipedia suggests acquisition. {wiki.get('snippet', '')[:200]}"
                wiki_matched = True
                break
            elif any(kw in snippet for kw in ["restructur", "reorganiz", "renamed", "rebrand", "converted", "successor"]):
                result["Type"] = "Restructuring"
                result["Notes"] = f"Wikipedia suggests restructuring. {wiki.get('snippet', '')[:200]}"
                wiki_matched = True
                break
            elif any(kw in snippet for kw in ["joint venture", "partnership", "jointly owned"]):
                result["Type"] = "Joint Venture"
                result["Notes"] = f"Wikipedia suggests joint venture. {wiki.get('snippet', '')[:200]}"
                wiki_matched = True
                break
            elif any(kw in snippet for kw in ["spun off", "spin-off", "spinoff", "spun out"]):
                result["Type"] = "Spin-off"
                result["Notes"] = f"Wikipedia suggests spin-off. {wiki.get('snippet', '')[:200]}"
                wiki_matched = True
                break
            elif any(kw in snippet for kw in ["founded", "incorporated", "established", "registered", "subsidiary of"]):
                result["Type"] = "Internal Creation"
                result["Notes"] = f"Wikipedia suggests internal creation. {wiki.get('snippet', '')[:200]}"
                wiki_matched = True
                break

    # If Wikipedia didn't match, infer type from subsidiary name patterns
    if not wiki_matched:
        result["Type"] = _infer_type_from_name(subsidiary, parent_company)
        if result["Type"] != "Unknown":
            result["Notes"] += f" Type inferred from entity naming pattern."

    return result


def _infer_type_from_name(subsidiary: str, parent_company: str,
                          first_seen: str = "", first_filing: str = "",
                          batch_size: int = 0) -> str:
    """Infer subsidiary type from naming patterns + filing signals.

    Key design principles:
    - Entity suffixes (LLC, Inc, Ltd, LP, etc.) are legal form indicators and
      carry NO signal about whether a sub was acquired vs created internally.
    - If a sub contains the parent's core name, it's almost always Internal
      Creation (e.g., "Apple Sales International" under Apple). Only classify
      as Restructuring when the sub is purely a holding/group wrapper with no
      functional description.
    - If a sub's meaningful words share ZERO overlap with the parent (after
      stripping entity suffixes and filler), that's a strong acquisition signal.
    - Filing pattern signals: present from first filing = likely original/internal,
      appeared later in a large batch = likely acquisition/restructuring.
    """
    sub = subsidiary.lower().strip()
    parent = parent_company.lower().strip()

    # --- Filler and entity suffixes (carry no type signal) ---
    entity_suffixes = {"inc", "inc.", "corp", "corp.", "corporation", "llc",
                       "l.l.c.", "l.l.c", "ltd", "ltd.", "limited", "co",
                       "co.", "company", "plc", "lp", "l.p.", "s.a.", "sa",
                       "ag", "gmbh", "b.v.", "bv", "s.r.l.", "srl", "n.v.",
                       "nv", "pty", "pte"}
    filler = {"the", "de", "and", "&", "of", "a", "an", "la", "el", "las",
              "los", "del", "des", "le", "du"}
    # Combined set for stripping words from names before comparison
    noise_words = entity_suffixes | filler

    def _meaningful_words(name: str) -> list:
        """Extract words that carry semantic meaning (not entity suffixes or filler)."""
        return [w.strip(".,()") for w in name.split()
                if w.strip(".,()") not in noise_words and len(w.strip(".,()")) > 1]

    parent_words = _meaningful_words(parent)
    sub_words = _meaningful_words(sub)

    parent_core = parent_words[0] if parent_words else ""
    # Also try first 4+ chars for partial matching (e.g., "citi" from "citigroup")
    parent_stem = parent_core[:4] if len(parent_core) >= 4 else parent_core

    def _sub_contains_parent():
        """Check if subsidiary name relates to parent company."""
        if not parent_core or len(parent_core) < 3:
            return False
        return parent_core in sub or (len(parent_stem) >= 4 and parent_stem in sub)

    def _word_overlap() -> set:
        """Return the set of meaningful words shared between sub and parent."""
        parent_set = set(parent_words)
        return {w for w in sub_words if w in parent_set or
                any(w in pw or pw in w for pw in parent_set if len(pw) >= 4)}

    # Joint Venture indicators
    jv_keywords = ["joint venture", " jv ", " jv,", "partnership", "partners"]
    if any(kw in sub for kw in jv_keywords):
        return "Joint Venture"

    # If subsidiary contains parent name/stem → Internal Creation
    # (Parent-branded entities: "Apple Sales International", "Goldman Sachs International")
    if _sub_contains_parent():
        # Only Restructuring if it's a pure holding/group wrapper — i.e., the sub
        # is JUST parent name + a structural word with no functional description.
        # e.g., "Apple Holdings LLC" or "Goldman Sachs Group Inc" → Restructuring
        # but "Apple Sales International" or "Goldman Sachs International" → Internal Creation
        structural_words = {"holdings", "group"}
        sub_non_parent = [w for w in sub_words if w not in set(parent_words)
                          and not any(w in pw or pw in w for pw in parent_words if len(pw) >= 4)]
        # Restructuring if any non-parent word is a structural term (holdings, group)
        # e.g., "Apple Holdings International", "Citigroup Global Markets Holdings"
        if any(w in structural_words for w in sub_non_parent):
            return "Restructuring"
        # If sub is identical to parent (no extra words) and contains structural words
        if not sub_non_parent and any(w in structural_words for w in sub_words):
            return "Restructuring"
        return "Internal Creation"

    # --- Sub does NOT contain parent name — evaluate acquisition vs internal ---

    # Functional/descriptive keywords that suggest the parent created a purpose-built entity
    # (these are BUSINESS FUNCTIONS, not entity form suffixes)
    functional_keywords = ["funding", "finance co", "holding", "properties",
                           "realty", "real estate", "insurance", "leasing",
                           "trust", "limited partnership", "national association"]
    has_functional = any(kw in sub for kw in functional_keywords)

    # Geographic subsidiaries are typically internal
    geo_keywords = ["america", "europe", "asia", "pacific", "canada", "uk",
                    "japan", "china", "india", "brazil", "mexico", "australia",
                    "north", "south", "east", "west", "international", "global",
                    "usa", "u.s.", "de ", " de,", "latin", "middle east", "africa"]
    is_geo = any(kw in sub for kw in geo_keywords)

    if has_functional and is_geo:
        return "Internal Creation"

    # Word overlap test: if zero meaningful words overlap → strong acquisition signal
    overlap = _word_overlap()
    if parent_core and len(parent_core) >= 3:
        if not overlap:
            # No name overlap at all — even functional keywords shouldn't override this
            # unless it's a clearly generic purpose-built entity (trust, funding vehicle)
            generic_creation = ["trust", "funding", "limited partnership",
                                "national association"]
            if any(kw in sub for kw in generic_creation):
                return "Internal Creation"

            # Filing pattern: if present from company's very first filing,
            # it's likely an original subsidiary, not an acquisition
            if first_seen and first_filing and first_seen <= first_filing:
                return "Internal Creation"

            # Filing pattern: solo additions (batch_size=1) are more likely
            # organic internal creations than acquisitions
            if batch_size == 1:
                return "Internal Creation"

            return "External Acquisition"
        else:
            # Some overlap — likely internal
            return "Internal Creation"

    # Filing pattern fallback for short/missing parent names
    if first_seen and first_filing and first_seen <= first_filing:
        return "Internal Creation"
    if batch_size and batch_size >= 20:
        return "External Acquisition"

    # Default: most subsidiaries in SEC filings are internal creations
    return "Internal Creation"
