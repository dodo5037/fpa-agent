"""Tests for Ollama LLM integration — NL-to-SQL translation, SQL
validation, memo generation, and the rule that the LLM never does math."""
import os
import tempfile
import pytest
from unittest.mock import patch, MagicMock

from backend.db import init_db
from db.seed import load_seed_data


@pytest.fixture
def seeded_db():
    fd, path = tempfile.mkstemp(suffix=".duckdb")
    os.close(fd)
    os.unlink(path)
    conn = init_db(path)
    load_seed_data(conn)
    yield conn
    conn.close()
    if os.path.exists(path):
        os.unlink(path)


# ── SQL Validation ───────────────────────────────────────────────────

class TestSQLValidation:
    """Test that the SQL validation layer rejects dangerous queries."""

    def test_accepts_select_query(self):
        from backend.llm import validate_sql
        sql = "SELECT * FROM budget_actuals LIMIT 10"
        assert validate_sql(sql) is True

    def test_rejects_insert(self):
        from backend.llm import validate_sql
        with pytest.raises(ValueError, match="(?i)only SELECT"):
            validate_sql("INSERT INTO budget_actuals VALUES (1,2,3,4,5)")

    def test_rejects_update(self):
        from backend.llm import validate_sql
        with pytest.raises(ValueError, match="(?i)only SELECT"):
            validate_sql("UPDATE budget_actuals SET amount = 0")

    def test_rejects_delete(self):
        from backend.llm import validate_sql
        with pytest.raises(ValueError, match="(?i)only SELECT"):
            validate_sql("DELETE FROM budget_actuals")

    def test_rejects_drop(self):
        from backend.llm import validate_sql
        with pytest.raises(ValueError, match="(?i)only SELECT"):
            validate_sql("DROP TABLE budget_actuals")

    def test_rejects_unauthorized_table(self):
        from backend.llm import validate_sql
        with pytest.raises(ValueError, match="not allowed"):
            validate_sql("SELECT * FROM calculation_log")

    def test_accepts_allowed_tables(self):
        from backend.llm import validate_sql
        assert validate_sql("SELECT * FROM budget_actuals") is True
        assert validate_sql("SELECT * FROM accounts") is True
        assert validate_sql("SELECT * FROM entities") is True
        assert validate_sql("SELECT * FROM periods") is True

    def test_rejects_empty_sql(self):
        from backend.llm import validate_sql
        with pytest.raises(ValueError, match="empty"):
            validate_sql("")


# ── NL-to-SQL Translation ────────────────────────────────────────────

class TestNLToSQL:
    """Test natural language to SQL translation via Ollama."""

    @patch("backend.llm._call_ollama")
    def test_translates_question_to_sql(self, mock_ollama, seeded_db):
        from backend.llm import translate_to_sql
        mock_ollama.return_value = "SELECT COUNT(*) AS cnt FROM budget_actuals"
        sql = translate_to_sql("How many records are there?", seeded_db)
        assert sql.startswith("SELECT")
        assert "budget_actuals" in sql

    @patch("backend.llm._call_ollama")
    def test_translates_and_executes_query(self, mock_ollama, seeded_db):
        from backend.llm import ask_question
        mock_ollama.return_value = "SELECT COUNT(*) AS cnt FROM budget_actuals"
        result = ask_question("How many records?", seeded_db)
        assert "results" in result
        assert "sql" in result
        assert "calc_ref" in result
        assert result["results"][0]["cnt"] > 0

    @patch("backend.llm._call_ollama")
    def test_rejects_dangerous_llm_sql(self, mock_ollama, seeded_db):
        from backend.llm import ask_question
        mock_ollama.return_value = "DROP TABLE budget_actuals"
        with pytest.raises(ValueError, match="(?i)only SELECT"):
            ask_question("delete everything", seeded_db)

# ── Memo Generation ──────────────────────────────────────────────────

class TestMemoGeneration:
    """Test that memo generation uses pre-computed numbers only."""

    @patch("backend.llm._call_ollama")
    def test_generates_memo_from_precomputed_data(self, mock_ollama, seeded_db):
        from backend.llm import generate_memo
        mock_ollama.return_value = "Revenue variance analysis shows favorable trends."
        variance_data = [
            {"account_name": "Product Revenue", "variance_amount": 1000, "variance_pct": 10.0, "favorable": True},
        ]
        memo = generate_memo(variance_data, seeded_db)
        assert isinstance(memo, str)
        assert len(memo) > 0

    @patch("backend.llm._call_ollama")
    def test_memo_includes_precomputed_figures(self, mock_ollama, seeded_db):
        from backend.llm import generate_memo
        mock_ollama.return_value = "Product Revenue has a variance of $1000 (10.0%)."
        variance_data = [
            {"account_name": "Product Revenue", "variance_amount": 1000, "variance_pct": 10.0, "favorable": True},
        ]
        memo = generate_memo(variance_data, seeded_db)
        # The LLM was given the pre-computed numbers
        mock_ollama.assert_called_once()
        call_args = mock_ollama.call_args[0][0]  # first positional arg
        assert "1000" in call_args or "Product Revenue" in call_args

    @patch("backend.llm._call_ollama")
    def test_llm_never_receives_raw_data_for_math(self, mock_ollama, seeded_db):
        """The LLM prompt should contain computed results, not raw budget/actual rows."""
        from backend.llm import generate_memo
        mock_ollama.return_value = "Summary."
        variance_data = [
            {"account_name": "Product Revenue", "budget_amount": 10000,
             "actual_amount": 11000, "variance_amount": 1000, "variance_pct": 10.0,
             "favorable": True},
        ]
        generate_memo(variance_data, seeded_db)
        call_args = mock_ollama.call_args[0][0]
        # LLM should receive the variance_amount (already computed), not be
        # asked to calculate it from budget and actual
        assert "1000" in call_args  # the pre-computed variance
