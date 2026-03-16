"""Geographic parser — extract country/jurisdiction from subsidiary names."""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple

# ── Country data keyed by ISO-3166-1 alpha-2 ──────────────────────────

COUNTRIES: Dict[str, str] = {
    "US": "United States",
    "GB": "United Kingdom",
    "DE": "Germany",
    "FR": "France",
    "IT": "Italy",
    "NL": "Netherlands",
    "AU": "Australia",
    "JP": "Japan",
    "CA": "Canada",
    "MX": "Mexico",
    "SE": "Sweden",
    "DK": "Denmark",
    "NO": "Norway",
    "FI": "Finland",
    "CH": "Switzerland",
    "AT": "Austria",
    "BE": "Belgium",
    "ES": "Spain",
    "PT": "Portugal",
    "IE": "Ireland",
    "BR": "Brazil",
    "AR": "Argentina",
    "CL": "Chile",
    "CO": "Colombia",
    "IN": "India",
    "CN": "China",
    "HK": "Hong Kong",
    "SG": "Singapore",
    "KR": "South Korea",
    "TW": "Taiwan",
    "TH": "Thailand",
    "MY": "Malaysia",
    "PH": "Philippines",
    "ID": "Indonesia",
    "NZ": "New Zealand",
    "ZA": "South Africa",
    "IL": "Israel",
    "AE": "United Arab Emirates",
    "SA": "Saudi Arabia",
    "RU": "Russia",
    "PL": "Poland",
    "CZ": "Czech Republic",
    "HU": "Hungary",
    "RO": "Romania",
    "TR": "Turkey",
    "LU": "Luxembourg",
    "KY": "Cayman Islands",
    "BM": "Bermuda",
    "VG": "British Virgin Islands",
    "PA": "Panama",
    "PR": "Puerto Rico",
    "BS": "Bahamas",
    "BB": "Barbados",
    "JE": "Jersey",
    "GG": "Guernsey",
    "IM": "Isle of Man",
    "LI": "Liechtenstein",
    "MC": "Monaco",
    "MT": "Malta",
    "CY": "Cyprus",
    "GR": "Greece",
    "NG": "Nigeria",
    "KE": "Kenya",
    "EG": "Egypt",
    "CW": "Curacao",
    "MU": "Mauritius",
    "PE": "Peru",
    "VE": "Venezuela",
    "CR": "Costa Rica",
    "DO": "Dominican Republic",
    "GT": "Guatemala",
    "EC": "Ecuador",
    "UY": "Uruguay",
    "HR": "Croatia",
    "SK": "Slovakia",
    "BG": "Bulgaria",
    "RS": "Serbia",
    "UA": "Ukraine",
    "LT": "Lithuania",
    "LV": "Latvia",
    "EE": "Estonia",
    "SI": "Slovenia",
    "IS": "Iceland",
    "VN": "Vietnam",
    "PK": "Pakistan",
    "BD": "Bangladesh",
    "LK": "Sri Lanka",
    "MM": "Myanmar",
    "KH": "Cambodia",
}

# ── Suffix → country code mapping ─────────────────────────────────────
# Ordered so more specific patterns are tested first.

SUFFIX_PATTERNS: List[Tuple[str, str]] = [
    # Mexico
    (r"\bS\.\s*de\s*R\.L\.\s*de\s*C\.V\.", "MX"),
    (r"\bS\.\s*de\s*R\.L\.", "MX"),
    (r"\bS\.A\.\s*de\s*C\.V\.", "MX"),
    # Japan
    (r"\bK\.K\.\s*$", "JP"),
    (r"\bKabushiki\s+Kaisha\b", "JP"),
    (r"\bYugen\s+Kaisha\b", "JP"),
    (r"\bGodo\s+Kaisha\b", "JP"),
    # Italy
    (r"\bS\.r\.l\.", "IT"),
    (r"\bS\.p\.A\.", "IT"),
    # France (S.A.S. before S.A.)
    (r"\bS\.A\.S\.\s*$", "FR"),
    (r"\bS\.A\.S\.\b", "FR"),
    (r"\bS\.A\.R\.L\.", "FR"),
    (r"\bS\.C\.A\.\b", "FR"),
    (r"\bS\.N\.C\.\b", "FR"),
    # Netherlands
    (r"\bB\.V\.\s*$", "NL"),
    (r"\bB\.V\.\b", "NL"),
    (r"\bN\.V\.\s*$", "NL"),
    (r"\bN\.V\.\b", "NL"),
    # Germany
    (r"\bGmbH\s*&\s*Co\.\s*KG\b", "DE"),
    (r"\bGmbH\b", "DE"),
    (r"\bAktiengesellschaft\b", "DE"),
    (r"\bAG\s*$", "DE"),
    (r"\bKG\b", "DE"),
    (r"\be\.V\.\b", "DE"),
    # Switzerland (AG can be Swiss too — handled by direct name check)
    # Australia
    (r"\bPty\.?\s+Ltd\.?\s*$", "AU"),
    (r"\bPty\.?\s+Limited\s*$", "AU"),
    (r"\bPty\b", "AU"),
    # UK
    (r"\bPLC\s*$", "GB"),
    (r"\bP\.L\.C\.\s*$", "GB"),
    (r"\bLimited\s*$", "GB"),
    (r"\bLtd\.?\s*$", "GB"),
    (r"\bLLP\s*$", "GB"),
    # Denmark
    (r"\bA/S\s*$", "DK"),
    (r"\bApS\s*$", "DK"),
    # Sweden
    (r"\bAB\s*$", "SE"),
    # Norway
    (r"\bASA\s*$", "NO"),
    (r"\bAS\s*$", "NO"),
    # Finland
    (r"\bOy\s*$", "FI"),
    (r"\bOyj\s*$", "FI"),
    # Spain
    (r"\bS\.L\.\s*$", "ES"),
    (r"\bS\.L\.U\.\s*$", "ES"),
    # Portugal
    (r"\bLda\.\s*$", "PT"),
    # Brazil
    (r"\bLtda\.?\s*$", "BR"),
    (r"\bS/A\b", "BR"),
    # South Korea
    (r"\bCo\.,?\s*Ltd\.?\b.*(?:Korea|Seoul)", "KR"),
    # India
    (r"\bPvt\.?\s+Ltd\.?\b", "IN"),
    (r"\bPrivate\s+Limited\b", "IN"),
    # Singapore
    (r"\bPte\.?\s+Ltd\.?\b", "SG"),
    # Hong Kong
    (r"\bCo\.,?\s*Ltd\.?\b.*Hong\s*Kong", "HK"),
    # Ireland
    (r"\bDAC\s*$", "IE"),
    (r"\bULC\s*$", "IE"),
    # Luxembourg
    (r"\bS\.a\.r\.l\.\b", "LU"),
    (r"\bS\.\s*[àa]\s*r\.l\.\b", "LU"),
    # Belgium
    (r"\bSPRL\b", "BE"),
    (r"\bBVBA\b", "BE"),
    # Poland
    (r"\bSp\.\s*z\s*o\.o\.\b", "PL"),
    # Czech Republic
    (r"\bs\.r\.o\.\b", "CZ"),
    (r"\ba\.s\.\s*$", "CZ"),
    # Hungary
    (r"\bKft\.\s*$", "HU"),
    (r"\bZrt\.\s*$", "HU"),
    (r"\bNyrt\.\s*$", "HU"),
    # Turkey
    (r"\bA\.S\.\s*$", "TR"),
    # Romania
    (r"\bS\.R\.L\.\b", "RO"),
    # US (last — most generic)
    (r"\bInc\.?\s*$", "US"),
    (r"\bIncorporated\s*$", "US"),
    (r"\bCorp\.?\s*$", "US"),
    (r"\bCorporation\s*$", "US"),
    (r"\bLLC\s*$", "US"),
    (r"\bL\.L\.C\.\s*$", "US"),
    (r"\bLP\s*$", "US"),
    (r"\bL\.P\.\s*$", "US"),
    (r"\bNA\s*$", "US"),
    (r"\bN\.A\.\s*$", "US"),
    # Canada
    (r"\bULC\b.*(?:Canada|Alberta|Ontario)", "CA"),
]

# Compile patterns once
_COMPILED_SUFFIX: List[Tuple["re.Pattern[str]", str]] = [
    (re.compile(pat, re.IGNORECASE), code) for pat, code in SUFFIX_PATTERNS
]

# ── Direct country-name mentions ──────────────────────────────────────
# Build a lookup from country name / alias → code.

_COUNTRY_ALIASES: Dict[str, str] = {}
for _code, _name in COUNTRIES.items():
    _COUNTRY_ALIASES[_name.lower()] = _code

# Extra aliases
_EXTRA_ALIASES: Dict[str, str] = {
    "u.s.": "US", "usa": "US", "u.s.a.": "US",
    "uk": "GB", "u.k.": "GB", "england": "GB", "scotland": "GB", "wales": "GB",
    "great britain": "GB",
    "holland": "NL",
    "nippon": "JP",
    "prc": "CN", "mainland china": "CN",
    "republic of korea": "KR",
    "uae": "AE",
    "deutschland": "DE",
    "espana": "ES", "españa": "ES",
    "italia": "IT",
    "brasil": "BR",
    "svizzera": "CH", "schweiz": "CH", "suisse": "CH",
    "norge": "NO",
    "sverige": "SE",
    "danmark": "DK",
    "suomi": "FI",
    "osterreich": "AT", "österreich": "AT",
    "belgique": "BE",
    "czech": "CZ",
    "cayman": "KY",
    "bermuda": "BM",
    "british virgin islands": "VG", "bvi": "VG",
    "jersey": "JE",
    "guernsey": "GG",
    "isle of man": "IM",
    "liechtenstein": "LI",
    "curacao": "CW", "curaçao": "CW",
    "mauritius": "MU",
    "bahamas": "BS",
    "barbados": "BB",
    "panama": "PA",
    "puerto rico": "PR",
    "costa rica": "CR",
}
_COUNTRY_ALIASES.update(_EXTRA_ALIASES)

# Sort by length desc so "British Virgin Islands" matches before "Virgin"
_SORTED_ALIASES: List[Tuple[str, str]] = sorted(
    _COUNTRY_ALIASES.items(), key=lambda x: len(x[0]), reverse=True
)

# ── US state / jurisdiction detection ─────────────────────────────────

US_STATES: Dict[str, str] = {
    "alabama": "Alabama", "alaska": "Alaska", "arizona": "Arizona",
    "arkansas": "Arkansas", "california": "California", "colorado": "Colorado",
    "connecticut": "Connecticut", "delaware": "Delaware", "florida": "Florida",
    "georgia": "Georgia", "hawaii": "Hawaii", "idaho": "Idaho",
    "illinois": "Illinois", "indiana": "Indiana", "iowa": "Iowa",
    "kansas": "Kansas", "kentucky": "Kentucky", "louisiana": "Louisiana",
    "maine": "Maine", "maryland": "Maryland", "massachusetts": "Massachusetts",
    "michigan": "Michigan", "minnesota": "Minnesota", "mississippi": "Mississippi",
    "missouri": "Missouri", "montana": "Montana", "nebraska": "Nebraska",
    "nevada": "Nevada", "new hampshire": "New Hampshire", "new jersey": "New Jersey",
    "new mexico": "New Mexico", "new york": "New York", "north carolina": "North Carolina",
    "north dakota": "North Dakota", "ohio": "Ohio", "oklahoma": "Oklahoma",
    "oregon": "Oregon", "pennsylvania": "Pennsylvania", "rhode island": "Rhode Island",
    "south carolina": "South Carolina", "south dakota": "South Dakota",
    "tennessee": "Tennessee", "texas": "Texas", "utah": "Utah",
    "vermont": "Vermont", "virginia": "Virginia", "washington": "Washington",
    "west virginia": "West Virginia", "wisconsin": "Wisconsin", "wyoming": "Wyoming",
    "district of columbia": "District of Columbia",
}


# ── Public API ────────────────────────────────────────────────────────

def parse_geography(sub_name: str) -> Dict[str, str]:
    """Attempt to determine country/jurisdiction from a subsidiary name.

    Returns a dict with keys ``country_code``, ``country_name``, and
    optionally ``jurisdiction``.  Returns an empty dict when no match is
    found.
    """
    if not sub_name:
        return {}

    name = sub_name.strip()

    # 1. Try suffix patterns
    for pat, code in _COMPILED_SUFFIX:
        if pat.search(name):
            result = {
                "country_code": code,
                "country_name": COUNTRIES.get(code, code),
            }
            # Try to detect US jurisdiction
            if code == "US":
                jur = _detect_us_jurisdiction(name)
                if jur:
                    result["jurisdiction"] = jur
            return result

    # 2. Try direct country-name mention
    name_lower = name.lower()
    for alias, code in _SORTED_ALIASES:
        # Word-boundary check to avoid "India" matching "Indiana"
        if re.search(r'\b' + re.escape(alias) + r'\b', name_lower):
            result = {
                "country_code": code,
                "country_name": COUNTRIES.get(code, code),
            }
            if code == "US":
                jur = _detect_us_jurisdiction(name)
                if jur:
                    result["jurisdiction"] = jur
            return result

    return {}


def _detect_us_jurisdiction(name: str) -> Optional[str]:
    """Try to find a US state name in the subsidiary name."""
    name_lower = name.lower()
    for state_lower, state_proper in US_STATES.items():
        if state_lower in name_lower:
            return state_proper
    return None


def batch_parse_geography(conn) -> Dict[int, Dict[str, str]]:  # type: ignore[type-arg]
    """Run ``parse_geography`` on every subsidiary in the database.

    Parameters
    ----------
    conn:
        An open ``sqlite3.Connection`` (with row_factory set).

    Returns
    -------
    dict
        Mapping of subsidiary *id* to ``{country_code, country_name}``
        (only entries where a match was found).
    """
    rows = conn.execute("SELECT id, sub_name FROM subsidiaries").fetchall()
    results = {}  # type: Dict[int, Dict[str, str]]
    for row in rows:
        geo = parse_geography(row["sub_name"])
        if geo:
            results[row["id"]] = geo
    return results
