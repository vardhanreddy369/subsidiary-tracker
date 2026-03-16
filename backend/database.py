import sqlite3
from contextlib import contextmanager
from backend.config import DB_PATH


def get_connection():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def get_db():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS companies (
                cik TEXT PRIMARY KEY,
                company_name TEXT NOT NULL,
                num_filings INTEGER DEFAULT 0,
                first_filing TEXT,
                last_filing TEXT,
                num_subsidiaries INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS filing_dates (
                cik TEXT NOT NULL,
                fdate TEXT NOT NULL,
                PRIMARY KEY (cik, fdate),
                FOREIGN KEY (cik) REFERENCES companies(cik)
            );

            CREATE TABLE IF NOT EXISTS subsidiaries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cik TEXT NOT NULL,
                sub_name TEXT NOT NULL,
                first_seen TEXT NOT NULL,
                last_seen TEXT NOT NULL,
                time_in TEXT,
                time_out TEXT,
                confidence TEXT DEFAULT 'MEDIUM',
                source TEXT DEFAULT 'SEC Exhibit 21 filing comparison',
                type TEXT,
                enriched INTEGER DEFAULT 0,
                FOREIGN KEY (cik) REFERENCES companies(cik),
                UNIQUE(cik, sub_name)
            );

            CREATE TABLE IF NOT EXISTS enrichments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sub_id INTEGER NOT NULL,
                source_type TEXT,
                source_url TEXT,
                detail TEXT,
                time_in_precise TEXT,
                time_out_precise TEXT,
                sub_type TEXT,
                searched_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (sub_id) REFERENCES subsidiaries(id)
            );

            CREATE INDEX IF NOT EXISTS idx_subs_cik ON subsidiaries(cik);
            CREATE INDEX IF NOT EXISTS idx_subs_name ON subsidiaries(sub_name);
            CREATE INDEX IF NOT EXISTS idx_enrichments_sub ON enrichments(sub_id);

            CREATE INDEX IF NOT EXISTS idx_subs_confidence ON subsidiaries(confidence);
            CREATE INDEX IF NOT EXISTS idx_subs_timeout ON subsidiaries(time_out);
            CREATE INDEX IF NOT EXISTS idx_subs_enriched ON subsidiaries(enriched);
            CREATE INDEX IF NOT EXISTS idx_subs_first_seen ON subsidiaries(first_seen);
            CREATE INDEX IF NOT EXISTS idx_subs_last_seen ON subsidiaries(last_seen);
            CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(company_name);
            CREATE INDEX IF NOT EXISTS idx_enrichments_searched_at ON enrichments(searched_at);

            -- Auth tables
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                display_name TEXT,
                plan TEXT DEFAULT 'free',
                api_key TEXT UNIQUE,
                stripe_customer_id TEXT,
                stripe_subscription_id TEXT,
                is_admin INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now')),
                last_login TEXT,
                is_active INTEGER DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS usage_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                endpoint TEXT NOT NULL,
                method TEXT DEFAULT 'GET',
                timestamp TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS watchlist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                cik TEXT NOT NULL,
                added_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (cik) REFERENCES companies(cik),
                UNIQUE(user_id, cik)
            );

            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                cik TEXT NOT NULL,
                alert_type TEXT,
                detail TEXT,
                read INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS scrape_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                status TEXT DEFAULT 'pending',
                total_ciks INTEGER DEFAULT 0,
                processed_ciks INTEGER DEFAULT 0,
                total_filings INTEGER DEFAULT 0,
                processed_filings INTEGER DEFAULT 0,
                subsidiaries_found INTEGER DEFAULT 0,
                started_at TEXT,
                completed_at TEXT,
                error_log TEXT
            );

            CREATE TABLE IF NOT EXISTS raw_exhibit21 (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cik TEXT NOT NULL,
                accession_number TEXT NOT NULL,
                filing_date TEXT NOT NULL,
                document_url TEXT,
                raw_text TEXT,
                parsed_subsidiaries TEXT,
                parse_method TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                UNIQUE(cik, accession_number)
            );

            CREATE TABLE IF NOT EXISTS bulk_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_type TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                total_items INTEGER DEFAULT 0,
                processed_items INTEGER DEFAULT 0,
                success_count INTEGER DEFAULT 0,
                error_count INTEGER DEFAULT 0,
                started_at TEXT,
                completed_at TEXT,
                params TEXT,
                error_log TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
            CREATE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key);
            CREATE INDEX IF NOT EXISTS idx_usage_user_ts ON usage_log(user_id, timestamp);
            CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id);
            CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id);
            CREATE INDEX IF NOT EXISTS idx_raw_ex21_cik ON raw_exhibit21(cik);
        """)
