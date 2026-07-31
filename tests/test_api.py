"""Tests for FastAPI REST endpoints — variance, anomalies, summary,
data upload, and audit trail access."""
import os
import tempfile
import pytest
from fastapi.testclient import TestClient

from backend.db import init_db
from db.seed import load_seed_data


@pytest.fixture
def client(tmp_path):
    """Create a FastAPI TestClient with a temporary DuckDB."""
    db_path = str(tmp_path / "test.duckdb")
    conn = init_db(db_path)
    load_seed_data(conn)

    from backend.main import create_app
    app = create_app(conn)
    yield TestClient(app)

    conn.close()


@pytest.fixture
def empty_client(tmp_path):
    """TestClient with schema but no seed data — for upload tests."""
    db_path = str(tmp_path / "empty.duckdb")
    conn = init_db(db_path)

    from backend.main import create_app
    app = create_app(conn)
    yield TestClient(app)

    conn.close()


# ── Health ───────────────────────────────────────────────────────────

class TestHealth:
    def test_health_check(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"


# ── Variance Endpoints ───────────────────────────────────────────────

class TestVarianceEndpoints:
    def test_get_variance(self, client):
        resp = client.get("/api/variance")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data["results"], list)
        assert len(data["results"]) > 0
        row = data["results"][0]
        assert "entity_id" in row
        assert "variance_amount" in row
        assert "favorable" in row
        assert "calc_ref" in row

    def test_get_variance_by_entity(self, client):
        resp = client.get("/api/variance/E001")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data["results"], list)
        for row in data["results"]:
            assert row["entity_id"] == "E001"

    def test_get_variance_nonexistent_entity(self, client):
        resp = client.get("/api/variance/NOPE")
        assert resp.status_code == 200
        data = resp.json()
        assert data["results"] == []


# ── Anomaly Endpoint ─────────────────────────────────────────────────

class TestAnomalyEndpoint:
    def test_get_anomalies_default_threshold(self, client):
        resp = client.get("/api/anomalies")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data["results"], list)
        for row in data["results"]:
            assert "variance_pct" in row
            assert "calc_ref" in row

    def test_get_anomalies_custom_threshold(self, client):
        resp = client.get("/api/anomalies?threshold_pct=5.0")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data["results"], list)
        # Lower threshold → more or equal anomalies
        resp2 = client.get("/api/anomalies?threshold_pct=50.0")
        data2 = resp2.json()
        assert len(data["results"]) >= len(data2["results"])


# ── Summary Endpoint ─────────────────────────────────────────────────

class TestSummaryEndpoint:
    def test_get_summary(self, client):
        resp = client.get("/api/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_revenue_budget" in data
        assert "total_revenue_actual" in data
        assert "total_expense_budget" in data
        assert "total_expense_actual" in data
        assert "net_variance" in data
        assert "calc_ref" in data


# ── Data Upload Endpoint ─────────────────────────────────────────────

class TestDataUpload:
    def test_upload_csv(self, empty_client):
        csv_content = (
            "entity_id,account_id,period_id,scenario,amount\n"
            "E001,R001,2024-01,budget,10000.00\n"
            "E001,R001,2024-01,actual,11000.00\n"
        )
        resp = empty_client.post(
            "/api/data/upload",
            files={"file": ("test.csv", csv_content, "text/csv")},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["rows_inserted"] == 2

    def test_upload_invalid_csv(self, empty_client):
        csv_content = "bad,header\nfoo,bar"
        resp = empty_client.post(
            "/api/data/upload",
            files={"file": ("bad.csv", csv_content, "text/csv")},
        )
        assert resp.status_code == 400


# ── Audit Endpoints ──────────────────────────────────────────────────

class TestAuditEndpoints:
    def test_get_audit_log(self, client):
        # Trigger some queries first
        client.get("/api/variance")
        resp = client.get("/api/audit/log")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data["entries"], list)
        assert len(data["entries"]) > 0
        entry = data["entries"][0]
        assert "result_ref" in entry
        assert "sql_query" in entry

    def test_get_audit_entry_by_ref(self, client):
        # Trigger a query to get a calc_ref
        var_resp = client.get("/api/variance")
        calc_ref = var_resp.json()["results"][0]["calc_ref"]
        resp = client.get(f"/api/audit/{calc_ref}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["result_ref"] == calc_ref
        assert "sql_query" in data

    def test_get_audit_entry_not_found(self, client):
        resp = client.get("/api/audit/nonexistent_ref")
        assert resp.status_code == 404
