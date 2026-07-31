"""Audit & traceability layer — query wrapper that auto-logs every SQL
execution, result_ref lookup, and paginated audit log access."""
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
    Execute a SQL query and automatically log it to calculation_log.

    Args:
        conn: DuckDB connection.
        sql: SQL query string.
        params: Optional dict of parameters for audit logging.

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
    result_str = json.dumps(results, default=str)

    hash_input = f"{sql}|{params_json}|{result_str}"
    result_ref = hashlib.sha256(hash_input.encode()).hexdigest()[:16]

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
    """
    Look up a single audit log entry by result_ref.

    Args:
        conn: DuckDB connection.
        result_ref: The result reference hash to look up.

    Returns:
        Dict with log_id, sql_query, params_json, timestamp, result_ref,
        or None if not found.
    """
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
    """
    Get a paginated audit log, most recent first.

    Args:
        conn: DuckDB connection.
        limit: Max entries to return.
        offset: Number of entries to skip.

    Returns:
        List of audit log entry dicts.
    """
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
