"""Tests for SubTrack API endpoints."""

import pytest
from fastapi.testclient import TestClient
from backend.app import app


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


# ── Dashboard Stats ──────────────────────────────────────────

class TestDashboardStats:
    def test_overview_returns_all_keys(self, client):
        r = client.get("/api/subsidiaries/stats/overview")
        assert r.status_code == 200
        data = r.json()
        for key in ["total_companies", "total_subsidiaries", "active_subs",
                     "divested_subs", "high_confidence"]:
            assert key in data, f"Missing key: {key}"
            assert isinstance(data[key], int)

    def test_overview_totals_are_reasonable(self, client):
        data = client.get("/api/subsidiaries/stats/overview").json()
        assert data["total_subsidiaries"] > 1_000_000
        assert data["total_companies"] > 20_000
        assert data["active_subs"] + data["divested_subs"] == data["total_subsidiaries"]

    def test_recently_enriched(self, client):
        r = client.get("/api/subsidiaries/stats/recent")
        assert r.status_code == 200
        data = r.json()
        assert "recently_enriched" in data
        assert isinstance(data["recently_enriched"], list)


# ── Subsidiary Search ────────────────────────────────────────

class TestSubsidiarySearch:
    def test_search_returns_results(self, client):
        r = client.get("/api/subsidiaries?q=apple&per_page=5")
        assert r.status_code == 200
        data = r.json()
        assert "subsidiaries" in data
        assert "total" in data
        assert len(data["subsidiaries"]) <= 5

    def test_search_empty_query(self, client):
        r = client.get("/api/subsidiaries?per_page=3")
        assert r.status_code == 200
        data = r.json()
        assert data["total"] > 0
        assert len(data["subsidiaries"]) == 3

    def test_search_pagination(self, client):
        r1 = client.get("/api/subsidiaries?per_page=2&page=1")
        r2 = client.get("/api/subsidiaries?per_page=2&page=2")
        assert r1.status_code == 200 and r2.status_code == 200
        ids1 = {s["id"] for s in r1.json()["subsidiaries"]}
        ids2 = {s["id"] for s in r2.json()["subsidiaries"]}
        assert ids1.isdisjoint(ids2), "Pages should not overlap"

    def test_search_no_match(self, client):
        r = client.get("/api/subsidiaries?q=zzzzxxyynomatch999")
        assert r.status_code == 200
        assert r.json()["total"] == 0


# ── Subsidiary Detail ────────────────────────────────────────

class TestSubsidiaryDetail:
    def test_get_existing_subsidiary(self, client):
        # Get a valid ID first
        search = client.get("/api/subsidiaries?per_page=1").json()
        sub_id = search["subsidiaries"][0]["id"]
        r = client.get(f"/api/subsidiaries/{sub_id}")
        assert r.status_code == 200
        sub = r.json()["subsidiary"]
        assert sub["id"] == sub_id
        assert "sub_name" in sub
        assert "cik" in sub

    def test_get_nonexistent_subsidiary(self, client):
        r = client.get("/api/subsidiaries/99999999")
        assert r.status_code == 200
        assert "error" in r.json()


# ── Company Endpoints ────────────────────────────────────────

class TestCompanyEndpoints:
    def test_company_list(self, client):
        r = client.get("/api/companies?per_page=5")
        assert r.status_code == 200
        data = r.json()
        assert "companies" in data or isinstance(data, list)

    def test_company_detail(self, client):
        # Get a CIK from overview stats
        overview = client.get("/api/subsidiaries/stats/overview").json()
        top = overview.get("top_companies", [])
        if not top:
            # Fallback: search for a known company
            search = client.get("/api/subsidiaries?q=apple&per_page=1").json()
            cik = search["subsidiaries"][0]["cik"] if search["subsidiaries"] else None
        else:
            cik = top[0]["cik"]
        if cik:
            r = client.get(f"/api/companies/{cik}")
            assert r.status_code == 200
            data = r.json()
            assert "company" in data
            assert "subsidiaries" in data


# ── M&A Timeline ─────────────────────────────────────────────

class TestTimeline:
    def test_timeline_endpoint_works(self, client):
        r = client.get("/api/subsidiaries/timeline")
        assert r.status_code == 200
        data = r.json()
        assert "timeline" in data
        tl = data["timeline"]
        # Timeline may be empty if type column hasn't been populated
        # but endpoint should always return valid structure
        assert isinstance(tl, dict)

    def test_timeline_years_are_sorted_if_present(self, client):
        tl = client.get("/api/subsidiaries/timeline").json()["timeline"]
        if tl:
            years = list(tl.keys())
            assert years == sorted(years)


# ── Recent Acquisitions ──────────────────────────────────────

class TestRecentAcquisitions:
    def test_returns_list(self, client):
        r = client.get("/api/subsidiaries/recent-acquisitions")
        assert r.status_code == 200
        acqs = r.json()["acquisitions"]
        assert isinstance(acqs, list)
        assert len(acqs) <= 20

    def test_acquisition_fields(self, client):
        acqs = client.get("/api/subsidiaries/recent-acquisitions").json()["acquisitions"]
        if acqs:
            a = acqs[0]
            for field in ["sub_name", "company_name", "cik", "first_seen", "confidence"]:
                assert field in a, f"Missing field: {field}"


# ── Classification Stats ─────────────────────────────────────

class TestClassificationStats:
    def test_returns_method_and_accuracy(self, client):
        r = client.get("/api/subsidiaries/classification-stats")
        assert r.status_code == 200
        data = r.json()
        assert "method" in data
        assert "estimated_accuracy" in data
        assert "distribution" in data

    def test_distribution_is_valid(self, client):
        data = client.get("/api/subsidiaries/classification-stats").json()
        dist = data["distribution"]
        assert isinstance(dist, dict)
        # All values should be non-negative integers
        for v in dist.values():
            assert isinstance(v, int) and v >= 0


# ── CSV Export ────────────────────────────────────────────────

class TestCSVExport:
    def test_csv_returns_valid_headers(self, client):
        r = client.get("/api/subsidiaries/export/csv")
        assert r.status_code == 200
        assert "text/csv" in r.headers["content-type"]
        lines = r.text.split("\n")
        header = lines[0].strip()
        assert "sub_name" in header
        assert "company_name" in header
        assert "time_in" in header

    def test_csv_has_data_rows(self, client):
        r = client.get("/api/subsidiaries/export/csv")
        lines = [l for l in r.text.split("\n") if l.strip()]
        assert len(lines) > 100, "CSV should have many data rows"
