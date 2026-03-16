"""Load SAS dataset, compute algorithmic TimeIn/TimeOut, store in SQLite."""

import pandas as pd
import pyreadstat
from backend.config import SAS_FILE, DB_PATH, DATA_DIR
from backend.database import init_db, get_db


def load_sas_data():
    """Load and decode the SAS dataset."""
    print(f"Reading {SAS_FILE}...")
    try:
        df, meta = pyreadstat.read_sas7bdat(str(SAS_FILE), encoding='latin-1')
    except Exception:
        df = pd.read_sas(str(SAS_FILE), format='sas7bdat', encoding='latin-1')
    print(f"Loaded {len(df):,} rows, columns: {list(df.columns)}")

    # Decode byte columns
    for col in ['CIK', 'COMP_NAME', 'SUB_NAME']:
        if col in df.columns and df[col].dtype == object:
            df[col] = df[col].apply(
                lambda x: x.decode('utf-8', errors='ignore').strip()
                if isinstance(x, bytes) else str(x).strip()
            )

    # Ensure FDATE is datetime
    if 'FDATE' in df.columns:
        df['FDATE'] = pd.to_datetime(df['FDATE'], errors='coerce')

    # Drop rows with missing critical data
    df = df.dropna(subset=['CIK', 'FDATE', 'SUB_NAME'])

    # Normalize names for better matching
    df['SUB_NAME_NORM'] = df['SUB_NAME'].str.lower().str.strip()

    print(f"After cleaning: {len(df):,} rows")
    return df


def compute_timelines(df):
    """Compute TimeIn/TimeOut for each subsidiary based on filing date comparisons."""
    print("Computing timelines...")

    # Get all filing dates per CIK
    cik_filings = df.groupby('CIK')['FDATE'].apply(
        lambda x: sorted(x.unique())
    ).to_dict()

    # Get first/last seen for each subsidiary per CIK
    sub_groups = df.groupby(['CIK', 'SUB_NAME_NORM']).agg(
        sub_name_display=('SUB_NAME', 'first'),
        first_seen=('FDATE', 'min'),
        last_seen=('FDATE', 'max'),
    ).reset_index()

    results = []
    for _, row in sub_groups.iterrows():
        cik = row['CIK']
        filings = cik_filings[cik]
        first_seen = row['first_seen']
        last_seen = row['last_seen']

        earliest_filing = filings[0]
        latest_filing = filings[-1]

        # Compute TimeIn
        if first_seen <= earliest_filing:
            time_in = f"On or before {pd.Timestamp(earliest_filing).strftime('%Y-%m-%d')}"
            confidence_in = "LOW"
        else:
            # Find the filing just before first_seen
            prev_filing = None
            for f in filings:
                if f < first_seen:
                    prev_filing = f
                else:
                    break
            if prev_filing is not None:
                time_in = f"Between {pd.Timestamp(prev_filing).strftime('%Y-%m-%d')} and {pd.Timestamp(first_seen).strftime('%Y-%m-%d')}"
                confidence_in = "HIGH"
            else:
                time_in = f"On or before {pd.Timestamp(first_seen).strftime('%Y-%m-%d')}"
                confidence_in = "LOW"

        # Compute TimeOut
        if last_seen >= latest_filing:
            time_out = f"Active as of {pd.Timestamp(latest_filing).strftime('%Y-%m-%d')}"
            confidence_out = "ACTIVE"
        else:
            # Find the filing just after last_seen
            next_filing = None
            for f in filings:
                if f > last_seen:
                    next_filing = f
                    break
            if next_filing is not None:
                time_out = f"Between {pd.Timestamp(last_seen).strftime('%Y-%m-%d')} and {pd.Timestamp(next_filing).strftime('%Y-%m-%d')}"
                confidence_out = "HIGH"
            else:
                time_out = f"After {pd.Timestamp(last_seen).strftime('%Y-%m-%d')}"
                confidence_out = "LOW"

        # Overall confidence
        # Entity suffix → real registered entity → HIGH confidence
        _ENTITY_SUFFIXES = (
            ' LLC', ' L.L.C.', ' Inc', ' Inc.', ' Incorporated',
            ' Corp', ' Corp.', ' Corporation', ' Ltd', ' Ltd.',
            ' Limited', ' PLC', ' P.L.C.', ' GmbH', ' AG', ' SA',
            ' S.A.', ' BV', ' B.V.', ' NV', ' N.V.', ' KG',
            ' SAS', ' S.A.S.', ' SARL', ' S.A.R.L.', ' Pty',
            ' LP', ' L.P.', ' LLP', ' L.L.P.', ' NA', ' N.A.',
            ' Co.', ' SE', ' AB', ' AS', ' A/S', ' Sdn Bhd',
            ' K.K.', ' SpA', ' S.p.A.',
        )
        name = row['sub_name_display']
        has_suffix = any(name.endswith(s) or name.upper().endswith(s.upper()) for s in _ENTITY_SUFFIXES)

        if has_suffix:
            confidence = "HIGH"
        elif confidence_in == "HIGH" and confidence_out in ("HIGH", "ACTIVE"):
            confidence = "HIGH"
        elif confidence_in == "LOW" and confidence_out == "LOW":
            confidence = "LOW"
        else:
            confidence = "MEDIUM"

        results.append({
            'cik': cik,
            'sub_name': row['sub_name_display'],
            'first_seen': pd.Timestamp(first_seen).strftime('%Y-%m-%d'),
            'last_seen': pd.Timestamp(last_seen).strftime('%Y-%m-%d'),
            'time_in': time_in,
            'time_out': time_out,
            'confidence': confidence,
        })

    print(f"Computed timelines for {len(results):,} unique subsidiaries")
    return results, cik_filings


def store_in_database(df, results, cik_filings):
    """Store computed data in SQLite."""
    from collections import Counter
    print("Storing in database...")
    init_db()

    # Pre-compute sub counts per CIK
    sub_counts = Counter(r['cik'] for r in results)

    with get_db() as conn:
        # Clear existing data (order matters for foreign keys)
        conn.execute("DELETE FROM alerts")
        conn.execute("DELETE FROM watchlist")
        conn.execute("DELETE FROM enrichments")
        conn.execute("DELETE FROM subsidiaries")
        conn.execute("DELETE FROM filing_dates")
        conn.execute("DELETE FROM companies")

        # Insert companies using batch
        company_info = df.groupby('CIK').agg(
            company_name=('COMP_NAME', 'first'),
            num_filings=('FDATE', 'nunique'),
            first_filing=('FDATE', 'min'),
            last_filing=('FDATE', 'max'),
        ).reset_index()

        print(f"  Inserting {len(company_info):,} companies...")
        company_rows = [
            (row['CIK'], row['company_name'],
             int(row['num_filings']),
             pd.Timestamp(row['first_filing']).strftime('%Y-%m-%d'),
             pd.Timestamp(row['last_filing']).strftime('%Y-%m-%d'),
             sub_counts.get(row['CIK'], 0))
            for _, row in company_info.iterrows()
        ]
        conn.executemany(
            "INSERT INTO companies (cik, company_name, num_filings, first_filing, last_filing, num_subsidiaries) VALUES (?, ?, ?, ?, ?, ?)",
            company_rows
        )

        # Insert filing dates using batch
        print(f"  Inserting filing dates...")
        filing_rows = [
            (cik, pd.Timestamp(d).strftime('%Y-%m-%d'))
            for cik, dates in cik_filings.items()
            for d in dates
        ]
        conn.executemany(
            "INSERT OR IGNORE INTO filing_dates (cik, fdate) VALUES (?, ?)",
            filing_rows
        )

        # Insert subsidiaries using batch
        print(f"  Inserting {len(results):,} subsidiaries...")
        sub_rows = [
            (r['cik'], r['sub_name'], r['first_seen'], r['last_seen'],
             r['time_in'], r['time_out'], r['confidence'])
            for r in results
        ]
        conn.executemany(
            """INSERT OR IGNORE INTO subsidiaries
               (cik, sub_name, first_seen, last_seen, time_in, time_out, confidence)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            sub_rows
        )

    print(f"Database stored at {DB_PATH}")


def run_pipeline(force=False):
    """Run the full data pipeline. Requires --force flag to prevent accidental re-runs."""
    if not force:
        # Check if DB already has data
        if DB_PATH.exists():
            with get_db() as conn:
                count = conn.execute("SELECT COUNT(*) FROM subsidiaries").fetchone()[0]
            if count > 0:
                print(f"WARNING: Database already has {count:,} subsidiaries.")
                confirm = input("This will DELETE all existing data and rebuild. Type 'yes' to confirm: ")
                if confirm.strip().lower() != 'yes':
                    print("Aborted.")
                    return

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    df = load_sas_data()
    results, cik_filings = compute_timelines(df)
    store_in_database(df, results, cik_filings)

    # Print summary stats
    with get_db() as conn:
        companies = conn.execute("SELECT COUNT(*) FROM companies").fetchone()[0]
        subs = conn.execute("SELECT COUNT(*) FROM subsidiaries").fetchone()[0]
        high = conn.execute("SELECT COUNT(*) FROM subsidiaries WHERE confidence='HIGH'").fetchone()[0]
        active = conn.execute("SELECT COUNT(*) FROM subsidiaries WHERE time_out LIKE 'Active%'").fetchone()[0]
        divested = conn.execute("SELECT COUNT(*) FROM subsidiaries WHERE time_out NOT LIKE 'Active%'").fetchone()[0]

    print(f"\n{'='*50}")
    print(f"Pipeline complete!")
    print(f"  Companies:    {companies:,}")
    print(f"  Subsidiaries: {subs:,}")
    print(f"  High confidence: {high:,}")
    print(f"  Still active: {active:,}")
    print(f"  Divested:     {divested:,}")
    print(f"{'='*50}")


if __name__ == "__main__":
    import sys
    run_pipeline(force='--force' in sys.argv)
