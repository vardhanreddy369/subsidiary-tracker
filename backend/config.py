import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# Load .env file if it exists (keeps secrets out of command line)
_env_file = BASE_DIR / ".env"
if _env_file.exists():
    with open(_env_file) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _key, _, _val = _line.partition("=")
                os.environ.setdefault(_key.strip(), _val.strip())
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "tracker.db"

SAS_FILE = DATA_DIR / "subs_all_latest.sas7bdat"

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# Auth
JWT_SECRET = os.environ.get("JWT_SECRET", "")
if not JWT_SECRET:
    import secrets as _secrets
    JWT_SECRET = _secrets.token_urlsafe(32)
    import logging as _log
    _log.getLogger(__name__).warning(
        "JWT_SECRET not set — using random secret (tokens won't survive restarts). "
        "Set JWT_SECRET env var in production."
    )
JWT_EXPIRY_HOURS = 72

# Rate limits (requests per day)
RATE_LIMITS = {
    "free": 10,
    "pro": 1000,
    "enterprise": 0,  # 0 = unlimited
}

# Stripe
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRICE_PRO = os.environ.get("STRIPE_PRICE_PRO", "")
STRIPE_PRICE_ENTERPRISE = os.environ.get("STRIPE_PRICE_ENTERPRISE", "")
APP_URL = os.environ.get("APP_URL", "http://localhost:8000")

# SEC EDGAR requires a User-Agent with contact info
EDGAR_USER_AGENT = "SubsidiaryTracker/1.0 (sri.vardhan@ucf.edu)"
EDGAR_BASE_URL = "https://data.sec.gov"
EDGAR_SEARCH_URL = "https://efts.sec.gov/LATEST/search-index"

WIKIPEDIA_API_URL = "https://en.wikipedia.org/w/api.php"
