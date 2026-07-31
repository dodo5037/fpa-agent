"""Variance engine — deterministic SQL-based budget-vs-actuals variance
calculations with automatic audit logging to calculation_log.

FP&A rules:
  - Revenue: positive variance (actual > budget) = favorable
  - Expense: positive variance (actual > budget) = unfavorable
"""
import json
import hashlib
from datetime import datetime, timezone

import duckdb


# ── SQL Queries ──────────────────────────────────────────────────────

VARIANCE_SQL = """
SELECT
    ba_budget.entity_id,
    ba_budget.account_id,
    ba_budget.period_id,
    a.account_type,
    a.account_name,
    ba_budget.amount  AS budget_amount,
    ba_actual.amount  AS actual_amount,
    (ba_actual.amount - ba_budget.amount) AS variance_amount,
    CASE
        WHEN ba_budget.amount = 0 THEN NULL
        ELSE ROUND(
            ((ba_actual.amount - ba_budget.amount) / ba_budget.amount) * 100, 2
        )
    END AS variance_pct,
    CASE
        WHEN a.account_type = 'revenue' AND (ba_actual.amount - ba_budget.amount) > 0 THEN TRUE
        WHEN a.account_type = 'expense' AND (ba_actual.amount - ba_budget.amount) < 0 THEN TRUE
        ELSE FALSE
    END AS favorable
FROM budget_actuals ba_budget
JOIN budget_actuals ba_actual
    ON ba_budget.entity_id  = ba_actual.entity_id
    AND ba_budget.account_id = ba_actual.account_id
    AND ba_budget.period_id  = ba_actual.period_id
JOIN accounts a
    ON ba_budget.account_id = a.account_id
WHERE ba_budget.scenario = 'budget'
  AND ba_actual.scenario = 'actual'
ORDER BY ba_budget.entity_id, ba_budget.period_id, ba_budget.account_id
"""

ANOMALY_SQL = """
SELECT
    ba_budget.entity_id,
    ba_budget.account_id,
    ba_budget.period_id,
    a.account_type,
    a.account_name,
    ba_budget.amount  AS budget_amount,
    ba_actual.amount  AS actual_amount,
    (ba_actual.amount - ba_budget.amount) AS variance_amount,
    CASE
        WHEN ba_budget.amount = 0 THEN NULL
        ELSE ROUND(
            ((ba_actual.amount - ba_budget.amount) / ba_budget.amount) * 100, 2
        )
    END AS variance_pct,
    CASE
        WHEN a.account_type = 'revenue' AND (ba_actual.amount - ba_budget.amount) > 0 THEN TRUE
        WHEN a.account_type = 'expense' AND (ba_actual.amount - ba_budget.amount) < 0 THEN TRUE
        ELSE FALSE
    END AS favorable
FROM budget_actuals ba_budget
JOIN budget_actuals ba_actual
    ON ba_budget.entity_id  = ba_actual.entity_id
    AND ba_budget.account_id = ba_actual.account_id
    AND ba_budget.period_id  = ba_actual.period_id
JOIN accounts a
    ON ba_budget.account_id = a.account_id
WHERE ba_budget.scenario = 'budget'
  AND ba_actual.scenario = 'actual'
  AND ba_budget.amount != 0
  AND ABS(
      ((ba_actual.amount - ba_budget.amount) / ba_budget.amount) * 100
  ) >= {threshold}
ORDER BY ABS(
      ((ba_actual.amount - ba_budget.amount) / ba_budget.amount) * 100
  ) DESC
"""


# ── Audit Logging ────────────────────────────────────────────────────

def _log_query(
    conn: duckdb.DuckDBPyConnection,
    sql: str,
    params: dict | None,
    result_rows: list[dict],
) -> str:
    """
    Log a query to calculation_log ONLY if audit is enabled.
    Returns result_ref hash regardless (for UI linking).
    """
    from backend.settings import is_audit_enabled

    params_json = json.dumps(params, default=str) if params else json.dumps({})
    hash_input = f"{sql}|{params_json}"
    result_ref = hashlib.sha256(hash_input.encode()).hexdigest()[:16]

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

    return result_ref


# ── Public API ───────────────────────────────────────────────────────

def calculate_variances(conn: duckdb.DuckDBPyConnection) -> list[dict]:
    """
    Calculate budget-vs-actuals variances for all entities/accounts/periods.

    Every query is automatically logged to calculation_log.

    Returns:
        List of dicts with keys: entity_id, account_id, period_id,
        account_type, account_name, budget_amount, actual_amount,
        variance_amount, variance_pct, favorable, calc_ref.
    """
    rows = conn.execute(VARIANCE_SQL).fetchall()
    columns = [d[0] for d in conn.description]

    results = []
    for row in rows:
        row_dict = dict(zip(columns, row))
        results.append(row_dict)

    # Audit log
    calc_ref = _log_query(conn, VARIANCE_SQL, None, results)

    # Attach calc_ref to each result row
    for r in results:
        r["calc_ref"] = calc_ref

    return results


def detect_anomalies(
    conn: duckdb.DuckDBPyConnection,
    threshold_pct: float = 10.0,
) -> list[dict]:
    """
    Detect variances exceeding the given threshold percentage.

    Every query is automatically logged to calculation_log.

    Args:
        conn: DuckDB connection.
        threshold_pct: Minimum absolute variance % to flag as anomaly.

    Returns:
        List of anomaly dicts with keys: entity_id, account_id, period_id,
        account_type, account_name, budget_amount, actual_amount,
        variance_amount, variance_pct, favorable, calc_ref.
    """
    sql = ANOMALY_SQL.format(threshold=threshold_pct)

    rows = conn.execute(sql).fetchall()
    columns = [d[0] for d in conn.description]

    results = []
    for row in rows:
        row_dict = dict(zip(columns, row))
        results.append(row_dict)

    # Audit log
    params = {"threshold_pct": threshold_pct}
    calc_ref = _log_query(conn, sql, params, results)

    # Attach calc_ref
    for r in results:
        r["calc_ref"] = calc_ref

    return results
