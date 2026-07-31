"""Tests for the audit & traceability layer — query wrapper, result_ref
lookup, and audit log pagination. Audit logging is enabled in test fixtures."""
import duckdb
import os
import tempfile
import pytest

from backend.db import init_db
from db.seed import load_seed_data


@pytest.fixture
def temp_db_path():
    fd, path = tempfile.mkstemp(suffix=".duckdb")
    os.close(fd)
    os.unlink(path)
    yield path
    if os.path.exists(path):
        os.unlink(path)


@pytest.fixture
def db_conn(temp_db_path):
    from backend.db import init_db
    conn = init_db(temp_db_path)
    yield conn
    conn.close()


@pytest.fixture
def controlled_db():
    fd, path = tempfile.mkstemp(suffix=".duckdb")
    os.close(fd)
    os.unlink(path)
    conn = init_db(path)
    conn.execute("UPDATE settings SET value = 'true' WHERE key = 'audit_enabled'")
    conn.execute("INSERT INTO entities VALUES ('E001', 'Test Entity')")
    conn.execute("INSERT INTO accounts VALUES "
                 "('R001', 'Product Revenue', 'revenue', 'Revenue'), "
                 "('E001', 'Salaries', 'expense', 'Personnel')")
    conn.execute("INSERT INTO periods VALUES ('2024-01', 2024, 1, 'FY2024 Jan')")
    conn.execute("INSERT INTO budget_actuals VALUES "
                 "('E001', 'R001', '2024-01', 'budget', 10000.00), "
                 "('E001', 'R001', '2024-01', 'actual', 11000.00), "
                 "('E001', 'E001', '2024-01', 'budget', 5000.00), "
                 "('E001', 'E001', '2024-01', 'actual', 5500.00)")
    yield conn
    conn.close()
    if os.path.exists(path):
        os.unlink(path)


@pytest.fixture
def seeded_db():
    fd, path = tempfile.mkstemp(suffix=".duckdb")
    os.close(fd)
    os.unlink(path)
    conn = init_db(path)
    conn.execute("UPDATE settings SET value = 'true' WHERE key = 'audit_enabled'")
    load_seed_data(conn)
    yield conn
    conn.close()
    if os.path.exists(path):
        os.unlink(path)


class TestAuditQueryWrapper:
    def test_wrapper_logs_every_query(self, controlled_db):
        from backend.audit import execute_logged
        controlled_db.execute("DELETE FROM calculation_log")
        rows, calc_ref = execute_logged(
            controlled_db, "SELECT COUNT(*) AS cnt FROM budget_actuals", params={})
        assert rows[0]["cnt"] == 4
        log_count = controlled_db.execute(
            "SELECT COUNT(*) FROM calculation_log").fetchone()[0]
        assert log_count == 1

    def test_wrapper_returns_calc_ref(self, controlled_db):
        from backend.audit import execute_logged
        rows, calc_ref = execute_logged(controlled_db, "SELECT 1 AS val", params={})
        assert calc_ref is not None
        assert len(calc_ref) > 0

    def test_wrapper_returns_result_rows_as_dicts(self, controlled_db):
        from backend.audit import execute_logged
        rows, calc_ref = execute_logged(
            controlled_db,
            "SELECT entity_id, account_id FROM budget_actuals LIMIT 1", params={})
        assert len(rows) == 1
        assert isinstance(rows[0], dict)
        assert "entity_id" in rows[0]

    def test_wrapper_logs_sql_query_text(self, controlled_db):
        from backend.audit import execute_logged
        controlled_db.execute("DELETE FROM calculation_log")
        execute_logged(controlled_db, "SELECT 42 AS answer", params={})
        logged_sql = controlled_db.execute(
            "SELECT sql_query FROM calculation_log LIMIT 1").fetchone()[0]
        assert logged_sql == "SELECT 42 AS answer"

    def test_wrapper_logs_params_json(self, controlled_db):
        from backend.audit import execute_logged
        controlled_db.execute("DELETE FROM calculation_log")
        execute_logged(controlled_db,
            "SELECT COUNT(*) AS cnt FROM budget_actuals WHERE scenario = ?",
            params={"scenario": "budget"})
        logged_params = controlled_db.execute(
            "SELECT params_json FROM calculation_log LIMIT 1").fetchone()[0]
        import json
        parsed = json.loads(logged_params)
        assert parsed["scenario"] == "budget"

    def test_audit_off_by_default(self, db_conn):
        """Audit logging should be OFF by default."""
        from backend.audit import execute_logged
        execute_logged(db_conn, "SELECT 1 AS val", params={})
        count = db_conn.execute(
            "SELECT COUNT(*) FROM calculation_log").fetchone()[0]
        assert count == 0


class TestResultRefLookup:
    def test_lookup_returns_correct_entry(self, controlled_db):
        from backend.audit import execute_logged, get_audit_entry
        rows, calc_ref = execute_logged(controlled_db, "SELECT 42 AS answer", params={})
        entry = get_audit_entry(controlled_db, calc_ref)
        assert entry is not None
        assert entry["result_ref"] == calc_ref

    def test_lookup_returns_timestamp(self, controlled_db):
        from backend.audit import execute_logged, get_audit_entry
        rows, calc_ref = execute_logged(controlled_db, "SELECT 1 AS val", params={})
        entry = get_audit_entry(controlled_db, calc_ref)
        assert entry["timestamp"] is not None

    def test_lookup_returns_params(self, controlled_db):
        from backend.audit import execute_logged, get_audit_entry
        rows, calc_ref = execute_logged(
            controlled_db, "SELECT 1 AS val", params={"threshold": 10.0})
        entry = get_audit_entry(controlled_db, calc_ref)
        import json
        parsed = json.loads(entry["params_json"])
        assert parsed["threshold"] == 10.0

    def test_lookup_nonexistent_ref_returns_none(self, controlled_db):
        from backend.audit import get_audit_entry
        entry = get_audit_entry(controlled_db, "nonexistent_ref_12345")
        assert entry is None


class TestAuditLogPagination:
    def test_get_audit_log_returns_list(self, controlled_db):
        from backend.audit import execute_logged, get_audit_log
        for i in range(5):
            execute_logged(controlled_db, f"SELECT {i} AS val", params={})
        log = get_audit_log(controlled_db, limit=10, offset=0)
        assert isinstance(log, list)
        assert len(log) == 5

    def test_get_audit_log_pagination(self, controlled_db):
        from backend.audit import execute_logged, get_audit_log
        for i in range(10):
            execute_logged(controlled_db, f"SELECT {i} AS val", params={})
        page1 = get_audit_log(controlled_db, limit=3, offset=0)
        page2 = get_audit_log(controlled_db, limit=3, offset=3)
        assert len(page1) == 3
        assert len(page2) == 3
        refs1 = {e["result_ref"] for e in page1}
        refs2 = {e["result_ref"] for e in page2}
        assert refs1.isdisjoint(refs2)

    def test_get_audit_log_entries_have_required_fields(self, controlled_db):
        from backend.audit import execute_logged, get_audit_log
        execute_logged(controlled_db, "SELECT 1 AS val", params={})
        log = get_audit_log(controlled_db, limit=10, offset=0)
        entry = log[0]
        assert "log_id" in entry
        assert "sql_query" in entry
        assert "params_json" in entry
        assert "timestamp" in entry
        assert "result_ref" in entry

    def test_get_audit_log_ordered_desc(self, controlled_db):
        from backend.audit import execute_logged, get_audit_log
        execute_logged(controlled_db, "SELECT 1 AS val", params={})
        execute_logged(controlled_db, "SELECT 2 AS val", params={})
        log = get_audit_log(controlled_db, limit=10, offset=0)
        assert log[0]["log_id"] >= log[1]["log_id"]
