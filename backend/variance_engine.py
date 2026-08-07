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
    AND ba_budget.session_id = ba_actual.session_id
JOIN accounts a
    ON ba_budget.account_id = a.account_id
WHERE ba_budget.scenario = 'budget'
  AND ba_actual.scenario = 'actual'
  AND ba_budget.session_id = ?
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
    AND ba_budget.session_id = ba_actual.session_id
JOIN accounts a
    ON ba_budget.account_id = a.account_id
WHERE ba_budget.scenario = 'budget'
  AND ba_actual.scenario = 'actual'
  AND ba_budget.session_id = ?
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
    A1: Audit is mandatory. Always log to calculation_log with dedup.
    Returns result_ref hash.
    """
    from backend.audit import _is_duplicate

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

    return result_ref


# ── Public API ───────────────────────────────────────────────────────

def calculate_variances(conn: duckdb.DuckDBPyConnection, session_id: str = "default") -> list[dict]:
    """
    Calculate budget-vs-actuals variances for a specific session.
    """
    result = conn.execute(VARIANCE_SQL, [session_id])
    rows = result.fetchall()
    columns = [d[0] for d in result.description]

    results = []
    for row in rows:
        row_dict = dict(zip(columns, row))
        results.append(row_dict)

    calc_ref = _log_query(conn, VARIANCE_SQL, {"session_id": session_id}, results)
    for r in results:
        r["calc_ref"] = calc_ref

    return results


def detect_anomalies(
    conn: duckdb.DuckDBPyConnection,
    threshold_pct: float = 10.0,
    session_id: str = "default",
) -> list[dict]:
    """
    Detect variances exceeding the given threshold for a specific session.
    """
    sql = ANOMALY_SQL.format(threshold=threshold_pct)
    result = conn.execute(sql, [session_id])
    rows = result.fetchall()
    columns = [d[0] for d in result.description]

    results = []
    for row in rows:
        row_dict = dict(zip(columns, row))
        results.append(row_dict)

    params = {"threshold_pct": threshold_pct, "session_id": session_id}
    calc_ref = _log_query(conn, sql, params, results)
    for r in results:
        r["calc_ref"] = calc_ref

    # A2.3: Anomaly audit is mutation-driven. Logging happens in the
    # upload handler (main.py) after CSV ingestion — NOT here on every
    # read/fetch call. This prevents audit spam from polling/page loads.

    return results


# ── T1: Mathematical Engine — Timeseries & Regional ──────────────────

TIMESERIES_SQL = """
SELECT
    ba_budget.period_id,
    SUM(ba_budget.amount) AS total_budget,
    SUM(ba_actual.amount) AS total_actual,
    SUM(ba_actual.amount) - SUM(ba_budget.amount) AS variance_amount,
    CASE
        WHEN SUM(ba_budget.amount) = 0 THEN NULL
        ELSE ROUND(
            ((SUM(ba_actual.amount) - SUM(ba_budget.amount)) / SUM(ba_budget.amount)) * 100, 2
        )
    END AS variance_pct
FROM budget_actuals ba_budget
JOIN budget_actuals ba_actual
    ON ba_budget.entity_id  = ba_actual.entity_id
    AND ba_budget.account_id = ba_actual.account_id
    AND ba_budget.period_id  = ba_actual.period_id
    AND ba_budget.session_id = ba_actual.session_id
WHERE ba_budget.scenario = 'budget'
  AND ba_actual.scenario = 'actual'
  AND ba_budget.session_id = ?
GROUP BY ba_budget.period_id
ORDER BY ba_budget.period_id
"""

REGIONAL_SQL = """
SELECT
    ba_budget.entity_id,
    SUM(ba_budget.amount) AS total_budget,
    SUM(ba_actual.amount) AS total_actual,
    SUM(ba_actual.amount) - SUM(ba_budget.amount) AS variance_amount,
    CASE
        WHEN SUM(ba_budget.amount) = 0 THEN NULL
        ELSE ROUND(
            ((SUM(ba_actual.amount) - SUM(ba_budget.amount)) / SUM(ba_budget.amount)) * 100, 2
        )
    END AS variance_pct
FROM budget_actuals ba_budget
JOIN budget_actuals ba_actual
    ON ba_budget.entity_id  = ba_actual.entity_id
    AND ba_budget.account_id = ba_actual.account_id
    AND ba_budget.period_id  = ba_actual.period_id
    AND ba_budget.session_id = ba_actual.session_id
WHERE ba_budget.scenario = 'budget'
  AND ba_actual.scenario = 'actual'
  AND ba_budget.session_id = ?
GROUP BY ba_budget.entity_id
ORDER BY ba_budget.entity_id
"""


def calculate_timeseries(
    conn: duckdb.DuckDBPyConnection,
    session_id: str = "default",
    moving_avg_window: int = 3,
) -> list[dict]:
    """
    Return period-level aggregated variance with cumulative YTD and
    moving average. Window size controls the trailing-average period count.
    """
    result = conn.execute(TIMESERIES_SQL, [session_id])
    rows = result.fetchall()
    columns = [d[0] for d in result.description]
    periods = [dict(zip(columns, row)) for row in rows]

    cumulative = 0.0
    for i, p in enumerate(periods):
        cumulative += float(p.get("variance_amount", 0) or 0)
        p["cumulative_ytd"] = round(cumulative, 2)

        # Strict historical moving average — only uses past data (no future)
        window_start = max(0, i - moving_avg_window + 1)
        window_actuals = [
            float(periods[j].get("total_actual", 0) or 0)
            for j in range(window_start, i + 1)
        ]
        p["moving_avg_actual"] = round(
            sum(window_actuals) / len(window_actuals), 2
        ) if window_actuals else 0.0

    calc_ref = _log_query(conn, TIMESERIES_SQL, {"session_id": session_id}, periods)
    for p in periods:
        p["calc_ref"] = calc_ref

    return periods


def calculate_regional(
    conn: duckdb.DuckDBPyConnection,
    session_id: str = "default",
) -> list[dict]:
    """
    Return entity-level (regional) aggregated budget vs actual.
    """
    result = conn.execute(REGIONAL_SQL, [session_id])
    rows = result.fetchall()
    columns = [d[0] for d in result.description]
    results = [dict(zip(columns, row)) for row in rows]

    calc_ref = _log_query(conn, REGIONAL_SQL, {"session_id": session_id}, results)
    for r in results:
        r["calc_ref"] = calc_ref

    return results
