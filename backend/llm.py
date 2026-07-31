"""Ollama LLM integration — NL-to-SQL translation and memo generation.

CRITICAL RULES:
  - The LLM NEVER performs arithmetic. It only translates questions to SQL
    and narrates pre-computed results.
  - All SQL is validated before execution: SELECT only, allowed tables only.
  - All LLM-generated SQL runs through the audit-logged query wrapper.
"""
import json
import re
import httpx
import duckdb

from backend.config import get_settings
from backend.audit import execute_logged


# ── Allowed tables for NL-to-SQL ─────────────────────────────────────

ALLOWED_TABLES = {"budget_actuals", "accounts", "entities", "periods"}

# Schema description for the LLM prompt
SCHEMA_DESC = """
You are a SQL assistant for a Financial Planning & Analysis (FP&A) database.
The database has these tables:

1. budget_actuals (entity_id VARCHAR, account_id VARCHAR, period_id VARCHAR,
   scenario VARCHAR ['budget' or 'actual'], amount DECIMAL)

2. accounts (account_id VARCHAR, account_name VARCHAR,
   account_type VARCHAR ['revenue' or 'expense'], category VARCHAR)

3. entities (entity_id VARCHAR, entity_name VARCHAR)

4. periods (period_id VARCHAR, fiscal_year INTEGER, period_num INTEGER,
   period_label VARCHAR)

Rules:
- Generate ONLY SELECT queries.
- Never use INSERT, UPDATE, DELETE, DROP, ALTER, or CREATE.
- Use proper SQL syntax for DuckDB.
- Return ONLY the SQL query, no explanation.
"""


# ── SQL Validation ───────────────────────────────────────────────────

def validate_sql(sql: str) -> bool:
    """
    Validate that a SQL query is safe: SELECT-only, allowed tables only.

    Args:
        sql: SQL query string to validate.

    Returns:
        True if valid.

    Raises:
        ValueError: If the query is empty, not a SELECT, uses forbidden
                    keywords, or accesses unauthorized tables.
    """
    if not sql or not sql.strip():
        raise ValueError("SQL query is empty")

    sql_stripped = sql.strip()

    # Must start with SELECT (case-insensitive)
    if not sql_stripped.upper().startswith("SELECT"):
        raise ValueError("Only SELECT queries are allowed")

    # Check for forbidden keywords
    forbidden = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE",
                 "TRUNCATE", "MERGE", "ATTACH", "DETACH", "PRAGMA", "COPY",
                 "EXPORT", "IMPORT"]
    sql_upper = sql_stripped.upper()
    for kw in forbidden:
        # Check as whole word
        pattern = r'\b' + kw + r'\b'
        if re.search(pattern, sql_upper):
            raise ValueError(f"Only SELECT queries are allowed (found {kw})")

    # Extract table names after FROM and JOIN
    table_pattern = r'(?:FROM|JOIN)\s+(\w+)'
    found_tables = set(re.findall(table_pattern, sql_upper))

    for table in found_tables:
        if table not in {t.upper() for t in ALLOWED_TABLES}:
            raise ValueError(f"Table '{table.lower()}' is not allowed")

    return True


# ── Ollama API Client ────────────────────────────────────────────────

def _call_ollama(prompt: str) -> str:
    """
    Call the local Ollama API with a text prompt and return the response.

    Args:
        prompt: The text prompt to send to the LLM.

    Returns:
        The LLM's response text.
    """
    settings = get_settings()
    url = f"{settings.ollama_base_url}/api/generate"

    response = httpx.post(
        url,
        json={
            "model": settings.ollama_model,
            "prompt": prompt,
            "stream": False,
        },
        timeout=60.0,
    )
    response.raise_for_status()
    data = response.json()
    return data.get("response", "")


# ── NL-to-SQL ────────────────────────────────────────────────────────

def translate_to_sql(question: str, conn: duckdb.DuckDBPyConnection) -> str:
    """
    Translate a natural language question into a validated SQL query.

    Args:
        question: Plain-English question from the user.
        conn: DuckDB connection (unused for now, but available for schema introspection).

    Returns:
        Validated SQL query string.

    Raises:
        ValueError: If the LLM-generated SQL fails validation.
    """
    prompt = f"{SCHEMA_DESC}\n\nQuestion: {question}\n\nSQL:"
    raw_response = _call_ollama(prompt)

    # Extract SQL from response (may have markdown code fences)
    sql = raw_response.strip()
    if sql.startswith("```"):
        # Remove markdown code fences
        lines = sql.split("\n")
        sql = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
    sql = sql.strip()

    # Validate before returning
    validate_sql(sql)
    return sql


def ask_question(
    question: str,
    conn: duckdb.DuckDBPyConnection,
) -> dict:
    """
    Answer a plain-English question by: translating to SQL, validating,
    executing through the audit-logged wrapper, and returning results.

    Args:
        question: Plain-English question.
        conn: DuckDB connection.

    Returns:
        Dict with: results (list of dicts), sql (str), calc_ref (str).
    """
    sql = translate_to_sql(question, conn)
    results, calc_ref = execute_logged(conn, sql, params={"question": question})
    return {"results": results, "sql": sql, "calc_ref": calc_ref}


# ── Memo Generation ──────────────────────────────────────────────────

def generate_memo(
    variance_data: list[dict],
    conn: duckdb.DuckDBPyConnection,
) -> str:
    """
    Generate a natural-language memo from pre-computed variance results.

    CRITICAL: The LLM receives only the already-computed variance numbers.
    It never sees raw budget/actual figures and is never asked to do math.

    Args:
        variance_data: List of variance result dicts (from calculate_variances).
        conn: DuckDB connection.

    Returns:
        Memo text string.
    """
    # Prepare a summary of pre-computed results for the LLM
    # Only include computed fields, not raw data
    summary_lines = []
    for row in variance_data[:20]:  # Limit to prevent prompt overflow
        summary_lines.append(
            f"- {row['account_name']}: variance ${row['variance_amount']} "
            f"({row['variance_pct']}%), {'favorable' if row['favorable'] else 'unfavorable'}"
        )

    summary_text = "\n".join(summary_lines)

    prompt = f"""You are a financial analyst writing a variance memo.
Below are PRE-COMPUTED variance results. Do NOT perform any calculations.
Simply write a clear, professional memo summarizing these findings.

Variance Results:
{summary_text}

Write a concise memo (3-5 paragraphs) highlighting key variances,
favorable and unfavorable trends, and notable anomalies. Reference the
exact figures provided above. Do not invent numbers."""

    memo = _call_ollama(prompt)
    return memo.strip()
