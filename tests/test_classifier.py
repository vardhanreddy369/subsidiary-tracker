"""Tests for the heuristic subsidiary classifier (_infer_type_from_name)."""

import pytest
from backend.agent.gemini_client import _infer_type_from_name


# ── Joint Ventures ────────────────────────────────────────────

class TestJointVenture:
    def test_explicit_joint_venture(self):
        assert _infer_type_from_name("ABC Joint Venture LLC", "Parent Corp") == "Joint Venture"

    def test_jv_abbreviation(self):
        assert _infer_type_from_name("Project Alpha JV LLC", "Parent Corp") == "Joint Venture"

    def test_partnership_alone_is_not_jv(self):
        """'Partnership' without 'joint' or 'jv' should NOT be classified as JV."""
        result = _infer_type_from_name("Alpha Partnership LP", "Alpha Corp")
        assert result != "Joint Venture"


# ── Internal Creation (parent name in sub) ────────────────────

class TestInternalCreation:
    def test_parent_name_in_subsidiary(self):
        assert _infer_type_from_name("Apple Services LLC", "Apple Inc") == "Internal Creation"

    def test_parent_name_with_suffix(self):
        assert _infer_type_from_name("Google Cloud LLC", "Google Inc") == "Internal Creation"

    def test_generic_trust_entity(self):
        assert _infer_type_from_name("Funding Trust 2020-A", "Big Bank Corp") == "Internal Creation"

    def test_functional_entity(self):
        result = _infer_type_from_name(
            "Regional Insurance Holdings LLC", "Mega Corp",
            first_seen="2020-01-01", first_filing="2020-01-01"
        )
        assert result == "Internal Creation"

    def test_original_subsidiary(self):
        """Sub present from first filing → Internal Creation."""
        result = _infer_type_from_name(
            "Unknown Entity LLC", "Parent Corp",
            first_seen="2015-03-15", first_filing="2015-03-15",
            batch_size=50
        )
        assert result == "Internal Creation"

    def test_solo_add_with_functional(self):
        """Small batch + functional keyword → Internal."""
        result = _infer_type_from_name(
            "Western Mortgage Services Inc", "Parent Corp",
            first_seen="2020-06-01", first_filing="2015-01-01",
            batch_size=1
        )
        assert result == "Internal Creation"


# ── External Acquisition ─────────────────────────────────────

class TestExternalAcquisition:
    def test_cross_cik_signal(self):
        """Cross-CIK appearance → External Acquisition."""
        result = _infer_type_from_name(
            "LinkedIn Corp", "Microsoft Corp",
            is_cross_cik=True
        )
        assert result == "External Acquisition"

    def test_standalone_company_not_original(self):
        """Standalone-looking entity (Inc/Corp) appearing after first filing → Acquisition."""
        result = _infer_type_from_name(
            "Acme Technologies Inc", "Parent Corp",
            first_seen="2020-06-01", first_filing="2015-01-01",
            batch_size=15
        )
        assert result == "External Acquisition"

    def test_cross_cik_overrides_functional(self):
        """Cross-CIK should override functional keywords (unless generic)."""
        result = _infer_type_from_name(
            "Independent Insurance Co", "Mega Corp",
            is_cross_cik=True
        )
        assert result == "External Acquisition"


# ── Restructuring ────────────────────────────────────────────

class TestRestructuring:
    def test_parent_holdings(self):
        """'Parent Holdings' → Restructuring."""
        assert _infer_type_from_name("Alphabet Holdings LLC", "Alphabet Inc") == "Restructuring"

    def test_parent_group(self):
        assert _infer_type_from_name("Google Group Inc", "Google Inc") == "Restructuring"


# ── Edge Cases ────────────────────────────────────────────────

class TestEdgeCases:
    def test_empty_parent_name(self):
        """Should not crash with empty parent."""
        result = _infer_type_from_name("Some Entity LLC", "")
        assert result in ("Internal Creation", "External Acquisition",
                          "Joint Venture", "Restructuring", "Spin-off")

    def test_very_short_names(self):
        result = _infer_type_from_name("AB", "CD")
        assert result is not None

    def test_cross_cik_generic_stays_internal(self):
        """Cross-CIK + generic entity (trust/funding) → stays Internal."""
        result = _infer_type_from_name(
            "Securitization Trust 2019-1", "Big Bank",
            is_cross_cik=True
        )
        assert result == "Internal Creation"

    def test_large_batch_fallback(self):
        """Large batch with short parent name → Acquisition (fallback)."""
        result = _infer_type_from_name(
            "Random Entity Corp", "AB",
            first_seen="2020-06-01", first_filing="2015-01-01",
            batch_size=25
        )
        assert result == "External Acquisition"

    def test_default_is_internal(self):
        """With no signals at all, default should be Internal Creation."""
        result = _infer_type_from_name(
            "Something Unrecognizable", "Parent Corp",
            first_seen="2020-06-01", first_filing="2015-01-01",
            batch_size=5
        )
        assert result == "Internal Creation"
