"""Audit & traceability layer — query wrapper that auto-logs every SQL
execution to calculation_log, but ONLY when audit logging is enabled
via the settings table (defaults to OFF)."""
import json
import hashlib
from datetime import datetime, timezone

import duckdb


def execute_logged(
    conn: duckdb.DuckDBPyConnection,
    sql: str,
    params: dict | None = None,
) -> tuple[list[dict], str]:
    """
    Execute a SQL query. Only logs to calculation_log if audit is enabled.
    When audit is OFF, returns a transient hash as result_ref.

    Args:
        conn: DuckDB connection.
        sql: SQL query string.
        params: Optional dict of parameters.

    Returns:
        Tuple of (result_rows as list of dicts, result_ref string).
    """
    # If params dict is provided, pass values as positional args only if
    # the SQL contains placeholders
    if params and "?" in sql:
        param_values = list(params.values())
        rows = conn.execute(sql, param_values).fetchall()
    else:
        rows = conn.execute(sql).fetchall()
    columns = [d[0] for d in conn.description]
    results = [dict(zip(columns, row)) for row in rows]

    params_json = json.dumps(params, default=str) if params else json.dumps({})
    hash_input = f"{sql}|{params_json}"
    result_ref = hashlib.sha256(hash_input.encode()).hexdigest()[:16]

    # Only log to calculation_log if audit is explicitly enabled
    from backend.settings import is_audit_enabled
    if is_audit_enabled(conn):
        existing = conn.execute(
            "SELECT result_ref FROM calculation_log WHERE result_ref = ? LIMIT 1",
            [result_ref]
        ).fetchone()
        if not existing:
            conn.execute(
                "INSERT INTO calculation_log (log_id, sql_query, params_json, timestamp, result_ref) "
                "VALUES (nextval('seq_calculation_log'), ?, ?, CURRENT_TIMESTAMP, ?)",
                [sql, params_json, result_ref]
            )

    return results, result_ref


def get_audit_entry(
    conn: duckdb.DuckDBPyConnection,
    result_ref: str,
) -> dict | None:
    """Look up a single audit log entry by result_ref."""
    row = conn.execute(
        "SELECT log_id, sql_query, params_json, timestamp, result_ref "
        "FROM calculation_log WHERE result_ref = ?",
        [result_ref]
    ).fetchone()
    if row is None:
        return None
    return {
        "log_id": row[0],
        "sql_query": row[1],
        "params_json": row[2],
        "timestamp": row[3],
        "result_ref": row[4],
    }


def get_audit_log(
    conn: duckdb.DuckDBPyConnection,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """Get a paginated audit log, most recent first."""
    rows = conn.execute(
        "SELECT log_id, sql_query, params_json, timestamp, result_ref "
        "FROM calculation_log "
        "ORDER BY log_id DESC "
        "LIMIT ? OFFSET ?",
        [limit, offset]
    ).fetchall()
    return [
        {
            "log_id": r[0],
            "sql_query": r[1],
            "params_json": r[2],
            "timestamp": r[3],
            "result_ref": r[4],
        }
        for r in rows
    ]


def clear_audit_log(conn: duckdb.DuckDBPyConnection) -> int:
    """Delete all entries from calculation_log. Returns count deleted."""
    count = conn.execute("SELECT COUNT(*) FROM calculation_log").fetchone()[0]
    conn.execute("DELETE FROM calculation_log")
    conn.execute("ALTER SEQUENCE seq_calculation_log RESTART WITH 1")
    return count
