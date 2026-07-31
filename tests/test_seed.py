"""Tests for seed data loading."""
import duckdb
import os
import tempfile
import pytest


@pytest.fixture
def seeded_db():
    """Initialize schema + load seed data, return connection."""
    fd, path = tempfile.mkstemp(suffix=".duckdb")
    os.close(fd)
    os.unlink(path)
    from backend.db import init_db
    from db.seed import load_seed_data
    conn = init_db(path)
    load_seed_data(conn)
    yield conn
    conn.close()
    if os.path.exists(path):
        os.unlink(path)


class TestSeedData:
    """Verify seed data loads correctly."""

    def test_seed_loads_without_error(self, seeded_db):
        """Seed script should run without raising."""
        pass  # fixture itself proves this

    def test_entities_populated(self, seeded_db):
        count = seeded_db.execute("SELECT COUNT(*) FROM entities").fetchone()[0]
        assert count >= 2

    def test_accounts_populated(self, seeded_db):
        count = seeded_db.execute("SELECT COUNT(*) FROM accounts").fetchone()[0]
        assert count >= 5

    def test_periods_populated(self, seeded_db):
        count = seeded_db.execute("SELECT COUNT(*) FROM periods").fetchone()[0]
        assert count >= 12

    def test_budget_actuals_populated(self, seeded_db):
        count = seeded_db.execute("SELECT COUNT(*) FROM budget_actuals").fetchone()[0]
        assert count >= 100

    def test_has_both_budget_and_actual_scenarios(self, seeded_db):
        scenarios = seeded_db.execute(
            "SELECT DISTINCT scenario FROM budget_actuals ORDER BY scenario"
        ).fetchall()
        scenario_names = [s[0] for s in scenarios]
        assert "budget" in scenario_names
        assert "actual" in scenario_names

    def test_has_revenue_and_expense_accounts(self, seeded_db):
        types = seeded_db.execute(
            "SELECT DISTINCT account_type FROM accounts ORDER BY account_type"
        ).fetchall()
        type_names = [t[0] for t in types]
        assert "revenue" in type_names
        assert "expense" in type_names

    def test_budget_actuals_referential_integrity(self, seeded_db):
        """Every budget_actuals row should reference valid dimension rows."""
        # Check entity references
        orphan_entities = seeded_db.execute(
            "SELECT COUNT(*) FROM budget_actuals ba "
            "LEFT JOIN entities e ON ba.entity_id = e.entity_id "
            "WHERE e.entity_id IS NULL"
        ).fetchone()[0]
        assert orphan_entities == 0

        # Check account references
        orphan_accounts = seeded_db.execute(
            "SELECT COUNT(*) FROM budget_actuals ba "
            "LEFT JOIN accounts a ON ba.account_id = a.account_id "
            "WHERE a.account_id IS NULL"
        ).fetchone()[0]
        assert orphan_accounts == 0

        # Check period references
        orphan_periods = seeded_db.execute(
            "SELECT COUNT(*) FROM budget_actuals ba "
            "LEFT JOIN periods p ON ba.period_id = p.period_id "
            "WHERE p.period_id IS NULL"
        ).fetchone()[0]
        assert orphan_periods == 0
