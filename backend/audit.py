"""Audit & traceability layer — query wrapper that auto-logs every SQL
execution to calculation_log, but ONLY when audit logging is enabled
via the settings table (defaults to OFF).

Deduplication: a time-windowed in-memory cache prevents identical
queries from generating duplicate log entries within 60 seconds.
"""
import json
import hashlib
import time
from datetime import datetime, timezone

import duckdb

# Time-windowed dedup cache: (sql_hash, params_hash) → timestamp
# Prevents duplicate calculation_log entries from polling cycles.
_DEDUP_CACHE: dict[tuple[str, str], float] = {}
_DEDUP_WINDOW_SECONDS = 60


def _is_duplicate(sql: str, params_json: str) -> bool:
    """Return True if this exact query was logged within the dedup window."""
    key = (
        hashlib.sha256(sql.encode()).hexdigest(),
        hashlib.sha256(params_json.encode()).hexdigest(),
    )
    now = time.time()
    # Clean expired entries
    for k in list(_DEDUP_CACHE.keys()):
        if now - _DEDUP_CACHE[k] > _DEDUP_WINDOW_SECONDS:
            del _DEDUP_CACHE[k]
    if key in _DEDUP_CACHE:
        return True
    _DEDUP_CACHE[key] = now
    return False


def _clear_dedup_cache() -> None:
    """Reset the dedup cache (used in tests)."""
    _DEDUP_CACHE.clear()


def execute_logged(
    conn: duckdb.DuckDBPyConnection,
    sql: str,
    params: dict | None = None,
) -> tuple[list[dict], str]:
    """
    A1: Audit is mandatory. Always logs to calculation_log.
    Execute SQL, compute result_ref hash, deduplicate, insert.

    Returns:
        Tuple of (result_rows as list of dicts, result_ref string).
    """
    if params and "?" in sql:
        param_values = list(params.values())
        result = conn.execute(sql, param_values)
    else:
        result = conn.execute(sql)
    rows = result.fetchall()
    columns = [d[0] for d in result.description]
    results = [dict(zip(columns, row)) for row in rows]

    params_json = json.dumps(params, default=str) if params else json.dumps({})
    hash_input = f"{sql}|{params_json}"
    result_ref = hashlib.sha256(hash_input.encode()).hexdigest()[:16]

    if not _is_duplicate(sql, params_json):
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
    # DuckDB 1.x doesn't support ALTER SEQUENCE RESTART; drop + recreate
    try:
        conn.execute("ALTER SEQUENCE seq_calculation_log RESTART WITH 1")
    except Exception:
        conn.execute("DROP SEQUENCE IF EXISTS seq_calculation_log")
        conn.execute("CREATE SEQUENCE seq_calculation_log START 1")
    return count
