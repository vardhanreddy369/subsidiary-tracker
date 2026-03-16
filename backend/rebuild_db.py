"""Rebuild SQLite database from compressed CSV exports (for deployment)."""

import csv
import gzip
from backend.config import DB_PATH, DATA_DIR
from backend.database import init_db, get_db


def rebuild():
    """Rebuild the database from CSV.gz files in data/."""
    if DB_PATH.exists():
        print(f"Database already exists at {DB_PATH}, skipping rebuild.")
        return

    print("Rebuilding database from CSV exports...")
    init_db()

    with get_db() as conn:
        # Load companies
        with gzip.open(DATA_DIR / "companies.csv.gz", "rt") as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            conn.executemany(
                "INSERT INTO companies (cik, company_name, num_subsidiaries, num_filings, first_filing, last_filing) VALUES (?, ?, ?, ?, ?, ?)",
                [(r["cik"], r["company_name"], int(r["num_subsidiaries"]), int(r["num_filings"]), r["first_filing"], r["last_filing"]) for r in rows]
            )
            print(f"  Loaded {len(rows):,} companies")

        # Load subsidiaries
        with gzip.open(DATA_DIR / "subsidiaries.csv.gz", "rt") as f:
            reader = csv.DictReader(f)
            batch = []
            count = 0
            for r in reader:
                batch.append((
                    r["cik"], r["sub_name"], r["first_seen"], r["last_seen"],
                    r["time_in"], r["time_out"], r["confidence"],
                    r.get("source", "SEC Exhibit 21 filing comparison"),
                    r.get("type", ""),
                    int(r.get("enriched", 0))
                ))
                if len(batch) >= 10000:
                    conn.executemany(
                        "INSERT INTO subsidiaries (cik, sub_name, first_seen, last_seen, time_in, time_out, confidence, source, type, enriched) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        batch
                    )
                    count += len(batch)
                    batch = []
            if batch:
                conn.executemany(
                    "INSERT INTO subsidiaries (cik, sub_name, first_seen, last_seen, time_in, time_out, confidence, source, type, enriched) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    batch
                )
                count += len(batch)
            print(f"  Loaded {count:,} subsidiaries")

        # Load filing_dates
        with gzip.open(DATA_DIR / "filing_dates.csv.gz", "rt") as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            conn.executemany(
                "INSERT OR IGNORE INTO filing_dates (cik, fdate) VALUES (?, ?)",
                [(r["cik"], r["fdate"]) for r in rows]
            )
            print(f"  Loaded {len(rows):,} filing dates")

        conn.commit()

        # Ensure indexes exist after bulk load (faster than creating before insert)
        print("  Creating indexes...")
        conn.executescript("""
            CREATE INDEX IF NOT EXISTS idx_subs_cik ON subsidiaries(cik);
            CREATE INDEX IF NOT EXISTS idx_subs_name ON subsidiaries(sub_name);
            CREATE INDEX IF NOT EXISTS idx_subs_confidence ON subsidiaries(confidence);
            CREATE INDEX IF NOT EXISTS idx_subs_timeout ON subsidiaries(time_out);
            CREATE INDEX IF NOT EXISTS idx_subs_enriched ON subsidiaries(enriched);
            CREATE INDEX IF NOT EXISTS idx_subs_first_seen ON subsidiaries(first_seen);
            CREATE INDEX IF NOT EXISTS idx_subs_last_seen ON subsidiaries(last_seen);
            CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(company_name);
        """)
        print("  Indexes created.")

        # Run ANALYZE so SQLite query planner has up-to-date statistics
        conn.execute("ANALYZE")

    print("Database rebuild complete!")


if __name__ == "__main__":
    rebuild()
