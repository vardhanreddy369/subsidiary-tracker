"""Tests for data pipeline: gap-filling, timeline computation, confidence scoring."""

import pandas as pd
import pytest
from backend.data_loader import fill_subsidiary_gaps, compute_timelines


# ── Gap-Fill Logic ────────────────────────────────────────────

class TestGapFill:
    def _make_df(self, rows):
        """Helper: create a DataFrame from (cik, fdate, comp, sub) tuples."""
        df = pd.DataFrame(rows, columns=["CIK", "FDATE", "COMP_NAME", "SUB_NAME"])
        df["FDATE"] = pd.to_datetime(df["FDATE"])
        df["SUB_NAME_NORM"] = df["SUB_NAME"].str.lower().str.strip()
        return df

    def test_fills_single_year_gap(self):
        """Sub exists in 2019 and 2021 but not 2020 → should be filled."""
        df = self._make_df([
            ("CIK1", "2019-03-15", "Parent Co", "Child LLC"),
            ("CIK1", "2020-03-15", "Parent Co", "Other Sub"),  # company files in 2020
            ("CIK1", "2021-03-15", "Parent Co", "Child LLC"),
        ])
        result = fill_subsidiary_gaps(df)
        child_rows = result[result["SUB_NAME_NORM"] == "child llc"]
        years = set(pd.to_datetime(child_rows["FDATE"]).dt.year)
        assert 2020 in years, "Gap year 2020 should be filled"

    def test_no_fill_when_no_gap(self):
        """Sub exists every year → no synthetic records."""
        df = self._make_df([
            ("CIK1", "2019-03-15", "Parent Co", "Child LLC"),
            ("CIK1", "2020-03-15", "Parent Co", "Child LLC"),
            ("CIK1", "2021-03-15", "Parent Co", "Child LLC"),
        ])
        original_len = len(df)
        result = fill_subsidiary_gaps(df)
        assert len(result) == original_len

    def test_no_fill_when_sub_genuinely_absent(self):
        """Sub exists in 2019, disappears 2020-2021, returns 2022 → 2-year gap, no fill."""
        df = self._make_df([
            ("CIK1", "2019-03-15", "Parent Co", "Child LLC"),
            ("CIK1", "2020-03-15", "Parent Co", "Other Sub"),
            ("CIK1", "2021-03-15", "Parent Co", "Other Sub"),
            ("CIK1", "2022-03-15", "Parent Co", "Child LLC"),
        ])
        result = fill_subsidiary_gaps(df)
        child_rows = result[result["SUB_NAME_NORM"] == "child llc"]
        years = set(pd.to_datetime(child_rows["FDATE"]).dt.year)
        # Only Y-1 and Y+1 rule: 2020 has child in 2019 but NOT 2021 → no fill
        # 2021 has child in 2022 but NOT 2020 → no fill
        assert 2020 not in years
        assert 2021 not in years

    def test_fills_multiple_companies_independently(self):
        """Gap-fill works correctly across different CIKs."""
        df = self._make_df([
            ("CIK1", "2019-03-15", "Alpha Co", "Sub A"),
            ("CIK1", "2020-03-15", "Alpha Co", "Other"),
            ("CIK1", "2021-03-15", "Alpha Co", "Sub A"),
            ("CIK2", "2019-03-15", "Beta Co", "Sub B"),
            ("CIK2", "2021-03-15", "Beta Co", "Sub B"),
            # CIK2 has no filing in 2020, so no gap to fill (company didn't file)
        ])
        result = fill_subsidiary_gaps(df)
        # CIK1's Sub A should be filled for 2020
        cik1_suba = result[(result["CIK"] == "CIK1") & (result["SUB_NAME_NORM"] == "sub a")]
        assert 2020 in set(pd.to_datetime(cik1_suba["FDATE"]).dt.year)


# ── Timeline Computation ─────────────────────────────────────

class TestTimelineComputation:
    def _make_df(self, rows):
        df = pd.DataFrame(rows, columns=["CIK", "FDATE", "COMP_NAME", "SUB_NAME"])
        df["FDATE"] = pd.to_datetime(df["FDATE"])
        df["SUB_NAME_NORM"] = df["SUB_NAME"].str.lower().str.strip()
        return df

    def test_sub_present_all_years_is_active(self):
        """Sub present in all filings → 'Active as of' latest filing."""
        df = self._make_df([
            ("CIK1", "2020-03-15", "Parent", "Child LLC"),
            ("CIK1", "2021-03-15", "Parent", "Child LLC"),
            ("CIK1", "2022-03-15", "Parent", "Child LLC"),
        ])
        results, _ = compute_timelines(df)
        r = results[0]
        assert "Active" in r["time_out"]
        assert "On or before" in r["time_in"]

    def test_sub_appears_midway_has_high_confidence_timein(self):
        """Sub appears after first filing → TimeIn between prev and first_seen."""
        df = self._make_df([
            ("CIK1", "2019-03-15", "Parent", "Other Sub"),
            ("CIK1", "2020-03-15", "Parent", "Other Sub"),
            ("CIK1", "2020-03-15", "Parent", "New Acquisition Inc"),
            ("CIK1", "2021-03-15", "Parent", "Other Sub"),
            ("CIK1", "2021-03-15", "Parent", "New Acquisition Inc"),
        ])
        results, _ = compute_timelines(df)
        new_acq = [r for r in results if "New Acquisition" in r["sub_name"]][0]
        assert "Between" in new_acq["time_in"]
        assert new_acq["confidence"] == "HIGH"

    def test_sub_disappears_has_high_confidence_timeout(self):
        """Sub disappears before last filing → TimeOut between last_seen and next."""
        df = self._make_df([
            ("CIK1", "2019-03-15", "Parent", "Divested LLC"),
            ("CIK1", "2020-03-15", "Parent", "Divested LLC"),
            ("CIK1", "2021-03-15", "Parent", "Other Sub"),
        ])
        results, _ = compute_timelines(df)
        divested = [r for r in results if "Divested" in r["sub_name"]][0]
        assert "Between" in divested["time_out"]
        assert divested["confidence"] == "HIGH"

    def test_entity_suffix_gives_high_confidence(self):
        """Sub with entity suffix (LLC, Inc) should get HIGH confidence."""
        df = self._make_df([
            ("CIK1", "2020-03-15", "Parent", "Something LLC"),
        ])
        results, _ = compute_timelines(df)
        assert results[0]["confidence"] == "HIGH"

    def test_single_filing_low_confidence(self):
        """Sub in only one filing, no entity suffix → LOW or MEDIUM confidence."""
        df = self._make_df([
            ("CIK1", "2020-03-15", "Parent", "Mystery Entity"),
        ])
        results, _ = compute_timelines(df)
        # Only one filing → on or before + active as of → both bounded by same date
        assert results[0]["confidence"] in ("LOW", "MEDIUM")
