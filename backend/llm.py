"""Ollama LLM integration — NL-to-SQL translation and memo generation.

CRITICAL RULES:
  - The LLM NEVER performs arithmetic. It only translates questions to SQL
    and narrates pre-computed results.
  - All SQL is validated before execution: SELECT only, allowed tables only.
  - All LLM-generated SQL runs through the audit-logged query wrapper.

P1: Async httpx — FastAPI client disconnection cancels downstream Ollama call.
P2: Aggregated YTD data for memos — no per-period confusion.
P3: Empty SQL fallback — graceful error message instead of crash.
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
You are a DuckDB SQL expert for a Financial Planning & Analysis (FP&A) database.

CRITICAL — the ONLY table you can query is budget_actuals. Its EXACT columns are:
  session_id VARCHAR
  entity_id VARCHAR
  account_id VARCHAR
  period_id VARCHAR
  scenario VARCHAR  -- 'actual' or 'budget'
  amount DECIMAL

THERE IS NO account_type column. To classify revenue vs expense, you MUST use
LIKE on account_id:

  Revenue accounts:
    LOWER(account_id) LIKE '%revenue%' OR LOWER(account_id) LIKE '%sales%'
       OR LOWER(account_id) LIKE '%income%'

  Expense accounts:
    LOWER(account_id) LIKE '%expense%' OR LOWER(account_id) LIKE '%cost%'
       OR LOWER(account_id) LIKE '%fee%' OR LOWER(account_id) LIKE '%salary%'
       OR LOWER(account_id) LIKE '%payroll%' OR LOWER(account_id) LIKE '%rent%'
       OR LOWER(account_id) LIKE '%util%' OR LOWER(account_id) LIKE '%marketing%'

SESSION ISOLATION: EVERY query MUST include
  WHERE session_id = '<the_session_id_value>'
to prevent data leakage across sessions. The session_id is passed in the
question context below.

STRICT RULES:
- Generate ONLY SELECT queries.
- Never use INSERT, UPDATE, DELETE, DROP, ALTER, or CREATE.
- Use proper DuckDB SQL syntax.
- Return ONLY the SQL query, no explanation.
- Do NOT JOIN the accounts table — classify via account_id LIKE patterns.
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


# ── Ollama API Client (P1: async with cancellation) ──────────────────

async def _call_ollama(prompt: str, conn=None) -> str:
    """
    P1: Async call to local Ollama. When FastAPI cancels the request
    (client disconnect), the async context cancels and httpx aborts
    the in-flight generation.
    """
    base_url = "http://localhost:11434"
    model = "qwen2.5"

    if conn is not None:
        from backend.settings import get_settings_dict
        s = get_settings_dict(conn)
        if s.get("ollama_base_url"):
            base_url = s["ollama_base_url"]
        if s.get("ollama_model"):
            model = s["ollama_model"]
    else:
        settings = get_settings()
        base_url = settings.ollama_base_url
        model = settings.ollama_model

    url = f"{base_url}/api/generate"

    async with httpx.AsyncClient(timeout=None) as client:
        response = await client.post(
            url,
            json={
                "model": model,
                "prompt": prompt,
                "stream": False,
            },
        )
        response.raise_for_status()
        data = response.json()
        return data.get("response", "")


# ── NL-to-SQL ────────────────────────────────────────────────────────

async def translate_to_sql(question: str, conn: duckdb.DuckDBPyConnection, session_id: str = "default") -> str:
    """
    Translate a natural language question into a validated SQL query.

    Args:
        question: Plain-English question from the user.
        conn: DuckDB connection (unused for now, but available for schema introspection).
        session_id: Active session ID — injected into the prompt so the LLM
                    uses the real UUID, not a literal placeholder.

    Returns:
        Validated SQL query string.

    Raises:
        ValueError: If the LLM-generated SQL fails validation or is empty.
    """
    prompt = f"{SCHEMA_DESC}\n\nThe active session_id is: {session_id}\n\nQuestion: {question}\n\nSQL:"
    raw_response = await _call_ollama(prompt, conn)

    # Extract SQL from response (may have markdown code fences)
    sql = raw_response.strip()
    if sql.startswith("```"):
        # Remove markdown code fences
        lines = sql.split("\n")
        sql = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
    sql = sql.strip()

    # P3: Validate before raising — return a sentinel for empty SQL
    if not sql or not sql.strip():
        raise ValueError("EMPTY_SQL")

    # Validate before returning
    validate_sql(sql)
    return sql


async def ask_question(
    question: str,
    conn: duckdb.DuckDBPyConnection,
    session_id: str = "default",
) -> dict:
    """
    Answer a plain-English question by: translating to SQL, validating,
    executing through the audit-logged wrapper, and returning results.

    P3: If the LLM can't generate valid SQL, return a graceful fallback
    message instead of crashing.

    Args:
        question: Plain-English question.
        conn: DuckDB connection.
        session_id: Active session — injected into prompt and query params.

    Returns:
        Dict with: results (list of dicts), sql (str), calc_ref (str).
    """
    try:
        sql = await translate_to_sql(question, conn, session_id)
    except ValueError as e:
        if "EMPTY_SQL" in str(e):
            # P3: Graceful fallback — LLM couldn't generate a query
            return {
                "results": [],
                "sql": "",
                "calc_ref": None,
                "fallback": True,
                "message": (
                    "I couldn't generate a specific data query for that question. "
                    "Could you rephrase it to be more specific about the accounts, "
                    "entities, or periods you want to analyze?"
                ),
            }
        raise

    results, calc_ref = execute_logged(conn, sql, params={"question": question})
    return {"results": results, "sql": sql, "calc_ref": calc_ref}


# ── Memo Generation (P2: aggregated YTD + strict prompt) ────────────

async def generate_memo(
    conn: duckdb.DuckDBPyConnection,
    session_id: str = "default",
) -> str:
    """
    P2: Generate a natural-language memo from AGGREGATED YTD variances.

    Instead of feeding per-period rows (which confuse the LLM into
    seeing "conflicting signs"), we aggregate by account_id across
    all periods and feed the net totals.

    CRITICAL: The LLM receives only the already-computed variance numbers.
    It never sees raw budget/actual figures and is never asked to do math.

    Args:
        conn: DuckDB connection.
        session_id: Session to generate memo for.

    Returns:
        Memo text string.
    """
    from backend.variance_engine import calculate_variances

    # Get aggregated YTD variances
    variances = calculate_variances(conn, session_id=session_id)

    # P2: Aggregate by account_id across all periods
    by_account = {}
    for v in variances:
        aid = v["account_name"]
        if aid not in by_account:
            by_account[aid] = {
                "account_name": aid,
                "account_type": v["account_type"],
                "total_variance": 0.0,
                "total_variance_pct": 0.0,
                "total_budget": 0.0,
                "total_actual": 0.0,
                "count": 0,
            }
        by_account[aid]["total_variance"] += float(v["variance_amount"])
        by_account[aid]["total_budget"] += float(v.get("budget_amount", 0) or 0)
        by_account[aid]["total_actual"] += float(v.get("actual_amount", 0) or 0)
        by_account[aid]["count"] += 1

    # Compute aggregate variance percentages
    for aid, agg in by_account.items():
        if agg["count"] > 0:
            agg["total_variance_pct"] = sum(
                v["variance_pct"] for v in variances if v["account_name"] == aid
            ) / agg["count"]
        # Determine if favorable (revenue up = favorable, expense down = favorable)
        if agg["account_type"] == "revenue":
            agg["favorable"] = agg["total_variance"] >= 0
        else:
            agg["favorable"] = agg["total_variance"] <= 0

    # Sort by absolute variance amount (largest first)
    sorted_accounts = sorted(
        by_account.values(),
        key=lambda a: abs(a["total_variance"]),
        reverse=True,
    )

    # Build summary from aggregated data
    summary_lines = []
    for row in sorted_accounts[:20]:
        fav_word = "favorable" if row["favorable"] else "unfavorable"
        summary_lines.append(
            f"- {row['account_name']} ({row['account_type']}): "
            f"net YTD variance ${row['total_variance']:,.2f} "
            f"(~{row['total_variance_pct']:.1f}%), {fav_word}"
        )

    summary_text = "\n".join(summary_lines)

    prompt = f"""You are a financial analyst writing a variance memo.
Below are PRE-COMPUTED Year-to-Date aggregated variance results.
Do NOT perform any calculations. Do NOT mention "conflicting signs"
or per-period fluctuations — these are NET totals.

CRITICAL: Positive numbers for REVENUE accounts are favorable (earned more).
Positive numbers for EXPENSE accounts are UNFAVORABLE (overspent).
Negative numbers for revenue are unfavorable (shortfall).
Negative numbers for expense are favorable (saved money).
Interpret these correctly in your memo.

Variance Results (aggregated YTD):
{summary_text}

Write a concise memo (3-5 paragraphs) highlighting key variances,
favorable and unfavorable trends, and notable anomalies. Reference the
exact figures provided above. Do not invent numbers."""

    memo = await _call_ollama(prompt, conn)
    return memo.strip()
