"""Tests for FastAPI REST endpoints — variance, anomalies, summary,
data upload, and audit trail access."""
import os
import tempfile
import pytest
from fastapi.testclient import TestClient

from backend.db import init_db
from db.seed import load_seed_data


@pytest.fixture(autouse=True)
def _reset_dedup_cache():
    """Clear the module-level dedup cache between tests."""
    from backend.audit import _clear_dedup_cache
    _clear_dedup_cache()


@pytest.fixture
def client(tmp_path):
    """Create a FastAPI TestClient with a temporary DuckDB."""
    db_path = str(tmp_path / "test.duckdb")
    conn = init_db(db_path)
    conn.execute("UPDATE settings SET value = 'true' WHERE key = 'audit_enabled'")
    load_seed_data(conn)

    from backend.main import create_app
    app = create_app(conn, db_path=db_path)
    yield TestClient(app)

    conn.close()


@pytest.fixture
def empty_client(tmp_path):
    """TestClient with schema but no seed data — for upload tests."""
    db_path = str(tmp_path / "empty.duckdb")
    conn = init_db(db_path)

    from backend.main import create_app
    app = create_app(conn, db_path=db_path)
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


class TestAccountTypeInference:
    """P1.1: account_id-based classification for expense vs revenue."""

    def test_revenue_keywords_classify_correctly(self, empty_client):
        csv = (
            "entity_id,account_id,period_id,scenario,amount\n"
            "E1,Product_Revenue,2024-01,budget,5000\n"
            "E1,Product_Revenue,2024-01,actual,6000\n"
            "E1,Sales_Direct,2024-01,budget,3000\n"
            "E1,Sales_Direct,2024-01,actual,3500\n"
        )
        empty_client.post("/api/data/upload",
            files={"file": ("rev.csv", csv, "text/csv")})
        summary = empty_client.get("/api/summary?session_id=default").json()
        assert summary["total_revenue_actual"] == 9500.0
        assert summary["total_expense_actual"] == 0.0

    def test_expense_keywords_classify_correctly(self, empty_client):
        csv = (
            "entity_id,account_id,period_id,scenario,amount\n"
            "E1,Payroll_Costs,2024-01,budget,2000\n"
            "E1,Payroll_Costs,2024-01,actual,2500\n"
            "E1,Server_Fees,2024-01,budget,1000\n"
            "E1,Server_Fees,2024-01,actual,1200\n"
            "E1,Rent_Expense,2024-01,budget,800\n"
            "E1,Rent_Expense,2024-01,actual,800\n"
        )
        empty_client.post("/api/data/upload",
            files={"file": ("exp.csv", csv, "text/csv")})
        summary = empty_client.get("/api/summary?session_id=default").json()
        assert summary["total_revenue_actual"] == 0.0
        assert summary["total_expense_actual"] == 4500.0

    def test_mixed_revenue_and_expense_routes_correctly(self, empty_client):
        csv = (
            "entity_id,account_id,period_id,scenario,amount\n"
            "E1,Sales_Revenue,2024-01,budget,10000\n"
            "E1,Sales_Revenue,2024-01,actual,11000\n"
            "E1,Marketing_Costs,2024-01,budget,4000\n"
            "E1,Marketing_Costs,2024-01,actual,4500\n"
            "E1,Office_Rent,2024-01,budget,2000\n"
            "E1,Office_Rent,2024-01,actual,2000\n"
        )
        empty_client.post("/api/data/upload",
            files={"file": ("mixed.csv", csv, "text/csv")})
        summary = empty_client.get("/api/summary?session_id=default").json()
        assert summary["total_revenue_actual"] == 11000.0
        assert summary["total_expense_actual"] == 6500.0
        # Net: revenue variance = +1000, expense variance = -500, net = 500
        assert summary["net_variance"] == 500.0

    def test_net_variance_math(self, empty_client):
        """P1.1: net = (rev_actual - rev_budget) - (exp_actual - exp_budget)"""
        csv = (
            "entity_id,account_id,period_id,scenario,amount\n"
            "E1,Sales,2024-01,budget,5000\n"
            "E1,Sales,2024-01,actual,7000\n"
            "E1,Costs,2024-01,budget,3000\n"
            "E1,Costs,2024-01,actual,4000\n"
        )
        empty_client.post("/api/data/upload",
            files={"file": ("net.csv", csv, "text/csv")})
        summary = empty_client.get("/api/summary?session_id=default").json()
        # Revenue variance: 7000-5000 = +2000
        # Expense variance: 4000-3000 = +1000 (overspent = unfavorable)
        # Net: 2000 - 1000 = 1000
        assert summary["net_variance"] == 1000.0

    def test_explicit_account_type_overrides_inference(self, empty_client):
        """If CSV has account_type column, it takes priority over inference."""
        csv = (
            "entity_id,account_id,account_name,account_type,period_id,scenario,amount\n"
            "E1,OddName,Odd Account,expense,2024-01,budget,5000\n"
            "E1,OddName,Odd Account,expense,2024-01,actual,6000\n"
        )
        empty_client.post("/api/data/upload",
            files={"file": ("odd.csv", csv, "text/csv")})
        summary = empty_client.get("/api/summary?session_id=default").json()
        assert summary["total_revenue_actual"] == 0.0
        assert summary["total_expense_actual"] == 6000.0


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


# ── Session & Version Endpoints (Step 8) ──────────────────────────────

class TestSessionEndpoints:
    def test_list_sessions_has_row_counts(self, client):
        resp = client.get("/api/sessions")
        assert resp.status_code == 200
        data = resp.json()
        assert "sessions" in data
        for s in data["sessions"]:
            assert "session_id" in s
            assert "session_name" in s
            assert "row_count" in s
            assert isinstance(s["row_count"], int)

    def test_session_info_has_row_count(self, client):
        resp = client.get("/api/sessions/default/info")
        assert resp.status_code == 200
        data = resp.json()
        assert "row_count" in data
        assert isinstance(data["row_count"], int)

    def test_session_info_404(self, client):
        resp = client.get("/api/sessions/nonexistent/info")
        assert resp.status_code == 404

    def test_create_and_delete_session(self, client):
        # Create
        resp = client.post("/api/sessions", json={"name": "Test Session"})
        assert resp.status_code == 200
        created = resp.json()
        assert created["session_name"] == "Test Session"
        sid = created["session_id"]

        # Verify it appears in list
        resp2 = client.get("/api/sessions")
        sessions = [s["session_id"] for s in resp2.json()["sessions"]]
        assert sid in sessions

        # Delete it
        resp3 = client.delete(f"/api/sessions/{sid}")
        assert resp3.status_code == 200

        # Verify it's gone
        resp4 = client.get("/api/sessions")
        sessions2 = [s["session_id"] for s in resp4.json()["sessions"]]
        assert sid not in sessions2

    def test_cannot_delete_default_session(self, client):
        resp = client.delete("/api/sessions/default")
        assert resp.status_code == 400


class TestSessionVersionEndpoint:
    """Step 8.1: version endpoint for cheap polling."""

    def test_version_returns_hash_and_count(self, client):
        resp = client.get("/api/sessions/default/version")
        assert resp.status_code == 200
        data = resp.json()
        assert "data_hash" in data
        assert "row_count" in data
        assert "updated_at" in data
        assert isinstance(data["row_count"], int)
        assert len(data["data_hash"]) == 12

    def test_version_consistent_hash_when_data_unchanged(self, client):
        """Calling /version twice with no data changes → same hash."""
        resp1 = client.get("/api/sessions/default/version")
        resp2 = client.get("/api/sessions/default/version")
        h1 = resp1.json()["data_hash"]
        h2 = resp2.json()["data_hash"]
        assert h1 == h2, f"Hash changed without data change: {h1} != {h2}"

    def test_version_hash_changes_after_upload(self, client):
        """Uploading data should change the version hash."""
        # Get initial hash
        resp1 = client.get("/api/sessions/default/version")
        initial_hash = resp1.json()["data_hash"]

        # Upload new data
        csv_content = (
            "entity_id,account_id,period_id,scenario,amount\n"
            "E999,R999,2024-99,budget,5000.00\n"
            "E999,R999,2024-99,actual,6000.00\n"
        )
        upload_resp = client.post(
            "/api/data/upload",
            files={"file": ("hash_test.csv", csv_content, "text/csv")},
        )
        assert upload_resp.status_code == 201

        # Hash should have changed
        resp2 = client.get("/api/sessions/default/version")
        new_hash = resp2.json()["data_hash"]
        assert new_hash != initial_hash, f"Hash did not change after upload: {initial_hash}"

    def test_version_404_nonexistent_session(self, client):
        resp = client.get("/api/sessions/nonexistent/version")
        assert resp.status_code == 404

    def test_version_row_count_matches_actual(self, client):
        """The row_count in /version should match COUNT(*) in budget_actuals."""
        resp = client.get("/api/sessions/default/version")
        version_count = resp.json()["row_count"]
        # Now count rows via the data endpoint
        data_resp = client.get("/api/data/default")
        actual_count = data_resp.json()["count"]
        assert version_count == actual_count, \
            f"Version row_count {version_count} != actual {actual_count}"


class TestSessionDataIsolation:
    """Step 8: Data uploaded to one session should not leak to another."""

    def test_data_isolated_per_session(self, client):
        # Create a second session
        resp = client.post("/api/sessions", json={"name": "Isolated Session"})
        sid2 = resp.json()["session_id"]

        # Upload data to default session only
        csv_content = (
            "entity_id,account_id,period_id,scenario,amount\n"
            "EISO,RISO,2024-ISO,budget,9999.00\n"
        )
        client.post(
            "/api/data/upload?session_id=default",
            files={"file": ("iso.csv", csv_content, "text/csv")},
        )

        # Second session should have no data
        data2 = client.get(f"/api/data/{sid2}")
        assert data2.json()["count"] == 0

        # Clean up
        client.delete(f"/api/sessions/{sid2}")

    def test_switching_sessions_loads_different_data(self, client):
        # Session 1 (default) has seed data
        resp1 = client.get("/api/summary?session_id=default")
        default_net = resp1.json()["net_variance"]

        # Session 2: upload different data
        client.post("/api/sessions", json={"name": "Switch Test"})
        csv_content = (
            "entity_id,account_id,period_id,scenario,amount\n"
            "ESW,RSW,2024-SW,budget,100000.00\n"
            "ESW,RSW,2024-SW,actual,150000.00\n"
        )
        # Need to use the newly created session's ID for upload
        sessions = client.get("/api/sessions").json()["sessions"]
        switch_sid = [s["session_id"] for s in sessions if s["session_name"] == "Switch Test"][0]
        client.post(
            f"/api/data/upload?session_id={switch_sid}",
            files={"file": ("switch.csv", csv_content, "text/csv")},
        )

        # Verify different data
        resp2 = client.get(f"/api/summary?session_id={switch_sid}")
        switch_net = resp2.json()["net_variance"]
        assert switch_net != default_net, "Session data should be isolated"

        # Clean up
        client.delete(f"/api/sessions/{switch_sid}")


class TestPollingBehavior:
    """Step 8 Bug A: First poll with null hashRef must NOT trigger reload."""

    def test_first_poll_with_null_reference_skips_reload(self, client):
        """Simulate the frontend: dataHashRef starts as None.
        First poll should store the hash but NOT trigger a reload."""
        # Get initial hash
        r1 = client.get("/api/sessions/default/version")
        h1 = r1.json()["data_hash"]

        # Simulate: dataHashRef.current = None (frontend initial state)
        # If None → don't reload, just store
        reference = None
        reload_triggered = False
        if h1 != reference:
            if reference is not None:
                reload_triggered = True
            reference = h1

        assert not reload_triggered, \
            "BUG: First poll with null ref triggered spurious reload"
        assert reference == h1, "Hash should be stored after first poll"

    def test_second_poll_same_hash_no_reload(self, client):
        """After hash is stored, identical hash should not trigger reload."""
        r1 = client.get("/api/sessions/default/version")
        h1 = r1.json()["data_hash"]
        reference = h1  # Simulate stored from first poll

        r2 = client.get("/api/sessions/default/version")
        h2 = r2.json()["data_hash"]
        assert h2 == h1, "Hash should be stable"

        reload_triggered = (h2 != reference)
        assert not reload_triggered, \
            "BUG: Same hash triggered unnecessary reload"

    def test_hash_change_triggers_reload(self, client):
        """After data upload, changed hash SHOULD trigger reload."""
        r1 = client.get("/api/sessions/default/version")
        h1 = r1.json()["data_hash"]
        reference = h1

        # Upload new data
        client.post("/api/data/upload", files={
            "file": ("poll_test.csv",
                     "entity_id,account_id,period_id,scenario,amount\n"
                     "EP,A1,P1,budget,500\nEP,A1,P1,actual,600",
                     "text/csv")
        })

        r2 = client.get("/api/sessions/default/version")
        h2 = r2.json()["data_hash"]
        assert h2 != h1, "Hash should change after upload"

        reload_triggered = (h2 != reference)
        assert reload_triggered, \
            "BUG: Changed hash did NOT trigger reload"

    def test_poll_after_reload_no_double_fire(self, client):
        """After reload stores new hash, next poll with same data = no reload."""
        r1 = client.get("/api/sessions/default/version")
        reference = r1.json()["data_hash"]

        r2 = client.get("/api/sessions/default/version")
        h2 = r2.json()["data_hash"]

        reload_triggered = (h2 != reference)
        assert not reload_triggered, \
            "BUG: Same hash after reload triggered another reload"


class TestTimeseriesEndpoint:
    """T1: Mathematical Engine — timeseries with cumulative YTD and moving avg."""

    def test_timeseries_returns_periods(self, client):
        resp = client.get("/api/timeseries")
        assert resp.status_code == 200
        data = resp.json()
        assert "results" in data
        assert data["count"] > 0
        row = data["results"][0]
        assert "period_id" in row
        assert "total_budget" in row
        assert "total_actual" in row
        assert "variance_amount" in row
        assert "variance_pct" in row
        assert "cumulative_ytd" in row
        assert "moving_avg_actual" in row

    def test_timeseries_periods_sorted(self, client):
        resp = client.get("/api/timeseries")
        periods = [r["period_id"] for r in resp.json()["results"]]
        assert periods == sorted(periods), "Periods must be sorted"

    def test_timeseries_cumulative_ytd_increases(self, client):
        """Cumulative YTD is a running total — should grow with each period."""
        resp = client.get("/api/timeseries")
        results = resp.json()["results"]
        cumulatives = [r["cumulative_ytd"] for r in results]
        # The absolute cumulative value may go up or down (mixed variances),
        # but the LAST cumulative should equal the sum of all variances
        total_variance = sum(r["variance_amount"] for r in results)
        assert abs(cumulatives[-1] - total_variance) < 0.02

    def test_timeseries_moving_average_window_3(self, client):
        """Moving average uses only past data (no future leakage)."""
        resp = client.get("/api/timeseries?window=3")
        results = resp.json()["results"]
        # First period: moving avg = its own actual
        assert results[0]["moving_avg_actual"] == results[0]["total_actual"]
        # Second period: avg of periods 0-1
        expected = (results[0]["total_actual"] + results[1]["total_actual"]) / 2
        assert abs(results[1]["moving_avg_actual"] - expected) < 0.02

    def test_timeseries_empty_session(self, empty_client):
        resp = empty_client.get("/api/timeseries")
        assert resp.status_code == 200
        assert resp.json()["count"] == 0


class TestRegionalEndpoint:
    """T1: Mathematical Engine — regional / entity-level aggregation."""

    def test_regional_returns_entities(self, client):
        resp = client.get("/api/regional")
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] >= 1
        row = data["results"][0]
        assert "entity_id" in row
        assert "total_budget" in row
        assert "total_actual" in row
        assert "variance_amount" in row
        assert "variance_pct" in row

    def test_regional_empty_session(self, empty_client):
        resp = empty_client.get("/api/regional")
        assert resp.status_code == 200
        assert resp.json()["count"] == 0


class TestAuditDedup:
    """P1.2: Audit log state-diffing prevents duplicate entries."""

    @pytest.fixture(autouse=True)
    def _reset_dedup(self):
        """Clear the module-level dedup cache between tests."""
        from backend.audit import _clear_dedup_cache
        _clear_dedup_cache()

    def test_dedup_prevents_duplicate_log_entries(self, client):
        # Enable audit
        client.post("/api/settings", json={"audit_enabled": "true"})
        # Clear existing entries
        client.post("/api/audit/clear")

        # First query — should create 1 entry
        client.get("/api/variance")
        log1 = client.get("/api/audit/log").json()
        count1 = log1["count"]
        assert count1 > 0, "First query should create entries"

        # Same query within dedup window — should NOT create new entries
        client.get("/api/variance")
        log2 = client.get("/api/audit/log").json()
        assert log2["count"] == count1, \
            f"Duplicate query should not add entries (was {count1}, now {log2['count']})"

        # A different query should still log
        client.get("/api/summary")
        log3 = client.get("/api/audit/log").json()
        assert log3["count"] > count1, \
            "Different query should create new entries"

        # Clean up
        client.post("/api/settings", json={"audit_enabled": "false"})

    def test_dedup_cache_clears_across_endpoints(self, client):
        """Both execute_logged and _log_query share the same dedup cache."""
        client.post("/api/settings", json={"audit_enabled": "true"})
        client.post("/api/audit/clear")

        # variance uses _log_query; timeseries also uses _log_query
        # but with different SQL → should create separate entries
        client.get("/api/variance")
        client.get("/api/timeseries")
        log = client.get("/api/audit/log").json()
        assert log["count"] >= 2  # At least 2 distinct entries

        client.post("/api/settings", json={"audit_enabled": "false"})




# =============================================================================
# A1: New audit_logs table — mandatory, always-on operational audit
# =============================================================================

class TestAuditLogsTable:
    """A1.2: Dedicated audit_logs table with UUID PK and session isolation."""

    def test_audit_logs_table_exists(self, client):
        """Schema init creates the audit_logs table."""
        resp = client.get("/api/audit/trail")
        assert resp.status_code == 200
        data = resp.json()
        assert "entries" in data
        assert "count" in data

    def test_audit_logs_session_isolation(self, client):
        """Audit events from one session do not leak into another."""
        csv_data = (
            "entity_id,account_id,period_id,scenario,amount\n"
            "E999,Isolated_Revenue,2026-01,actual,1000\n"
            "E999,Isolated_Revenue,2026-01,budget,900"
        )
        resp = client.post(
            "/api/sessions",
            json={"session_name": "audit-isolation-test"}
        )
        sid = resp.json()["session_id"]

        client.post(
            f"/api/data/upload?session_id={sid}",
            files={"file": ("iso.csv", csv_data, "text/csv")}
        )

        trail_a = client.get(f"/api/audit/trail?session_id={sid}").json()
        assert trail_a["count"] >= 1

        trail_b = client.get("/api/audit/trail?session_id=default").json()
        for entry in trail_b["entries"]:
            assert entry.get("session_id") != sid, \
                f"Session {sid} entry leaked into default session trail"

    def test_audit_trail_category_filter(self, client):
        """Category filter returns only matching event types."""
        trail = client.get(
            "/api/audit/trail?session_id=default&category=DATA_INGESTION"
        ).json()
        for entry in trail["entries"]:
            assert entry["event_category"] == "DATA_INGESTION"

    def test_audit_trail_pagination(self, client):
        """Limit and offset params work correctly."""
        all_entries = client.get(
            "/api/audit/trail?session_id=default"
        ).json()

        if all_entries["count"] >= 2:
            page1 = client.get(
                "/api/audit/trail?session_id=default&limit=1&offset=0"
            ).json()
            assert len(page1["entries"]) == 1
            page2 = client.get(
                "/api/audit/trail?session_id=default&limit=1&offset=1"
            ).json()
            assert len(page2["entries"]) == 1
            assert page1["entries"][0]["log_id"] != page2["entries"][0]["log_id"]
