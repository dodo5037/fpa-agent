"""Tests for DuckDB schema initialization and seed data loading."""
import duckdb
import os
import tempfile
import pytest


@pytest.fixture
def temp_db_path():
    """Provide a temporary DuckDB file path."""
    fd, path = tempfile.mkstemp(suffix=".duckdb")
    os.close(fd)
    os.unlink(path)  # Remove so init creates fresh
    yield path
    if os.path.exists(path):
        os.unlink(path)


@pytest.fixture
def db_conn(temp_db_path):
    """Initialize schema and return a connection."""
    from backend.db import init_db
    conn = init_db(temp_db_path)
    yield conn
    conn.close()


class TestSchemaInitialization:
    """Test that schema creates cleanly with all required tables."""

    def test_schema_creates_without_error(self, temp_db_path):
        """Schema initialization should complete without raising."""
        from backend.db import init_db
        conn = init_db(temp_db_path)
        conn.close()

    def test_entities_table_exists(self, db_conn):
        result = db_conn.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_name = 'entities'"
        ).fetchall()
        assert len(result) == 1

    def test_accounts_table_exists(self, db_conn):
        result = db_conn.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_name = 'accounts'"
        ).fetchall()
        assert len(result) == 1

    def test_periods_table_exists(self, db_conn):
        result = db_conn.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_name = 'periods'"
        ).fetchall()
        assert len(result) == 1

    def test_budget_actuals_table_exists(self, db_conn):
        result = db_conn.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_name = 'budget_actuals'"
        ).fetchall()
        assert len(result) == 1

    def test_calculation_log_table_exists(self, db_conn):
        result = db_conn.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_name = 'calculation_log'"
        ).fetchall()
        assert len(result) == 1


class TestSchemaColumns:
    """Verify key columns exist on each table."""

    def test_budget_actuals_has_required_columns(self, db_conn):
        cols = db_conn.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'budget_actuals'"
        ).fetchall()
        col_names = {c[0] for c in cols}
        assert {"entity_id", "account_id", "period_id", "scenario", "amount"}.issubset(col_names)

    def test_calculation_log_has_required_columns(self, db_conn):
        cols = db_conn.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'calculation_log'"
        ).fetchall()
        col_names = {c[0] for c in cols}
        assert {"log_id", "sql_query", "params_json", "timestamp", "result_ref"}.issubset(col_names)

    def test_accounts_has_required_columns(self, db_conn):
        cols = db_conn.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'accounts'"
        ).fetchall()
        col_names = {c[0] for c in cols}
        assert {"account_id", "account_name", "account_type", "category"}.issubset(col_names)

    def test_entities_has_required_columns(self, db_conn):
        cols = db_conn.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'entities'"
        ).fetchall()
        col_names = {c[0] for c in cols}
        assert {"entity_id", "entity_name"}.issubset(col_names)

    def test_periods_has_required_columns(self, db_conn):
        cols = db_conn.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'periods'"
        ).fetchall()
        col_names = {c[0] for c in cols}
        assert {"period_id", "fiscal_year", "period_num", "period_label"}.issubset(col_names)


class TestBudgetActualsConstraints:
    """Verify scenario column only accepts budget or actual."""

    @pytest.fixture
    def db_with_dims(self, db_conn):
        """Insert dimension rows so FK constraints are satisfied."""
        db_conn.execute("INSERT INTO entities VALUES ('E001', 'Test Entity')")
        db_conn.execute("INSERT INTO accounts VALUES ('A001', 'Test Account', 'revenue', 'Revenue')")
        db_conn.execute("INSERT INTO periods VALUES ('2024-01', 2024, 1, 'FY2024 Jan')")
        return db_conn

    def test_scenario_accepts_budget(self, db_with_dims):
        db_with_dims.execute(
            "INSERT INTO budget_actuals (entity_id, account_id, period_id, scenario, amount) "
            "VALUES ('E001', 'A001', '2024-01', 'budget', 10000.00)"
        )

    def test_scenario_accepts_actual(self, db_with_dims):
        db_with_dims.execute(
            "INSERT INTO budget_actuals (entity_id, account_id, period_id, scenario, amount) "
            "VALUES ('E001', 'A001', '2024-01', 'actual', 9500.00)"
        )

    def test_scenario_rejects_invalid(self, db_with_dims):
        """Non-budget/actual scenario values should be rejected."""
        with pytest.raises(Exception):
            db_with_dims.execute(
                "INSERT INTO budget_actuals (entity_id, account_id, period_id, scenario, amount) "
                "VALUES ('E001', 'A001', '2024-01', 'forecast', 10000.00)"
            )
