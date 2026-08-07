"""Tests for Ollama LLM integration — NL-to-SQL translation, SQL
validation, memo generation, and the rule that the LLM never does math.

P1-P3: All LLM functions are now async. Tests use pytest-asyncio markers.
generate_memo signature changed to (conn, session_id) — no more raw data arg.
"""
import os
import tempfile
import pytest
from unittest.mock import patch, MagicMock, AsyncMock

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


# ── NL-to-SQL Translation (P1: async, P3: fallback) ──────────────────

class TestNLToSQL:
    """Test natural language to SQL translation via Ollama."""

    @pytest.mark.asyncio
    @patch("backend.llm._call_ollama", new_callable=AsyncMock)
    async def test_translates_question_to_sql(self, mock_ollama, seeded_db):
        from backend.llm import translate_to_sql
        mock_ollama.return_value = "SELECT COUNT(*) AS cnt FROM budget_actuals"
        sql = await translate_to_sql("How many records are there?", seeded_db)
        assert sql.startswith("SELECT")
        assert "budget_actuals" in sql

    @pytest.mark.asyncio
    @patch("backend.llm._call_ollama", new_callable=AsyncMock)
    async def test_translates_and_executes_query(self, mock_ollama, seeded_db):
        from backend.llm import ask_question
        mock_ollama.return_value = "SELECT COUNT(*) AS cnt FROM budget_actuals"
        result = await ask_question("How many records?", seeded_db)
        assert "results" in result
        assert "sql" in result
        assert result["results"][0]["cnt"] > 0

    @pytest.mark.asyncio
    @patch("backend.llm._call_ollama", new_callable=AsyncMock)
    async def test_rejects_dangerous_llm_sql(self, mock_ollama, seeded_db):
        from backend.llm import ask_question
        mock_ollama.return_value = "DROP TABLE budget_actuals"
        with pytest.raises(ValueError, match="(?i)only SELECT"):
            await ask_question("delete everything", seeded_db)

    @pytest.mark.asyncio
    @patch("backend.llm._call_ollama", new_callable=AsyncMock)
    async def test_fallback_on_empty_sql(self, mock_ollama, seeded_db):
        """P3: Empty LLM response returns graceful fallback message."""
        from backend.llm import ask_question
        mock_ollama.return_value = ""  # LLM couldn't generate anything
        result = await ask_question("how is business looking", seeded_db)
        assert result.get("fallback") is True
        assert "couldn't generate" in result.get("message", "")


# ── Memo Generation (P2: aggregated YTD) ─────────────────────────────

class TestMemoGeneration:
    """Test that memo generation uses pre-computed numbers only.

    P2: generate_memo now takes (conn, session_id), aggregates internally."""

    @pytest.mark.asyncio
    @patch("backend.llm._call_ollama", new_callable=AsyncMock)
    async def test_generates_memo_from_aggregated_data(self, mock_ollama, seeded_db):
        from backend.llm import generate_memo
        mock_ollama.return_value = "Revenue variance analysis shows favorable trends."
        memo = await generate_memo(seeded_db, session_id="default")
        assert isinstance(memo, str)
        assert len(memo) > 0
        # Called once with the aggregated prompt
        mock_ollama.assert_called_once()

    @pytest.mark.asyncio
    @patch("backend.llm._call_ollama", new_callable=AsyncMock)
    async def test_memo_prompt_contains_aggregated_figures(self, mock_ollama, seeded_db):
        from backend.llm import generate_memo
        mock_ollama.return_value = "Summary of variances."
        await generate_memo(seeded_db, session_id="default")
        call_args = mock_ollama.call_args[0][0]
        # Prompt should contain YTD aggregation keywords
        assert "aggregated" in call_args.lower() or "net YTD" in call_args.lower()

    @pytest.mark.asyncio
    @patch("backend.llm._call_ollama", new_callable=AsyncMock)
    async def test_memo_prompt_contains_strict_revenue_expense_rule(self, mock_ollama, seeded_db):
        """P2: Prompt must include the strict revenue-positive/expense-negative rule."""
        from backend.llm import generate_memo
        mock_ollama.return_value = "Understood."
        await generate_memo(seeded_db, session_id="default")
        call_args = mock_ollama.call_args[0][0]
        assert "UNFAVORABLE" in call_args or "unfavorable" in call_args.lower()
